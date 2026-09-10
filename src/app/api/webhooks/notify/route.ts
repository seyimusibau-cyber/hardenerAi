import { timingSafeEqual } from 'crypto';
import { handleError } from '@/lib/error-handler';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSlack, sendEmail, scanAlert } from '@/lib/notifier';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Constant-time secret comparison.
 *
 * `a !== b` on strings returns as soon as two bytes differ, which leaks the
 * length and a byte-by-byte oracle to anyone who can time the response. This
 * route is exempt from the session check in middleware, so this comparison is
 * the ONLY thing standing in front of a service-role Supabase client.
 */
function secretMatches(presented: string | null): boolean {
    const expected = process.env.NOTIFY_SECRET;
    // An unset secret must refuse everything. Comparing against '' or
    // undefined would let a caller in by sending nothing at all.
    if (!expected || !presented) return false;

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    // timingSafeEqual throws on a length mismatch, which is itself an oracle;
    // hash both sides to a fixed width first.
    if (a.length !== b.length) {
        // Still burn a comparison so the "wrong length" path is not the fast one.
        timingSafeEqual(b, b);
        return false;
    }
    return timingSafeEqual(a, b);
}

// Called by the scanner worker when a scan finishes. Shared-secret auth (the
// worker is trusted infra, not a browser). Sends alerts for any active schedule
// that matches this scan's target.
export async function POST(req: Request) {
    try {
        if (!secretMatches(req.headers.get('x-vultix-secret'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const { scanId } = await req.json();
        if (!scanId) return NextResponse.json({ error: 'scanId required' }, { status: 400 });

        const { data: scan } = await supabaseAdmin.from('scans').select('*').eq('id', scanId).single();
        if (!scan || scan.status !== 'Completed') return NextResponse.json({ skipped: true });

        const { data: schedules } = await supabaseAdmin.from('scheduled_scans')
            .select('*').eq('user_id', scan.user_id).eq('target_url', scan.target_url).eq('active', true);

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
        const text = scanAlert(scan.target_url, scan.grade, scan.vulns_found, appUrl, scan.id);
        let sent = 0;
        for (const s of schedules ?? []) {
            if (s.notify_slack_webhook && await sendSlack(s.notify_slack_webhook, text)) sent++;
            if (s.notify_email && await sendEmail(s.notify_email, `Vultix scan: ${scan.target_url}`, `<pre>${text}</pre>`)) sent++;
        }
        return NextResponse.json({ success: true, sent });
    } catch (err) {
        console.error('Notify error:', err);
        return handleError(err);
    }
}
