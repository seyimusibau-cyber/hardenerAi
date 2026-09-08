import { handleError } from '@/lib/error-handler';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { domain, action } = await req.json();

        if (action === 'generate') {
            // Generate a verification token
            const token = `vultix-verification=${crypto.randomBytes(16).toString('hex')}`;
            
            // Insert into domain_verifications
            const { data, error } = await supabase.from('domain_verifications').insert({
                user_id: user.id,
                domain: domain,
                verification_token: token,
                status: 'pending'
            }).select().single();

            if (error) throw error;
            return NextResponse.json({ token, id: data.id });
        }

        if (action === 'verify') {
            const { data: verification } = await supabase
                .from('domain_verifications')
                .select('*')
                .eq('user_id', user.id)
                .eq('domain', domain)
                .eq('status', 'pending')
                .single();

            if (!verification) {
                return NextResponse.json({ error: 'No pending verification found for this domain.' }, { status: 404 });
            }

            // Check via DoH (Cloudflare) to bypass OS-level DNS caching
            const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=TXT`;
            const dohRes = await fetch(dohUrl, {
                headers: { 'Accept': 'application/dns-json' }
            });
            const dohData = await dohRes.json();

            let verified = false;
            if (dohData.Status === 0 && dohData.Answer) {
                for (const record of dohData.Answer) {
                    if (record.data.includes(verification.verification_token)) {
                        verified = true;
                        break;
                    }
                }
            }

            if (verified) {
                await supabase.from('domain_verifications').update({
                    status: 'verified',
                    approval_type: 'dns_verified',
                    verified_at: new Date().toISOString()
                }).eq('id', verification.id);

                return NextResponse.json({ success: true, message: 'Domain verified successfully.' });
            } else {
                return NextResponse.json({ success: false, error: 'Verification token not found in DNS TXT records.' }, { status: 400 });
            }
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (err) {
        return handleError(err);
    }
}
