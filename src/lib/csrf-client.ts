/**
 * Browser side of the CSRF double-submit.
 *
 * The middleware issues a readable `csrf_token` cookie on any response that
 * lacks one. Every state-changing request from the browser has to echo it in
 * the `x-csrf-token` header, and the server checks the two match.
 *
 * Use `csrfFetch` in place of `fetch` for anything that writes. A plain fetch
 * to a guarded route gets 403 — which is the point.
 */

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

/** Read the token the middleware planted. Null before the first page load. */
export function readCsrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * fetch, with the CSRF header attached for state-changing methods.
 *
 * Deliberately does NOT throw when the token is missing: the server owns that
 * decision and returns a 403 the caller can show. Failing here instead would
 * move a security check into code an attacker controls.
 */
export async function csrfFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        return fetch(input, init);
    }

    const token = readCsrfToken();
    const headers = new Headers(init.headers);
    if (token) headers.set(CSRF_HEADER, token);

    return fetch(input, { ...init, headers });
}

export { CSRF_COOKIE, CSRF_HEADER };
