import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { validateSession } from '@/lib/session-manager'
import { validateCsrfRequest, newCsrfToken, CSRF_COOKIE } from '@/lib/csrf'

export async function middleware(request: NextRequest) {
    // Update Supabase session
    const response = await updateSession(request)
    
    // Skip CSRF and session checks for public/auth-handled routes
    const publicRoutes = [
        '/',
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/pricing',
        '/docs',
        // /api/scan stays public: the landing page's header check (GET) is for
        // signed-out visitors. The POST branch does its own getUser() and
        // returns 401 without a session, so the pipeline is not exposed.
        '/api/scan',
    ]
    const isPublicRoute = publicRoutes.some(route => 
        request.nextUrl.pathname === route || 
        request.nextUrl.pathname.startsWith('/_next') ||
        // Exactly the OAuth/recovery callback, not the whole /auth prefix.
        // A prefix match exempts every future /auth/* route from CSRF and
        // session checks by default — the exemption should be granted per
        // route, deliberately, not inherited.
        request.nextUrl.pathname === '/auth/callback' ||
        request.nextUrl.pathname.startsWith('/api/auth')
    )
    
    if (isPublicRoute) {
        // Still issue the token here: /login is public, and the page a user
        // signs in from is where they pick up the cookie they will need later.
        return withCsrfCookie(request, response)
    }
    
    // Validate session for protected routes
    const sessionValidation = await validateSession()
    if (!sessionValidation.valid) {
        // Return 401 JSON response for API routes
        if (request.nextUrl.pathname.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'Unauthorized. Please sign in to perform scans.' },
                { status: 401 }
            );
        }
        
        // Redirect to login for invalid sessions
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
        return NextResponse.redirect(loginUrl)
    }
    
    // CSRF protection for state-changing requests.
    //
    // Double-submit: the browser holds a readable `csrf_token` cookie and echoes
    // it in the x-csrf-token header. A cross-origin attacker can make the
    // browser send the cookie but cannot read it, so cannot produce the header.
    //
    // Checked against the request directly — `cookies()` from next/headers does
    // not work in middleware. The old helper only avoided that because no token
    // was ever issued, so it always returned early and every guarded route 403'd.
    const csrf = validateCsrfRequest(request)
    if (!csrf.valid) {
        return NextResponse.json(
            { error: csrf.error || 'CSRF validation failed' },
            { status: 403 }
        )
    }

    return withCsrfCookie(request, response)
}

/**
 * Make sure the browser has a CSRF token to echo back.
 *
 * Issued on any response where the cookie is absent, so it is in place before a
 * user can reach a state-changing action — every such action is preceded by a
 * page load. Nothing issued one before this, which is the whole reason the
 * check could only ever fail.
 */
function withCsrfCookie(request: NextRequest, response: NextResponse): NextResponse {
    if (request.cookies.get(CSRF_COOKIE)) return response

    response.cookies.set(CSRF_COOKIE, newCsrfToken(), {
        httpOnly: false,   // the client must read it — see lib/csrf.ts
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600,
        path: '/',
    })
    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - Static assets (svg, png, jpg, etc.)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}