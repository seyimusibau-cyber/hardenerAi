import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { rateLimit } from '@/lib/rate-limiter';
import { UrlSchema } from '@/lib/sanitization';
import { Client } from '@upstash/qstash';

const qstash = new Client({
    token: process.env.QSTASH_TOKEN || '',
});

export async function POST(request: Request) {
    let user: any = null;
    try {
        const supabase = await createClient();
        const authResult = await supabase.auth.getUser();
        user = authResult?.data?.user || null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate Limiting
        const rateLimitIdentifier = user.id;
        const rateLimitResponse = await rateLimit(
            request as NextRequest,
            rateLimitIdentifier,
            10, 
            60000
        );
        
        if (rateLimitResponse) return rateLimitResponse;

        // Input Validation
        const body = await request.json();
        const { targetUrl } = body;

        const validation = UrlSchema.safeParse(targetUrl);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }

        const normalized = validation.data.trim();
        const urlObj = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`);
        const hostname = urlObj.hostname;

        // 1. Target Blacklisting
        const restrictedTlds = ['.gov', '.mil'];
        const isRestrictedTld = restrictedTlds.some(tld => hostname.endsWith(tld));
        const restrictedDomains = ['aws.amazon.com', 'google.com', 'azure.com', 'chase.com'];
        const isRestrictedDomain = restrictedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));

        if (isRestrictedTld || isRestrictedDomain) {
            // Check for admin override
            const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            if (adminProfile?.role !== 'admin') {
                return NextResponse.json({ error: 'Target domain is blacklisted and restricted from scanning.' }, { status: 403 });
            }
        }

        // 2. Domain Verification Check (Authorization for DAST)
        const { data: verification } = await supabase
            .from('domain_verifications')
            .select('*')
            .eq('user_id', user.id)
            .eq('domain', hostname)
            .eq('status', 'verified')
            .single();

        if (!verification) {
            return NextResponse.json({ 
                error: 'Domain not verified. You must verify ownership of this domain before scanning.' 
            }, { status: 403 });
        }

        // 3. Queue the Scan
        const { data: scan, error: scanError } = await supabase.from('scans').insert({
            user_id: user.id,
            target_url: normalized,
            status: 'Queued',
            progress: 0,
        }).select().single();

        if (scanError) throw scanError;

        // 4. Dispatch to QStash
        await qstash.publishJSON({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/qstash`,
            body: {
                scanId: scan.id,
                targetUrl: normalized
            }
        });

        return NextResponse.json({ 
            success: true, 
            scanId: scan.id, 
            message: 'Scan queued successfully' 
        }, { status: 202 });

    } catch (err: any) {
        console.error('Scan API error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
