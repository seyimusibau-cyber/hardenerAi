import { describe, it, expect } from 'vitest';
import { validateCsrfRequest, newCsrfToken } from '../csrf';

/**
 * The double-submit check, tested directly.
 *
 * This guards a control that was previously unimplementable: nothing issued a
 * token, the cookie was httpOnly so the client could never echo it, and the
 * validator called `cookies()` from next/headers, which does not work in
 * middleware. That last fault never surfaced only because the token was always
 * missing and the function returned before reaching it.
 */

function req(method: string, cookie?: string, header?: string) {
    return {
        method,
        cookies: { get: (n: string) => (n === 'csrf_token' && cookie ? { value: cookie } : undefined) },
        headers: { get: (n: string) => (n === 'x-csrf-token' ? header ?? null : null) },
    };
}

describe('validateCsrfRequest', () => {
    it('skips methods that do not change state', () => {
        for (const m of ['GET', 'HEAD', 'OPTIONS']) {
            expect(validateCsrfRequest(req(m)).valid).toBe(true);
        }
    });

    it('accepts a state-changing request whose header matches the cookie', () => {
        const t = newCsrfToken();
        const r = validateCsrfRequest(req('PATCH', t, t));
        expect(r.valid).toBe(true);
    });

    it('rejects when the header is absent', () => {
        const t = newCsrfToken();
        const r = validateCsrfRequest(req('POST', t, undefined));
        expect(r.valid).toBe(false);
        // hadToken distinguishes "refresh and retry" from a real mismatch.
        expect(r.hadToken).toBe(false);
    });

    it('rejects when the cookie is absent', () => {
        const r = validateCsrfRequest(req('DELETE', undefined, newCsrfToken()));
        expect(r.valid).toBe(false);
        expect(r.hadToken).toBe(false);
    });

    it('rejects a header that does not match the cookie', () => {
        const r = validateCsrfRequest(req('PUT', newCsrfToken(), newCsrfToken()));
        expect(r.valid).toBe(false);
        // Both halves were present, so this is a genuine mismatch, not a
        // missing token — worth logging differently.
        expect(r.hadToken).toBe(true);
    });

    it('rejects a token of the right shape but the wrong value', () => {
        const t = newCsrfToken();
        const nearly = t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a');
        expect(validateCsrfRequest(req('POST', t, nearly)).valid).toBe(false);
    });

    it('is not fooled by a prefix of the real token', () => {
        const t = newCsrfToken();
        expect(validateCsrfRequest(req('POST', t, t.slice(0, 16))).valid).toBe(false);
    });

    it('issues tokens that are long and distinct', () => {
        const a = newCsrfToken();
        const b = newCsrfToken();
        expect(a).toHaveLength(64);          // 32 bytes, hex
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(a).not.toBe(b);
    });
});
