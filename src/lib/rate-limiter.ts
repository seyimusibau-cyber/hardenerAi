import { NextRequest, NextResponse } from 'next/server';
import type Redis from 'ioredis';

/**
 * Request rate limiting.
 *
 * WHY THIS WAS REWRITTEN
 * ----------------------
 * The counters lived in a module-level `Map`. On Vercel every lambda instance
 * has its own module scope and instances are created and discarded freely, so
 * "3 requests per 10 minutes" meant "3 per 10 minutes PER WARM INSTANCE". A
 * burst of concurrent requests lands on different instances, each with an empty
 * Map, and nearly all of them pass.
 *
 * That matters most where it was relied on hardest:
 *
 *   /api/auth/forgot-password  sends real email. A weak limit is a mail-bombing
 *                              tool pointed at any address, and it burns the
 *                              Resend quota.
 *   the per-email limit        was also the enumeration defence — the thing
 *                              stopping someone walking a candidate list.
 *
 * Redis gives one shared counter. INCR is atomic, so concurrent requests across
 * any number of instances increment the same integer; there is no read-then-
 * write race to lose.
 *
 * WHEN REDIS IS NOT CONFIGURED
 * ----------------------------
 * It falls back to the in-memory Map — but says so, once, loudly. The original
 * failure was not that memory was used; it was that memory looked exactly like
 * a working limit. A degraded limiter that announces itself can be found. A
 * silent one cannot.
 *
 * Set REDIS_URL to enable the shared store.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// ---------------------------------------------------------------------------
// Backing store
// ---------------------------------------------------------------------------

const memoryStore = new Map<string, RateLimitEntry>();
let redis: Redis | null = null;
let redisAttempted = false;
let warnedAboutMemory = false;

function getRedis(): Redis | null {
    if (redisAttempted) return redis;
    redisAttempted = true;

    const url = process.env.REDIS_URL;
    if (!url) return null;

    try {
        // Required lazily so a deployment without REDIS_URL never loads the
        // driver, and so this module stays importable from a test that has no
        // Redis at all.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const IORedis = require('ioredis');
        redis = new IORedis(url, {
            // A rate limiter must never become the reason a request hangs. If
            // Redis is slow or gone we fall through to memory rather than
            // holding the user's request open.
            connectTimeout: 1000,
            commandTimeout: 1000,
            maxRetriesPerRequest: 1,
            lazyConnect: false,
            enableOfflineQueue: false,
        });
        redis!.on('error', (err: Error) => {
            console.error('[rate-limit] redis error, falling back to memory:', err.message);
        });
        return redis;
    } catch (err) {
        console.error('[rate-limit] could not initialise redis:', (err as Error).message);
        return null;
    }
}

function warnMemoryOnce() {
    if (warnedAboutMemory) return;
    warnedAboutMemory = true;
    console.warn(
        '[rate-limit] NO REDIS_URL — counters are per-instance and will not hold ' +
        'across serverless invocations. Password-reset flood protection and email ' +
        'enumeration defence are both degraded. Set REDIS_URL.',
    );
}

/** Count this hit. Returns the running count and when the window resets. */
async function hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const client = getRedis();

    if (client) {
        try {
            // INCR then set the TTL only on the first hit, so the window runs
            // from the first request rather than sliding forward on every one.
            const count = await client.incr(key);
            if (count === 1) {
                await client.pexpire(key, windowMs);
            }
            const ttl = await client.pttl(key);
            return { count, resetAt: Date.now() + (ttl > 0 ? ttl : windowMs) };
        } catch (err) {
            console.error('[rate-limit] redis command failed, using memory:', (err as Error).message);
            // fall through
        }
    }

    warnMemoryOnce();
    const now = Date.now();
    const existing = memoryStore.get(key);
    if (!existing || now > existing.resetAt) {
        const entry = { count: 1, resetAt: now + windowMs };
        memoryStore.set(key, entry);
        return entry;
    }
    existing.count++;
    memoryStore.set(key, existing);
    return existing;
}

// ---------------------------------------------------------------------------
// Public API — unchanged signature, so every caller keeps working
// ---------------------------------------------------------------------------

export async function rateLimit(
    request: NextRequest,
    identifier: string,
    limit: number = 10,
    windowMs: number = 60000,
): Promise<NextResponse | null> {
    const key = `rl:${identifier}`;
    const { count, resetAt } = await hit(key, windowMs);

    if (count > limit) {
        const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        return NextResponse.json(
            { error: 'Rate limit exceeded. Please try again later.', retryAfter },
            {
                status: 429,
                headers: {
                    'Retry-After': retryAfter.toString(),
                    'X-RateLimit-Limit': limit.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(resetAt).toISOString(),
                },
            },
        );
    }

    return null;
}

export async function getRateLimitInfo(
    identifier: string,
    limit: number = 10,
): Promise<{ remaining: number; resetAt: number; limit: number } | null> {
    const key = `rl:${identifier}`;
    const client = getRedis();

    if (client) {
        try {
            const [countRaw, ttl] = await Promise.all([client.get(key), client.pttl(key)]);
            if (countRaw === null) return null;
            return {
                remaining: Math.max(0, limit - Number(countRaw)),
                resetAt: Date.now() + (ttl > 0 ? ttl : 0),
                limit,
            };
        } catch {
            // fall through to memory
        }
    }

    const entry = memoryStore.get(key);
    if (!entry) return null;
    return { remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt, limit };
}

/** Test seam — drops the in-memory counters. */
export function __resetRateLimitMemory() {
    memoryStore.clear();
}
