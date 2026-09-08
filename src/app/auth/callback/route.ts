import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { type EmailOtpType } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const nextParam = searchParams.get('next');

    // Smart routing based on action type:
    // - Password recovery -> defaults to /reset-password
    // - Signup confirmation / login / other -> defaults to /dashboard
    let next = '/dashboard';
    if (nextParam) {
        next = nextParam;
    } else if (type === 'recovery') {
        next = '/reset-password';
    }

    const supabase = await createClient();

    // 1. Handle PKCE authorization code exchange
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return getRedirectResponse(request, origin, next);
        }
        console.error('[Auth Callback] Code exchange failed:', error.message);
    }

    // 2. Handle token_hash verification (OTP / email link)
    if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });
        if (!error) {
            return getRedirectResponse(request, origin, next);
        }
        console.error('[Auth Callback] OTP token_hash verification failed:', error.message);
    }

    // Error fallbacks
    if (type === 'recovery' || nextParam === '/reset-password') {
        return NextResponse.redirect(`${origin}/forgot-password?error=expired`);
    }
    return NextResponse.redirect(`${origin}/login?error=auth-link-invalid`);
}

function getRedirectResponse(request: NextRequest, origin: string, next: string) {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const isLocalEnv = process.env.NODE_ENV === 'development';

    if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
    } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
    } else {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
        return NextResponse.redirect(`${appUrl}${next}`);
    }
}
