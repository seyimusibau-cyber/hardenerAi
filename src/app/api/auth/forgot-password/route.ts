import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendPasswordResetEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limiter';
import { logAuditEvent } from '@/lib/audit-logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null);
        const email = body?.email?.trim()?.toLowerCase();

        if (!email || !email.includes('@') || !email.includes('.')) {
            return NextResponse.json(
                { error: 'A valid email address is required.' },
                { status: 400 }
            );
        }

        const ip =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            'unknown';

        // Rate limit: max 3 requests per 10 minutes per IP
        const ipRateLimit = await rateLimit(request, `pwd-reset:ip:${ip}`, 3, 10 * 60 * 1000);
        if (ipRateLimit) return ipRateLimit;

        // Rate limit: max 3 requests per 10 minutes per email
        const emailRateLimit = await rateLimit(request, `pwd-reset:email:${email}`, 3, 10 * 60 * 1000);
        if (emailRateLimit) return emailRateLimit;

        const origin = new URL(request.url).origin;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
        const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;

        const serviceKey =
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_SERVICE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const hasResend = Boolean(process.env.RESEND_API_KEY);

        let emailDispatched = false;

        // Path A: Resend API + Supabase Admin link generation (high deliverability, bypasses Supabase rate limits)
        if (serviceKey && supabaseUrl && hasResend) {
            try {
                const supabaseAdmin = createAdminClient(supabaseUrl, serviceKey, {
                    auth: { persistSession: false },
                });

                const { data, error } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'recovery',
                    email,
                    options: {
                        redirectTo,
                    },
                });

                if (!error && data?.properties?.action_link) {
                    const sendResult = await sendPasswordResetEmail({
                        email,
                        resetLink: data.properties.action_link,
                        ipAddress: ip,
                    });

                    if (sendResult.success) {
                        emailDispatched = true;
                    }
                } else if (error) {
                    // If user is not found, log internally without leaking to client
                    console.warn('[Forgot Password] Supabase admin generateLink warning:', error.message);
                }
            } catch (adminErr) {
                console.error('[Forgot Password] Error in admin recovery generation:', adminErr);
            }
        }

        // Path B: Fallback to standard Supabase client reset (used if Resend or Service Key not configured)
        if (!emailDispatched) {
            const supabase = await createServerClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo,
            });

            if (error) {
                // Log rate limit or config error without leaking account existence
                console.warn('[Forgot Password] Supabase resetPasswordForEmail warning:', error.message);
            }
        }

        // Audit log event
        try {
            await logAuditEvent(
                {
                    event_type: 'AUTH_PASSWORD_RESET_REQUEST',
                    status: 'success',
                    severity: 'low',
                    resource: 'auth/forgot-password',
                    metadata: {
                        email_domain: email.split('@')[1],
                        channel: emailDispatched ? 'resend' : 'supabase_default',
                    },
                },
                request
            );
        } catch (auditErr) {
            console.error('[Forgot Password] Audit logging failed:', auditErr);
        }

        // Constant-time message to prevent email enumeration
        return NextResponse.json({
            success: true,
            message:
                'If an account exists with this email address, a password reset link has been dispatched to your inbox.',
        });
    } catch (err) {
        console.error('[Forgot Password API] Unexpected error:', err);
        return NextResponse.json(
            { error: 'An unexpected error occurred. Please try again later.' },
            { status: 500 }
        );
    }
}
