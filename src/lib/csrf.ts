import { cookies } from 'next/headers';
import crypto from 'crypto';

// ============================================================================
// CSRF Token Configuration
// ============================================================================
const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_EXPIRY_MS = 3600000; // 1 hour

// ============================================================================
// Generate CSRF Token
// ============================================================================
export async function generateCsrfToken(): Promise<string> {
    const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
    const cookieStore = await cookies();
    
    cookieStore.set(CSRF_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: TOKEN_EXPIRY_MS / 1000,
        path: '/'
    });
    
    return token;
}

// ============================================================================
// Validate CSRF Token
// ============================================================================
export async function validateCsrfToken(token: string | null): Promise<boolean> {
    if (!token) return false;
    
    const cookieStore = await cookies();
    const storedToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
    
    if (!storedToken) return false;
    
    // Constant-time comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(storedToken),
            Buffer.from(token)
        );
    } catch {
        // Tokens are different lengths
        return false;
    }
}

// ============================================================================
// Get CSRF Token from Request
// ============================================================================
export function getCsrfTokenFromRequest(request: Request): string | null {
    // Check header first
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    if (headerToken) return headerToken;
    
    // Check body for form submissions
    // Note: This requires the body to be parsed first
    return null;
}

// ============================================================================
// Validate CSRF for Request
// ============================================================================
export async function validateCsrfForRequest(request: Request): Promise<boolean> {
    const token = getCsrfTokenFromRequest(request);
    return await validateCsrfToken(token);
}

// ============================================================================
// Refresh CSRF Token
// ============================================================================
export async function refreshCsrfToken(): Promise<string> {
    return await generateCsrfToken();
}

// ============================================================================
// Delete CSRF Token
// ============================================================================
export async function deleteCsrfToken(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(CSRF_COOKIE_NAME);
}

// ============================================================================
// CSRF Middleware Helper
// ============================================================================
export async function requireCsrfToken(request: Request): Promise<{
    valid: boolean;
    error?: string;
}> {
    // Only check CSRF for state-changing methods
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        return { valid: true };
    }
    
    const token = getCsrfTokenFromRequest(request);
    
    if (!token) {
        return {
            valid: false,
            error: 'CSRF token missing. Please refresh the page and try again.'
        };
    }
    
    const isValid = await validateCsrfToken(token);
    
    if (!isValid) {
        return {
            valid: false,
            error: 'Invalid CSRF token. Please refresh the page and try again.'
        };
    }
    
    return { valid: true };
}

// ============================================================================
// Get Current CSRF Token (for client-side use)
// ============================================================================
export async function getCurrentCsrfToken(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(CSRF_COOKIE_NAME)?.value || null;
}

// ============================================================================
// CSRF Token for Forms (Server Component)
// ============================================================================
export async function getCsrfTokenForForm(): Promise<string> {
    let token = await getCurrentCsrfToken();
    
    if (!token) {
        token = await generateCsrfToken();
    }
    
    return token;
}
