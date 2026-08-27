import { handleError } from '@/lib/error-handler';
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

    // 3. Trigger Fly.io Machine (Ephemeral Docker Worker)
    // The worker will pull the code/target, run Semgrep/Gitleaks/Nmap, and write SARIF to Supabase Storage.
    const flyToken = process.env.FLY_API_TOKEN;
    const flyApp = process.env.FLY_APP_NAME;

    if (flyToken && flyApp) {
        await fetch(`https://api.machines.dev/v1/apps/${flyApp}/machines`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${flyToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                config: {
                    image: 'registry.fly.io/hardener-scanner:latest',
                    // Only per-scan vars are passed here. Static secrets
                    // (GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY) are
                    // set once as Fly app secrets and inherited by the machine,
                    // so the service-role key never travels in this payload.
                    //   fly secrets set GEMINI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
                    env: {
                        SCAN_ID: scanId,
                        TARGET_URL: targetUrl,
                    },
                    auto_destroy: true, // Machine deletes itself after exit
                }
            })
        });
    } else {
        console.log('Skipping Fly.io machine creation - missing tokens. Simulating for dev.');
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('QStash Webhook Error:', err);
    return handleError(err);
  }
}
