import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { validateSession } from '@/lib/session-manager'
import { requireCsrfToken } from '@/lib/csrf'

export async function middleware(request: NextRequest) {
    // Update Supabase session
    const response = await updateSession(request)
    
    // Skip CSRF and session checks for public routes
    const publicRoutes = ['/login', '/signup', '/', '/pricing', '/docs', '/api/scan']
    const isPublicRoute = publicRoutes.some(route => 
        request.nextUrl.pathname === route || 
        request.nextUrl.pathname.startsWith('/_next') ||
        request.nextUrl.pathname.startsWith('/api/auth')
    )
    
    if (isPublicRoute) {
        return response
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
    
    // CSRF protection for state-changing requests
    const method = request.method.toUpperCase()
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const csrfValidation = await requireCsrfToken(request)
        if (!csrfValidation.valid) {
            return NextResponse.json(
                { error: csrfValidation.error || 'CSRF validation failed' },
                { status: 403 }
            )
        }
    }
    
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