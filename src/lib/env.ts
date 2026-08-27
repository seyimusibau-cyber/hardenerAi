// Fail-fast environment validation. Import `serverEnv()` at the top of any
// server route that needs these; a missing var throws a clear error at request
// time instead of silently becoming '' deep inside a scan.
type Key =
    | 'NEXT_PUBLIC_SUPABASE_URL'
    | 'SUPABASE_SERVICE_ROLE_KEY'
    | 'QSTASH_TOKEN'
    | 'QSTASH_CURRENT_SIGNING_KEY'
    | 'QSTASH_NEXT_SIGNING_KEY'
    | 'NEXT_PUBLIC_APP_URL';

const REQUIRED: Key[] = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_APP_URL',
];

let cached: Record<string, string> | null = null;

export function serverEnv(extra: string[] = []): Record<string, string> {
    if (cached && extra.every((k) => k in cached!)) return cached;
    const missing: string[] = [];
    const out: Record<string, string> = {};
    for (const key of [...REQUIRED, ...extra]) {
        const v = process.env[key];
        if (!v) missing.push(key);
        else out[key] = v;
    }
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    cached = out;
    return out;
}

// Non-throwing check for health endpoints / startup logging.
export function envReport(): { ok: boolean; missing: string[] } {
    const missing = REQUIRED.filter((k) => !process.env[k]);
    return { ok: missing.length === 0, missing };
}
