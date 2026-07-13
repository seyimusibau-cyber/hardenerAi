import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetAt) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean every minute

export async function rateLimit(
    request: NextRequest,
    identifier: string,
    limit: number = 10,
    windowMs: number = 60000 // 1 minute
): Promise<NextResponse | null> {
    const now = Date.now();
    const entry = rateLimitStore.get(identifier);

    // Clean up expired entry
    if (entry && now > entry.resetAt) {
        rateLimitStore.delete(identifier);
    }

    const current = rateLimitStore.get(identifier);

    if (!current) {
        rateLimitStore.set(identifier, {
            count: 1,
            resetAt: now + windowMs
        });
        return null;
    }

    if (current.count >= limit) {
        const retryAfter = Math.ceil((current.resetAt - now) / 1000);
        return NextResponse.json(
            { 
                error: 'Rate limit exceeded. Please try again later.',
                retryAfter 
            },
            { 
                status: 429,
                headers: {
                    'Retry-After': retryAfter.toString(),
                    'X-RateLimit-Limit': limit.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(current.resetAt).toISOString()
                }
            }
        );
    }

    current.count++;
    rateLimitStore.set(identifier, current);
    
    return null;
}

export function getRateLimitInfo(identifier: string): {
    remaining: number;
    resetAt: number;
    limit: number;
} | null {
    const entry = rateLimitStore.get(identifier);
    if (!entry) return null;
    
    return {
        remaining: Math.max(0, 10 - entry.count),
        resetAt: entry.resetAt,
        limit: 10
    };
}
