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

    // Update scan status to 'Running'
    await supabaseAdmin.from('scans').update({ status: 'Running' }).eq('id', scanId);

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
                    env: {
                        SCAN_ID: scanId,
                        TARGET_URL: targetUrl,
                        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
                        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
                    },
                    auto_destroy: true, // Machine deletes itself after exit
                }
            })
        });
    } else {
        console.log('Skipping Fly.io machine creation - missing tokens. Simulating for dev.');
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('QStash Webhook Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
