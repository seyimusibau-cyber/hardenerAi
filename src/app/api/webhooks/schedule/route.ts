import { handleError } from '@/lib/error-handler';
import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { Client } from '@upstash/qstash';
import { createClient } from '@supabase/supabase-js';

const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});
const qstash = new Client({ token: process.env.QSTASH_TOKEN || '' });
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Invoked on a fixed QStash schedule (e.g. hourly). Fans out any due re-scans.
export async function POST(req: Request) {
    try {
        const body = await req.text();
        const signature = req.headers.get('upstash-signature');
        if (!signature || !(await receiver.verify({ signature, body }))) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const nowIso = new Date().toISOString();
        const { data: due } = await supabaseAdmin
            .from('scheduled_scans')
            .select('*')
            .eq('active', true)
            .lte('next_run_at', nowIso);

        let dispatched = 0;
        for (const s of due ?? []) {
            const { data: scan } = await supabaseAdmin.from('scans').insert({
                user_id: s.user_id, target_url: s.target_url, status: 'Queued', progress: 0,
            }).select().single();
            if (!scan) continue;

            await qstash.publishJSON({
                url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/qstash`,
                body: { scanId: scan.id, targetUrl: s.target_url },
            });

            const next = new Date(Date.now() + s.interval_hours * 3600_000).toISOString();
            await supabaseAdmin.from('scheduled_scans')
                .update({ last_run_at: nowIso, next_run_at: next }).eq('id', s.id);
            dispatched++;
        }
        return NextResponse.json({ success: true, dispatched });
    } catch (err) {
        console.error('Schedule cron error:', err);
        return handleError(err);
    }
}
