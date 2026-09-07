import { handleError } from '@/lib/error-handler';
import { dispatchScan, RunnerUnavailableError, RunnerBusyError } from '@/lib/runner';
import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { createClient } from '@supabase/supabase-js';

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req: Request) {
  try {
    // 1. Verify QStash Signature
    const body = await req.text();
    const signature = req.headers.get('upstash-signature');
    
    if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    
    const isValid = await receiver.verify({
        signature,
        body,
    });
    
    if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Parse payload
    const payload = JSON.parse(body);
    const { scanId, targetUrl } = payload;

    if (!scanId || !targetUrl) {
        return NextResponse.json({ error: 'Missing scan payload' }, { status: 400 });
    }

    // Idempotency: QStash retries on non-2xx. Only a still-Queued scan may be
    // started, so a retry after we've already begun doesn't spawn a second
    // machine or double-process. The status flip also acts as the claim.
    const { data: claimed } = await supabaseAdmin
        .from('scans')
        .update({ status: 'Running' })
        .eq('id', scanId)
        .eq('status', 'Queued')
        .select('id')
        .maybeSingle();

    if (!claimed) {
        return NextResponse.json({ success: true, skipped: 'already processed' });
    }

    // 3. Hand the scan to a runner. A scan we cannot run must be marked
    // Failed here -- leaving it Running with nothing running it is the state
    // this webhook used to produce on every deploy without a Fly token.
    try {
        const runner = await dispatchScan(scanId, targetUrl);
        return NextResponse.json({ success: true, runner });
    } catch (dispatchErr) {
        // Transient: the runner exists but was starting up or busy. Leave the
        // scan Queued and answer non-2xx so QStash retries it. Marking it
        // Failed here would turn a 50-second cold start into a dead scan.
        if (dispatchErr instanceof RunnerBusyError) {
            await supabaseAdmin
                .from('scans')
                .update({ status: 'Queued' })
                .eq('id', scanId);
            console.warn('QStash dispatch deferred:', dispatchErr.message);
            return NextResponse.json(
                { success: false, retrying: true, error: dispatchErr.message },
                { status: 503 }
            );
        }
        const reason = dispatchErr instanceof RunnerUnavailableError
            ? dispatchErr.message
            : 'The scan could not be handed to a runner.';
        await supabaseAdmin
            .from('scans')
            .update({ status: 'Failed', progress: 100, error_message: reason.slice(0, 500) })
            .eq('id', scanId);
        console.error('QStash dispatch failed:', dispatchErr);
        // 200 on purpose: a missing runner is a configuration problem, and a
        // QStash retry storm will not conjure one. The scan already says why.
        return NextResponse.json({ success: false, error: reason }, { status: 200 });
    }
  } catch (err) {
    console.error('QStash Webhook Error:', err);
    return handleError(err);
  }
}
