import dns from 'dns';
import { promisify } from 'util';
import net from 'net';

const lookup = promisify(dns.lookup);

// ============================================================================
// SSRF Protection Configuration
// ============================================================================
const BLOCKED_HOSTS = [
    '169.254.169.254',      // AWS/Azure/GCP metadata
    'metadata.google.internal',
    '100.100.100.200',      // Alibaba Cloud
    'fd00:ec2::254',        // AWS IPv6 metadata
    'metadata',
    'metadata.azure.com',
    'metadata.packet.net'
];

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 3000;

// ============================================================================
// SSRF Validation Result
// ============================================================================
export interface SSRFValidationResult {
    safe: boolean;
    reason?: string;
    resolvedIp?: string;
    redirectChain?: string[];
}

// ============================================================================
// Check if IP is Private/Internal
// ============================================================================
export function isPrivateIp(ip: string): boolean {
    // Loopback addresses
    if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '::') {
        return true;
    }

    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        
        // Private ranges (RFC 1918)
        if (parts[0] === 10) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        
        // Link-local (RFC 3927)
        if (parts[0] === 169 && parts[1] === 254) return true;
        
        // Loopback (RFC 1122)
        if (parts[0] === 127) return true;
        
        // Broadcast
        if (parts[0] === 255) return true;
        
        // Cloud metadata endpoints
        if (ip === '169.254.169.254') return true;
        if (ip === '100.100.100.200') return true;
        
        // Carrier-grade NAT (RFC 6598)
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
        
        // Reserved for future use
        if (parts[0] >= 240) return true;
    }

    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        
        // Unique local addresses (RFC 4193)
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        
        // Link-local (RFC 4291)
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || 
            lower.startsWith('fea') || lower.startsWith('feb')) return true;
        
        // Loopback
        if (lower === '::1') return true;
        
        // AWS IPv6 metadata
        if (lower.startsWith('fd00:ec2::')) return true;
        
        // Unspecified address
        if (lower === '::') return true;
    }

    return false;
}

// ============================================================================
// Check if Hostname is Blocked
// ============================================================================
function isBlockedHostname(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    
    // Check exact matches
    if (BLOCKED_HOSTS.includes(lower)) return true;
    
    // Check if it ends with blocked domains
    const blockedDomains = [
        '.internal',
        '.local',
        '.localhost',
        'metadata.google.internal'
    ];
    
    return blockedDomains.some(domain => lower.endsWith(domain));
}

// ============================================================================
// Validate Redirect Chain
// ============================================================================
async function validateRedirectChain(url: string): Promise<{
    safe: boolean;
    reason?: string;
    chain: string[];
}> {
    const chain: string[] = [url];
    let currentUrl = url;
    
    for (let i = 0; i < MAX_REDIRECTS; i++) {
        try {
            const response = await fetch(currentUrl, {
                method: 'HEAD',
                redirect: 'manual',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                headers: {
                    'User-Agent': 'Vultix-Scanner/1.0'
                }
            });
            
            // Check if it's a redirect
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) break;
                
                // Resolve relative URLs
                const redirectUrl = new URL(location, currentUrl);
                const redirectHostname = redirectUrl.hostname;
                
                // Check if redirect hostname is blocked
                if (isBlockedHostname(redirectHostname)) {
                    return {
                        safe: false,
                        reason: `Redirect to blocked hostname: ${redirectHostname}`,
                        chain
                    };
                }
                
                // Resolve DNS for redirect target
                try {
                    const redirectLookup = await lookup(redirectHostname);
                    if (isPrivateIp(redirectLookup.address) && process.env.NODE_ENV !== 'development') {
                        return {
                            safe: false,
                            reason: `Redirect to private IP: ${redirectLookup.address}`,
                            chain
                        };
                    }
                } catch {
                    return {
                        safe: false,
                        reason: `Cannot resolve redirect hostname: ${redirectHostname}`,
                        chain
                    };
                }
                
                currentUrl = redirectUrl.href;
                chain.push(currentUrl);
            } else {
                // No more redirects
                break;
            }
        } catch {
            // Timeout or network error - allow it (don't block legitimate slow sites)
            break;
        }
    }
    
    return { safe: true, chain };
}

// ============================================================================
// Main SSRF Validation Function
// ============================================================================
export async function validateUrlSafety(url: string): Promise<SSRFValidationResult> {
    try {
        // Parse URL
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // 1. Check if hostname is blocked
        if (isBlockedHostname(hostname)) {
            return {
                safe: false,
                reason: `Blocked hostname: ${hostname}`
            };
        }
        
        // 2. Check for IP address in hostname
        if (net.isIP(hostname)) {
            if (isPrivateIp(hostname) && process.env.NODE_ENV !== 'development') {
                return {
                    safe: false,
                    reason: `Private IP address not allowed: ${hostname}`
                };
            }
        }
        
        // 3. Resolve DNS
        let resolvedIp: string;
        try {
            const lookupResult = await lookup(hostname);
            resolvedIp = lookupResult.address;
        } catch {
            return {
                safe: false,
                reason: `Cannot resolve hostname: ${hostname}`
            };
        }
        
        // 4. Check if resolved IP is private
        if (isPrivateIp(resolvedIp) && process.env.NODE_ENV !== 'development') {
            return {
                safe: false,
                reason: `Hostname resolves to private IP: ${resolvedIp}`
            };
        }
        
        // 5. Validate redirect chain
        const redirectValidation = await validateRedirectChain(url);
        if (!redirectValidation.safe) {
            return {
                safe: false,
                reason: redirectValidation.reason,
                resolvedIp,
                redirectChain: redirectValidation.chain
            };
        }
        
        // All checks passed
        return {
            safe: true,
            resolvedIp,
            redirectChain: redirectValidation.chain
        };
    } catch (error) {
        return {
            safe: false,
            reason: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

// ============================================================================
// Quick IP Check (for already resolved IPs)
// ============================================================================
export function isIpSafe(ip: string): boolean {
    return !isPrivateIp(ip);
}

// ============================================================================
// Validate Multiple URLs (batch)
// ============================================================================
export async function validateMultipleUrls(urls: string[]): Promise<Map<string, SSRFValidationResult>> {
    const results = new Map<string, SSRFValidationResult>();
    
    const validations = urls.map(async (url) => {
        const result = await validateUrlSafety(url);
        results.set(url, result);
    });
    
    await Promise.all(validations);
    
    return results;
}

// ============================================================================
// Get Safe Hostname (for display purposes)
// ============================================================================
export function getSafeHostname(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return 'invalid-url';
    }
}

// ============================================================================
// Safe outbound fetch
// ============================================================================
/**
 * Fetch a user-supplied URL with SSRF checks that survive redirects.
 *
 * `validateUrlSafety()` alone is not enough for a real request. It walks the
 * redirect chain, and then the caller issues its OWN fetch — so a host that
 * answers the probe honestly and the real request differently (DNS rebinding,
 * or simply a 302 emitted only the second time) walks straight past the check.
 * The native `redirect: 'follow'` cannot be audited at all: by the time a
 * Response comes back, every hop has already been requested.
 *
 * So redirects are followed MANUALLY here, and every hop is re-validated
 * before it is requested.
 */
export async function safeFetch(
    rawUrl: string,
    init: RequestInit = {},
    maxRedirects: number = MAX_REDIRECTS,
): Promise<{ ok: true; response: Response; finalUrl: string } | { ok: false; reason: string }> {
    let current = rawUrl;

    for (let hop = 0; hop <= maxRedirects; hop++) {
        const check = await validateUrlSafety(current);
        if (!check.safe) {
            return { ok: false, reason: check.reason || 'Blocked by SSRF policy' };
        }

        let response: Response;
        try {
            response = await fetch(current, {
                ...init,
                redirect: 'manual', // never let the runtime follow one unchecked
                signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (err) {
            return { ok: false, reason: err instanceof Error ? err.message : 'Request failed' };
        }

        const isRedirect = response.status >= 300 && response.status < 400;
        const location = response.headers.get('location');
        if (!isRedirect || !location) {
            return { ok: true, response, finalUrl: current };
        }

        // Resolve relative Location values against the hop we just made.
        let next: string;
        try {
            next = new URL(location, current).toString();
        } catch {
            return { ok: false, reason: 'Malformed redirect target' };
        }

        // Only http(s). A redirect to file:// or gopher:// is a classic escape.
        const proto = new URL(next).protocol;
        if (proto !== 'http:' && proto !== 'https:') {
            return { ok: false, reason: `Blocked redirect scheme: ${proto}` };
        }
        current = next;
    }

    return { ok: false, reason: 'Too many redirects' };
}
