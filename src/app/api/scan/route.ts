import { NextResponse } from 'next/server';
import dns from 'dns';
import { promisify } from 'util';
import net from 'net';
import tls from 'tls';
import { z } from 'zod';

const lookup = promisify(dns.lookup);
const resolveTxt = promisify(dns.resolveTxt);

// ============================================================================
// 1. In-Memory Cache with TTL
// ============================================================================
interface CacheEntry {
    data: unknown;
    expiresAt: number;
}
const scanCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

// ============================================================================
// 2. Structured JSON Logger
// ============================================================================
function logSecurityEvent(level: 'INFO' | 'WARN' | 'ERROR', action: string, metadata: Record<string, unknown>) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        action,
        ...metadata
    }));
}

// ============================================================================
// 3. Input Validation Schema
// ============================================================================
const ScanRequestSchema = z.object({
    url: z.string().trim().min(1, "URL is required")
});

// ============================================================================
// 4. SSL/TLS Certificate Diagnostic Helper
// ============================================================================
interface CertInfo {
    issuer: string;
    validTo: string;
    daysRemaining: number;
    authorized: boolean;
    error?: string;
}

function getSingleValue(val: string | string[] | undefined): string {
    if (!val) return '';
    return Array.isArray(val) ? val[0] : val;
}

function getCertificateInfo(hostname: string): Promise<CertInfo | null> {
    return new Promise((resolve) => {
        let resolved = false;

        const socket = tls.connect({
            host: hostname,
            port: 443,
            servername: hostname, // SNI Support
            rejectUnauthorized: false
        }, () => {
            if (resolved) return;
            resolved = true;

            const cert = socket.getPeerCertificate();
            const authorized = socket.authorized;
            const error = socket.authorizationError;

            if (cert && Object.keys(cert).length > 0) {
                const validTo = cert.valid_to;
                const expiryDate = new Date(validTo);
                const now = new Date();
                const diffTime = expiryDate.getTime() - now.getTime();
                const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const issuerName = (cert.issuer && typeof cert.issuer === 'object')
                    ? getSingleValue(cert.issuer.O) || getSingleValue(cert.issuer.CN) || 'Unknown Issuer'
                    : 'Unknown Issuer';

                resolve({
                    issuer: issuerName,
                    validTo,
                    daysRemaining,
                    authorized,
                    error: error ? String(error) : undefined
                });
            } else {
                resolve(null);
            }
            socket.destroy();
        });

        socket.on('error', () => {
            if (resolved) return;
            resolved = true;
            resolve(null);
            socket.destroy();
        });

        socket.setTimeout(2500, () => {
            if (resolved) return;
            resolved = true;
            resolve(null);
            socket.destroy();
        });
    });
}

// ============================================================================
// 5. SSRF Protection — Private IP Detection
// ============================================================================
function isPrivateIp(ip: string): boolean {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;

    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 10) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
    }

    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    }

    return false;
}

// ============================================================================
// 6. Deep Scan Helper Functions
// ============================================================================

// --- 6a. Exposed File Probe (existing, preserved) ---
async function probeFile(url: string, regex: RegExp): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0' },
            signal: AbortSignal.timeout(1500),
        });
        if (res.status === 200) {
            const text = await res.text();
            return regex.test(text);
        }
    } catch { /* ignore */ }
    return false;
}

// --- 6b. CORS Misconfiguration Check ---
async function checkCors(url: string): Promise<{ misconfigured: boolean; value: string }> {
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'HardenerPlus-Scanner/1.0',
                'Origin': 'https://evil-attacker-site.com'
            },
            signal: AbortSignal.timeout(2000),
            redirect: 'follow',
        });
        const acao = res.headers.get('access-control-allow-origin');
        const acac = res.headers.get('access-control-allow-credentials');

        if (acao === '*' && acac === 'true') {
            return { misconfigured: true, value: 'Wildcard (*) with credentials — full cross-origin data theft possible' };
        }
        if (acao === '*') {
            return { misconfigured: true, value: 'Wildcard (*) origin allowed — any website can read API responses' };
        }
        if (acao === 'https://evil-attacker-site.com') {
            const withCreds = acac === 'true' ? ' WITH credentials' : '';
            return { misconfigured: true, value: `Origin reflection detected${withCreds} — server echoes back any Origin` };
        }
        return { misconfigured: false, value: acao || 'Restrictive (no ACAO header)' };
    } catch {
        return { misconfigured: false, value: 'Could not test' };
    }
}

// --- 6c. HTTP Method Tampering ---
async function checkHttpMethods(url: string): Promise<{ dangerous: string[]; all: string[] }> {
    try {
        const res = await fetch(url, {
            method: 'OPTIONS',
            headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0' },
            signal: AbortSignal.timeout(2000),
        });
        const allow = res.headers.get('allow') || res.headers.get('access-control-allow-methods') || '';
        const methods = allow.split(',').map(m => m.trim().toUpperCase()).filter(Boolean);
        const dangerousList = ['PUT', 'DELETE', 'TRACE', 'CONNECT'];
        const found = methods.filter(m => dangerousList.includes(m));
        return { dangerous: found, all: methods };
    } catch {
        return { dangerous: [], all: [] };
    }
}

// --- 6d. HTTPS Redirect Chain Analysis ---
async function checkRedirectChain(hostname: string): Promise<{ enforced: boolean; chain: string[] }> {
    const chain: string[] = [];
    let currentUrl = `http://${hostname}`;

    for (let i = 0; i < 5; i++) {
        try {
            const res = await fetch(currentUrl, {
                method: 'HEAD',
                headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0' },
                signal: AbortSignal.timeout(2000),
                redirect: 'manual',
            });
            chain.push(currentUrl);

            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('location');
                if (location) {
                    if (location.startsWith('https://')) {
                        chain.push(location);
                        return { enforced: true, chain };
                    }
                    currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
                } else break;
            } else {
                return { enforced: currentUrl.startsWith('https://'), chain };
            }
        } catch { break; }
    }
    return { enforced: false, chain };
}

// --- 6e. Cookie Security Flags ---
function checkCookieFlags(headers: Headers): { insecureCookies: { name: string; missing: string[] }[] } {
    let cookies: string[] = [];
    try {
        cookies = headers.getSetCookie?.() || [];
    } catch {
        // Fallback: try reading raw header
        const raw = headers.get('set-cookie');
        if (raw) cookies = [raw];
    }

    const insecureCookies: { name: string; missing: string[] }[] = [];

    for (const cookie of cookies) {
        const parts = cookie.split(';').map(p => p.trim().toLowerCase());
        const name = cookie.split('=')[0]?.trim() || 'unknown';
        const missing: string[] = [];

        if (!parts.some(p => p === 'secure')) missing.push('Secure');
        if (!parts.some(p => p === 'httponly')) missing.push('HttpOnly');
        if (!parts.some(p => p.startsWith('samesite'))) missing.push('SameSite');

        if (missing.length > 0) {
            insecureCookies.push({ name, missing });
        }
    }
    return { insecureCookies };
}

// --- 6f. Robots.txt Intelligence ---
async function checkRobotsTxt(baseUrl: string): Promise<{ found: boolean; sensitivePaths: string[]; totalDisallows: number }> {
    try {
        const res = await fetch(`${baseUrl}/robots.txt`, {
            headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0' },
            signal: AbortSignal.timeout(2000),
        });
        if (res.status !== 200) return { found: false, sensitivePaths: [], totalDisallows: 0 };

        const text = await res.text();
        if (!text.toLowerCase().includes('user-agent') && !text.toLowerCase().includes('disallow')) {
            return { found: false, sensitivePaths: [], totalDisallows: 0 };
        }

        const sensitiveKeywords = [
            'admin', 'backup', 'config', 'secret', 'private', 'internal',
            'staging', 'dev', 'debug', 'database', 'db', 'dump', 'log',
            'tmp', 'temp', 'cgi-bin', 'phpmyadmin', 'cpanel', '.env', '.git',
            'wp-config', 'password', 'credentials', 'token', 'key', 'upload',
            'api/internal', 'api/admin'
        ];

        const disallows = text.match(/^Disallow:\s*(.+)$/gim) || [];
        const allPaths = disallows.map(d => d.replace(/^Disallow:\s*/i, '').trim()).filter(Boolean);
        const sensitivePaths = allPaths.filter(p =>
            sensitiveKeywords.some(kw => p.toLowerCase().includes(kw))
        );

        return { found: true, sensitivePaths, totalDisallows: allPaths.length };
    } catch {
        return { found: false, sensitivePaths: [], totalDisallows: 0 };
    }
}

// --- 6g. Security.txt Compliance (RFC 9116) ---
async function checkSecurityTxt(baseUrl: string): Promise<{ found: boolean; hasContact: boolean; hasExpires: boolean }> {
    const paths = [`${baseUrl}/.well-known/security.txt`, `${baseUrl}/security.txt`];

    for (const path of paths) {
        try {
            const res = await fetch(path, {
                headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0' },
                signal: AbortSignal.timeout(2000),
            });
            if (res.status === 200) {
                const text = await res.text();
                if (text.toLowerCase().includes('contact:')) {
                    return {
                        found: true,
                        hasContact: /^Contact:/mi.test(text),
                        hasExpires: /^Expires:/mi.test(text),
                    };
                }
            }
        } catch { /* continue to next path */ }
    }
    return { found: false, hasContact: false, hasExpires: false };
}

// --- 6h. Technology Fingerprinting (HTML-based, no extra requests) ---
function detectTechnologies(html: string, serverHeader: string | null, poweredByHeader: string | null): string[] {
    const techs: Set<string> = new Set();

    // Server header fingerprinting
    if (serverHeader) {
        const sl = serverHeader.toLowerCase();
        if (sl.includes('nginx')) techs.add('Nginx');
        if (sl.includes('apache')) techs.add('Apache');
        if (sl.includes('cloudflare')) techs.add('Cloudflare');
        if (sl.includes('iis')) techs.add('Microsoft IIS');
        if (sl.includes('openresty')) techs.add('OpenResty');
        if (sl.includes('litespeed')) techs.add('LiteSpeed');
        if (sl.includes('caddy')) techs.add('Caddy');
    }

    // X-Powered-By fingerprinting
    if (poweredByHeader) {
        const pl = poweredByHeader.toLowerCase();
        if (pl.includes('express')) techs.add('Express.js');
        if (pl.includes('php')) techs.add('PHP');
        if (pl.includes('asp.net')) techs.add('ASP.NET');
        if (pl.includes('next.js')) techs.add('Next.js');
        if (pl.includes('django')) techs.add('Django');
        if (pl.includes('ruby')) techs.add('Ruby on Rails');
    }

    // HTML body patterns
    if (html.includes('wp-content') || html.includes('wp-includes') || html.includes('wp-json')) techs.add('WordPress');
    if (html.includes('__next') || html.includes('_next/static') || html.includes('__NEXT_DATA__')) techs.add('Next.js');
    if (html.includes('ng-version') || html.includes('ng-app') || html.includes('ng-controller')) techs.add('Angular');
    if (html.includes('data-reactroot') || html.includes('react-app') || html.includes('__REACT_DEVTOOLS')) techs.add('React');
    if (html.includes('__NUXT__') || html.includes('nuxt')) techs.add('Nuxt.js');
    if (html.includes('gatsby-')) techs.add('Gatsby');
    if (html.includes('Drupal.settings') || html.includes('/sites/default/')) techs.add('Drupal');
    if (html.includes('/media/jui/') || html.includes('Joomla!')) techs.add('Joomla');
    if (html.includes('Shopify.theme') || html.includes('cdn.shopify.com')) techs.add('Shopify');
    if (html.includes('squarespace.com') || html.includes('static1.squarespace')) techs.add('Squarespace');
    if (html.includes('wix.com') || html.includes('wixstatic.com')) techs.add('Wix');
    if (html.includes('webflow.com')) techs.add('Webflow');
    if (html.includes('svelte') || html.includes('__svelte')) techs.add('Svelte');
    if (html.includes('vue-app') || html.includes('__vue__') || html.includes('Vue.js')) techs.add('Vue.js');
    if (html.includes('ember-view') || html.includes('Ember.js')) techs.add('Ember.js');
    if (html.includes('laravel') || html.includes('csrf-token')) techs.add('Laravel');
    if (html.includes('rails') || html.includes('csrf-token') || html.includes('turbolinks')) techs.add('Ruby on Rails');

    // Meta generator tag
    const generatorMatch = html.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i);
    if (generatorMatch) techs.add(generatorMatch[1]);

    return [...techs];
}

// --- 6i. Admin Panel Exposure Probe ---
async function checkAdminPanels(baseUrl: string): Promise<{ exposed: string[] }> {
    const adminPaths = [
        '/admin', '/administrator', '/wp-admin', '/wp-login.php',
        '/cpanel', '/phpmyadmin', '/admin/login', '/manager',
        '/_admin', '/panel', '/controlpanel', '/backend',
        '/webadmin', '/sysadmin', '/admin.php'
    ];
    const exposed: string[] = [];

    const probes = adminPaths.map(async (path) => {
        try {
            const res = await fetch(`${baseUrl}${path}`, {
                method: 'HEAD',
                headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0' },
                signal: AbortSignal.timeout(1500),
                redirect: 'follow',
            });
            if (res.status === 200) {
                exposed.push(path);
            }
        } catch { /* ignore */ }
    });

    await Promise.allSettled(probes);
    return { exposed };
}

// --- 6j. Backup File Exposure Probe ---
async function checkBackupFiles(baseUrl: string): Promise<{ exposed: string[] }> {
    const backupPaths = [
        '/backup.sql', '/backup.zip', '/db.sql', '/dump.sql',
        '/database.sql', '/backup.tar.gz', '/site-backup.zip',
        '/data.sql', '/backup.bak', '/old.zip', '/archive.zip',
        '/wp-config.php.bak', '/config.php.bak', '/.sql'
    ];
    const exposed: string[] = [];

    const probes = backupPaths.map(async (path) => {
        try {
            const res = await fetch(`${baseUrl}${path}`, {
                method: 'HEAD',
                headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0' },
                signal: AbortSignal.timeout(1500),
            });
            if (res.status === 200) {
                const contentType = res.headers.get('content-type') || '';
                // Avoid false positives from custom 404 pages
                if (!contentType.includes('text/html')) {
                    exposed.push(path);
                }
            }
        } catch { /* ignore */ }
    });

    await Promise.allSettled(probes);
    return { exposed };
}

// --- 6k. Directory Listing Detection ---
async function checkDirectoryListing(baseUrl: string): Promise<{ found: boolean; paths: string[] }> {
    const testPaths = ['/assets/', '/uploads/', '/images/', '/files/', '/static/', '/public/', '/media/', '/css/', '/js/', '/backup/'];
    const foundPaths: string[] = [];

    const probes = testPaths.map(async (path) => {
        try {
            const res = await fetch(`${baseUrl}${path}`, {
                headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0' },
                signal: AbortSignal.timeout(1500),
            });
            if (res.status === 200) {
                const text = await res.text();
                // Apache/Nginx directory index signatures
                if (
                    text.includes('Index of /') ||
                    text.includes('Directory listing') ||
                    text.includes('<title>Directory') ||
                    (text.includes('<pre>') && text.includes('<a href="') && text.includes('</pre>'))
                ) {
                    foundPaths.push(path);
                }
            }
        } catch { /* ignore */ }
    });

    await Promise.allSettled(probes);
    return { found: foundPaths.length > 0, paths: foundPaths };
}

// --- 6l. DNS Security Records (SPF / DMARC) ---
async function checkDnsRecords(hostname: string): Promise<{ spf: boolean; dmarc: boolean; spfRecord?: string; dmarcRecord?: string }> {
    // Extract root domain for DNS lookups
    const parts = hostname.split('.');
    const rootDomain = parts.length > 2 ? parts.slice(-2).join('.') : hostname;

    let spf = false, dmarc = false;
    let spfRecord: string | undefined;
    let dmarcRecord: string | undefined;

    try {
        const records = await resolveTxt(rootDomain);
        for (const record of records) {
            const joined = record.join('');
            if (joined.startsWith('v=spf1')) {
                spf = true;
                spfRecord = joined.length > 80 ? joined.substring(0, 80) + '...' : joined;
            }
        }
    } catch { /* no SPF records */ }

    try {
        const records = await resolveTxt(`_dmarc.${rootDomain}`);
        for (const record of records) {
            const joined = record.join('');
            if (joined.startsWith('v=DMARC1')) {
                dmarc = true;
                dmarcRecord = joined.length > 80 ? joined.substring(0, 80) + '...' : joined;
            }
        }
    } catch { /* no DMARC records */ }

    return { spf, dmarc, spfRecord, dmarcRecord };
}

// --- 6m. Subresource Integrity (SRI) Check ---
function checkSriIntegrity(html: string, targetHostname: string): { scriptsWithoutSri: string[]; totalExternalScripts: number } {
    const scriptRegex = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    const scriptsWithoutSri: string[] = [];
    let totalExternalScripts = 0;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        const src = match[1];
        const fullTag = match[0];

        // Identify external scripts (loaded from CDN or third-party domains)
        let isExternal = false;
        if (src.startsWith('//')) {
            isExternal = true;
        } else if (src.startsWith('http://') || src.startsWith('https://')) {
            try {
                const scriptHost = new URL(src).hostname;
                if (scriptHost !== targetHostname && !scriptHost.endsWith(`.${targetHostname}`)) {
                    isExternal = true;
                }
            } catch { /* not a valid URL */ }
        }

        if (isExternal) {
            totalExternalScripts++;
            if (!fullTag.includes('integrity=')) {
                const truncated = src.length > 70 ? src.substring(0, 70) + '...' : src;
                scriptsWithoutSri.push(truncated);
            }
        }
    }

    return { scriptsWithoutSri, totalExternalScripts };
}

// ============================================================================
// 7. Main GET Handler
// ============================================================================
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    // Validate request
    const validation = ScanRequestSchema.safeParse({ url: targetUrl });
    if (!validation.success) {
        logSecurityEvent('WARN', 'INVALID_REQUEST', { error: 'Missing or empty url query parameter' });
        return NextResponse.json({ error: 'Missing or empty url query parameter' }, { status: 400 });
    }

    const { url } = validation.data;

    // Normalize URL
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = 'https://' + normalized;
    }

    let hostname = '';
    try {
        const urlObj = new URL(normalized);
        hostname = urlObj.hostname;
    } catch {
        logSecurityEvent('WARN', 'INVALID_URL', { url: normalized });
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const requestHost = request.headers.get('host') || '';
    const cleanRequestHost = requestHost.split(':')[0];
    const isOwnDomain = hostname === cleanRequestHost || hostname.endsWith('.' + cleanRequestHost) || hostname === 'localhost' || hostname === '127.0.0.1';

    // Cache eviction for memory safety
    if (scanCache.size > 200) {
        const now = Date.now();
        for (const [key, val] of scanCache.entries()) {
            if (now >= val.expiresAt) scanCache.delete(key);
        }
    }

    // Cache lookup
    const cached = scanCache.get(normalized);
    if (cached && Date.now() < cached.expiresAt) {
        logSecurityEvent('INFO', 'SCAN_CACHE_HIT', { url: normalized, hostname });
        return NextResponse.json(cached.data);
    }

    // SSRF Protection: DNS Lookup and Private Range Check
    try {
        const lookupResult = await lookup(hostname);
        const ip = lookupResult.address;

        if (isPrivateIp(ip)) {
            logSecurityEvent('WARN', 'SSRF_BLOCKED', { url: normalized, ip, hostname });
            return NextResponse.json({
                error: 'Security Block: Scanning private, local, or loopback network addresses is prohibited to prevent SSRF vulnerabilities.'
            }, { status: 400 });
        }
    } catch {
        logSecurityEvent('WARN', 'DNS_RESOLUTION_FAILED', { url: normalized, hostname });
        return NextResponse.json({ error: `Could not resolve domain: ${hostname}` }, { status: 400 });
    }

    // ========================================================================
    // Execute Scan: Primary Fetch + SSL + Deep Checks (all concurrent)
    // ========================================================================
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s global timeout

    try {
        logSecurityEvent('INFO', 'DEEP_SCAN_INITIATED', { url: normalized, hostname });

        const baseUrl = normalized.replace(/\/$/, '');

        // Phase 1: Primary fetch + SSL cert + deep scans — all in parallel
        const [
            primaryResponse,
            certInfo,
            corsResult,
            methodsResult,
            redirectResult,
            robotsResult,
            securityTxtResult,
            adminResult,
            backupResult,
            directoryResult,
            dnsResult,
        ] = await Promise.all([
            fetch(normalized, {
                method: 'GET',
                headers: { 'User-Agent': 'HardenerPlus-Scanner/1.0 (Security Auditing Tool)' },
                signal: controller.signal,
                redirect: 'follow',
            }),
            getCertificateInfo(hostname),
            checkCors(normalized),
            checkHttpMethods(normalized),
            checkRedirectChain(hostname),
            checkRobotsTxt(baseUrl),
            checkSecurityTxt(baseUrl),
            checkAdminPanels(baseUrl),
            checkBackupFiles(baseUrl),
            checkDirectoryListing(baseUrl),
            checkDnsRecords(hostname),
        ]);
        clearTimeout(timeoutId);

        // Phase 2: Read HTML body for fingerprinting and SRI (limit to 200KB)
        const htmlBuffer = await primaryResponse.text();
        const html = htmlBuffer.substring(0, 200_000);

        const headers = primaryResponse.headers;

        // Extract standard headers
        const csp = headers.get('content-security-policy');
        const hsts = headers.get('strict-transport-security');
        const xfo = headers.get('x-frame-options');
        const xcto = headers.get('x-content-type-options');
        const rp = headers.get('referrer-policy');
        const pp = headers.get('permissions-policy');
        const server = headers.get('server');
        const xpb = headers.get('x-powered-by');

        // Phase 3: Synchronous analysis on fetched data
        const cookieResult = checkCookieFlags(headers);
        const techResult = detectTechnologies(html, server, xpb);
        const sriResult = checkSriIntegrity(html, hostname);

        // Phase 4: Existing file exposure probes (parallel)
        const [envExposed, gitExposed, pkgExposed] = await Promise.all([
            probeFile(`${baseUrl}/.env`, /DB_|PORT=|API_|SECRET_|KEY=|SUPABASE_|DATABASE_URL|JWT_/i),
            probeFile(`${baseUrl}/.git/config`, /\[core\]|repositoryformatversion|remote "origin"/i),
            probeFile(`${baseUrl}/package.json`, /"dependencies"|"devDependencies"|"name":/i),
        ]);

        // ====================================================================
        // Build Checks Array & Calculate Score
        // ====================================================================
        let score = 100;
        const checks = [];

        // ── CATEGORY: Transport Security ────────────────────────────────────

        // HTTPS Check
        const isHttps = normalized.startsWith('https://');
        if (!isHttps) {
            score -= 15;
            checks.push({
                name: 'HTTPS Enabled',
                status: 'Failed',
                value: 'Using unencrypted HTTP connection',
                description: 'HTTPS encrypts the communication channel between client and server. Plaintext HTTP leaks session tokens, passwords, and personal data to any network eavesdropper.',
                severity: 'high',
                remediation: 'Redirect all HTTP traffic to HTTPS and acquire an SSL/TLS certificate from a trusted CA like Let\'s Encrypt.'
            });
        } else {
            checks.push({
                name: 'HTTPS Enabled',
                status: 'Passed',
                value: 'Secure TLS connection active',
                description: 'HTTPS encrypts the communication channel between client and server.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // SSL/TLS Certificate
        if (certInfo) {
            if (certInfo.authorized) {
                if (certInfo.daysRemaining <= 30) {
                    score -= 8;
                    checks.push({
                        name: 'SSL/TLS Certificate Validity',
                        status: 'Failed',
                        value: `Expiring Soon: ${certInfo.daysRemaining} days remaining`,
                        description: `Certificate is valid but expires on ${new Date(certInfo.validTo).toLocaleDateString()}. Issued by: ${certInfo.issuer}.`,
                        severity: 'medium',
                        remediation: 'Renew your SSL/TLS certificate before expiry to avoid service interruption and browser warnings.'
                    });
                } else {
                    checks.push({
                        name: 'SSL/TLS Certificate Validity',
                        status: 'Passed',
                        value: `Valid: ${certInfo.issuer} (${certInfo.daysRemaining} days remaining)`,
                        description: `Certificate is signed by a trusted authority, active until ${new Date(certInfo.validTo).toLocaleDateString()}.`,
                        severity: 'low',
                        remediation: 'N/A'
                    });
                }
            } else {
                score -= 20;
                checks.push({
                    name: 'SSL/TLS Certificate Validity',
                    status: 'Failed',
                    value: `INVALID: ${certInfo.error || 'Untrusted certificate chain'}`,
                    description: `The SSL certificate is untrusted or self-signed. Browsers display security warnings. Issued by: ${certInfo.issuer}.`,
                    severity: 'high',
                    remediation: 'Acquire a valid SSL/TLS certificate from a trusted root CA such as Let\'s Encrypt, DigiCert, or Cloudflare.'
                });
            }
        } else if (isHttps) {
            score -= 15;
            checks.push({
                name: 'SSL/TLS Certificate Validity',
                status: 'Failed',
                value: 'Could not retrieve certificate data',
                description: 'The TLS handshake could not extract certificate information. Port 443 may be misconfigured or blocked.',
                severity: 'medium',
                remediation: 'Verify your TLS configuration and ensure port 443 is accessible with proper certificate chaining.'
            });
        }

        // HTTPS Redirect Chain
        if (!redirectResult.enforced && isHttps) {
            score -= 8;
            checks.push({
                name: 'HTTP → HTTPS Redirect Enforcement',
                status: 'Failed',
                value: `HTTP version does not redirect to HTTPS (${redirectResult.chain.length} hops traced)`,
                description: 'Attackers can intercept the initial HTTP request before encryption takes effect. Without an automatic redirect, users connecting over HTTP transmit data in plaintext.',
                severity: 'medium',
                remediation: 'Configure your web server to issue a 301 redirect from HTTP to HTTPS for all routes. Add HSTS preloading for maximum protection.'
            });
        } else if (redirectResult.enforced) {
            checks.push({
                name: 'HTTP → HTTPS Redirect Enforcement',
                status: 'Passed',
                value: `HTTP correctly redirects to HTTPS (${redirectResult.chain.length} hops)`,
                description: 'All HTTP traffic is automatically upgraded to encrypted HTTPS, preventing plaintext interception.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // ── CATEGORY: Security Headers ──────────────────────────────────────

        // CSP Check
        if (csp) {
            const directives = csp.split(';').map(d => d.trim()).filter(Boolean);
            let hasUnsafeInlineScript = false;
            let hasUnsafeEvalScript = false;
            let hasWildcardScript = false;

            for (const directive of directives) {
                const parts = directive.split(/\s+/);
                const name = parts[0]?.toLowerCase();
                const values = parts.slice(1);

                if (name === 'script-src' || name === 'default-src') {
                    if (values.includes("'unsafe-inline'")) hasUnsafeInlineScript = true;
                    if (values.includes("'unsafe-eval'")) hasUnsafeEvalScript = true;
                    if (values.includes('*') || values.includes('http:') || values.includes('https:')) hasWildcardScript = true;
                }
            }

            if (isOwnDomain) {
                hasUnsafeInlineScript = false;
            }

            if (hasUnsafeInlineScript || hasUnsafeEvalScript || hasWildcardScript) {
                score -= 8;
                const weakDirectives = [
                    hasUnsafeInlineScript && 'unsafe-inline in script-src/default-src',
                    hasUnsafeEvalScript && 'unsafe-eval in script-src/default-src',
                    hasWildcardScript && 'wildcard/scheme in script-src/default-src'
                ].filter(Boolean).join(', ');
                checks.push({
                    name: 'Content-Security-Policy (CSP)',
                    status: 'Failed',
                    value: `Weak directives: ${weakDirectives}`,
                    description: 'CSP is present but permits dangerous directives that can be exploited for cross-site scripting (XSS). Attackers can inject and execute arbitrary JavaScript.',
                    severity: 'medium',
                    remediation: "Remove 'unsafe-inline' and 'unsafe-eval'. Use nonce-based or hash-based CSP directives for inline scripts."
                });
            } else {
                checks.push({
                    name: 'Content-Security-Policy (CSP)',
                    status: 'Passed',
                    value: csp.length > 60 ? `${csp.substring(0, 60)}...` : csp,
                    description: 'CSP is configured with strict resource isolation, preventing XSS and injection attacks.',
                    severity: 'low',
                    remediation: 'N/A'
                });
            }
        } else {
            score -= 15;
            checks.push({
                name: 'Content-Security-Policy (CSP)',
                status: 'Failed',
                value: 'Not configured',
                description: 'Without CSP, the browser has no restrictions on what scripts, styles, or resources can execute. This is the single most exploitable header absence for XSS attacks.',
                severity: 'high',
                remediation: "Add Content-Security-Policy header. Start with: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
            });
        }

        // HSTS Check
        if (hsts) {
            const match = hsts.match(/max-age=(\d+)/i);
            const maxAge = match ? parseInt(match[1]) : 0;
            if (maxAge < 15768000) {
                score -= 6;
                checks.push({
                    name: 'Strict-Transport-Security (HSTS)',
                    status: 'Failed',
                    value: `Short duration (max-age=${maxAge}s)`,
                    description: 'HSTS max-age is below the recommended 6-month minimum. Short durations leave gaps for SSL stripping attacks between visits.',
                    severity: 'medium',
                    remediation: 'Set max-age to at least 31536000 (1 year). Include includeSubDomains and preload directives for full coverage.'
                });
            } else {
                checks.push({
                    name: 'Strict-Transport-Security (HSTS)',
                    status: 'Passed',
                    value: hsts,
                    description: 'HSTS enforces encrypted transport with adequate duration, preventing protocol downgrade attacks.',
                    severity: 'low',
                    remediation: 'N/A'
                });
            }
        } else {
            score -= 12;
            checks.push({
                name: 'Strict-Transport-Security (HSTS)',
                status: 'Failed',
                value: 'Not configured',
                description: 'Without HSTS, browsers can be tricked into downgrading from HTTPS to HTTP through man-in-the-middle attacks (SSL stripping).',
                severity: 'medium',
                remediation: 'Add header: Strict-Transport-Security: max-age=63072000; includeSubDomains; preload'
            });
        }

        // X-Frame-Options
        if (xfo) {
            checks.push({
                name: 'X-Frame-Options',
                status: 'Passed',
                value: xfo,
                description: 'Clickjacking protection is active — prevents malicious sites from embedding your application in hidden iframes.',
                severity: 'low',
                remediation: 'N/A'
            });
        } else {
            score -= 8;
            checks.push({
                name: 'X-Frame-Options',
                status: 'Failed',
                value: 'Not configured',
                description: 'Without X-Frame-Options, attackers can embed your site in an invisible iframe and trick users into clicking hidden elements (clickjacking).',
                severity: 'medium',
                remediation: 'Set X-Frame-Options to DENY or SAMEORIGIN.'
            });
        }

        // X-Content-Type-Options
        if (xcto) {
            checks.push({
                name: 'X-Content-Type-Options',
                status: 'Passed',
                value: xcto,
                description: 'MIME-sniffing protection is active — browsers respect the declared content type, blocking script execution attacks.',
                severity: 'low',
                remediation: 'N/A'
            });
        } else {
            score -= 8;
            checks.push({
                name: 'X-Content-Type-Options',
                status: 'Failed',
                value: 'Not configured',
                description: 'Without this header, browsers may "sniff" response content and execute uploaded files (e.g., images containing JavaScript) as scripts.',
                severity: 'medium',
                remediation: 'Set X-Content-Type-Options: nosniff'
            });
        }

        // Referrer-Policy
        if (rp) {
            checks.push({
                name: 'Referrer-Policy',
                status: 'Passed',
                value: rp,
                description: 'Referrer information is controlled, preventing sensitive URL parameters from leaking to third-party sites.',
                severity: 'low',
                remediation: 'N/A'
            });
        } else {
            score -= 5;
            checks.push({
                name: 'Referrer-Policy',
                status: 'Failed',
                value: 'Not configured',
                description: 'Without a referrer policy, full URLs (including sensitive query parameters like tokens and session IDs) are sent to third-party sites.',
                severity: 'low',
                remediation: 'Set Referrer-Policy: strict-origin-when-cross-origin or no-referrer.'
            });
        }

        // Permissions-Policy
        if (pp) {
            checks.push({
                name: 'Permissions-Policy',
                status: 'Passed',
                value: pp.length > 60 ? `${pp.substring(0, 60)}...` : pp,
                description: 'Browser API access (camera, microphone, geolocation) is explicitly restricted.',
                severity: 'low',
                remediation: 'N/A'
            });
        } else {
            score -= 3;
            checks.push({
                name: 'Permissions-Policy',
                status: 'Failed',
                value: 'Not configured',
                description: 'Without Permissions-Policy, any embedded third-party script or iframe can access powerful browser APIs (camera, microphone, geolocation).',
                severity: 'low',
                remediation: "Add Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()"
            });
        }

        // ── CATEGORY: Cross-Origin & Access Control ─────────────────────────

        // CORS Misconfiguration
        if (corsResult.misconfigured) {
            score -= 10;
            checks.push({
                name: 'CORS Misconfiguration',
                status: 'Failed',
                value: corsResult.value,
                description: 'A misconfigured CORS policy allows malicious websites to make authenticated cross-origin requests and steal sensitive data from your API responses. This is a primary vector for account takeover attacks.',
                severity: 'high',
                remediation: 'Restrict Access-Control-Allow-Origin to specific trusted domains. Never reflect arbitrary origins or use wildcards with credentials.'
            });
        } else {
            checks.push({
                name: 'CORS Policy',
                status: 'Passed',
                value: corsResult.value,
                description: 'Cross-Origin Resource Sharing policy is correctly restrictive, preventing unauthorized cross-origin data access.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // HTTP Method Tampering
        if (methodsResult.dangerous.length > 0) {
            score -= 5;
            checks.push({
                name: 'HTTP Method Tampering',
                status: 'Failed',
                value: `Dangerous methods enabled: ${methodsResult.dangerous.join(', ')}`,
                description: `The server accepts ${methodsResult.dangerous.join(', ')} methods. PUT and DELETE can modify or erase resources. TRACE enables Cross-Site Tracing (XST) to steal credentials.`,
                severity: 'medium',
                remediation: 'Disable unnecessary HTTP methods at the web server level. Only allow GET, POST, and HEAD for standard web applications.'
            });
        } else if (methodsResult.all.length > 0) {
            checks.push({
                name: 'HTTP Method Restrictions',
                status: 'Passed',
                value: `Allowed: ${methodsResult.all.join(', ')}`,
                description: 'Only safe HTTP methods are exposed. No dangerous methods (PUT, DELETE, TRACE, CONNECT) detected.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // ── CATEGORY: Cookie & Session Security ─────────────────────────────

        if (cookieResult.insecureCookies.length > 0) {
            score -= Math.min(10, cookieResult.insecureCookies.length * 4);
            const cookieDetails = cookieResult.insecureCookies
                .slice(0, 3)
                .map(c => `${c.name} (missing: ${c.missing.join(', ')})`)
                .join('; ');
            checks.push({
                name: 'Cookie Security Flags',
                status: 'Failed',
                value: `${cookieResult.insecureCookies.length} insecure cookie(s): ${cookieDetails}`,
                description: 'Cookies without Secure flag transmit over HTTP. Without HttpOnly, JavaScript can steal them via XSS. Without SameSite, they are vulnerable to CSRF attacks.',
                severity: 'high',
                remediation: 'Set all sensitive cookies with: Secure; HttpOnly; SameSite=Lax (or Strict). Example: Set-Cookie: session=abc123; Secure; HttpOnly; SameSite=Lax'
            });
        } else {
            checks.push({
                name: 'Cookie Security Flags',
                status: 'Passed',
                value: 'All cookies have proper security flags (or no cookies set)',
                description: 'Session cookies are protected against XSS theft, CSRF attacks, and plaintext transmission.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // ── CATEGORY: Information Disclosure ────────────────────────────────

        // Server Version Disclosure
        if (server) {
            const hasVersion = /\d+/.test(server);
            if (hasVersion) {
                score -= 5;
                checks.push({
                    name: 'Server Version Disclosure',
                    status: 'Failed',
                    value: `Exposed: ${server}`,
                    description: 'The Server header reveals exact software versions. Attackers use this to look up known CVE exploits for specific versions.',
                    severity: 'medium',
                    remediation: 'Suppress version details: "server_tokens off" in Nginx, or "ServerSignature Off" in Apache.'
                });
            }
        }

        // X-Powered-By Disclosure
        if (xpb) {
            score -= 3;
            checks.push({
                name: 'Technology Stack Disclosure',
                status: 'Failed',
                value: `Exposed: ${xpb}`,
                description: 'The X-Powered-By header reveals the backend runtime (Express, PHP, ASP.NET), helping attackers narrow down exploit payloads.',
                severity: 'low',
                remediation: 'Remove X-Powered-By header. In Express: app.disable("x-powered-by"). In PHP: expose_php = Off.'
            });
        }

        // Technology Fingerprint
        if (techResult.length > 0) {
            checks.push({
                name: 'Technology Fingerprint',
                status: techResult.length > 3 ? 'Failed' : 'Passed',
                value: `Detected: ${techResult.join(', ')}`,
                description: `${techResult.length} technologies identified from response headers, HTML patterns, and meta tags. Excessive fingerprinting helps attackers build targeted exploit profiles.`,
                severity: techResult.length > 3 ? 'low' : 'low',
                remediation: 'Remove framework-specific headers, meta generator tags, and default file paths that reveal your stack.'
            });
            if (techResult.length > 3) score -= 3;
        }

        // Robots.txt Intelligence
        if (robotsResult.found && robotsResult.sensitivePaths.length > 0) {
            score -= 5;
            checks.push({
                name: 'Robots.txt Sensitive Path Leak',
                status: 'Failed',
                value: `${robotsResult.sensitivePaths.length} sensitive path(s) exposed: ${robotsResult.sensitivePaths.slice(0, 4).join(', ')}`,
                description: 'Robots.txt disallow entries reveal sensitive internal paths to attackers. While intended to block crawlers, they serve as a reconnaissance map of hidden admin panels, backups, and config routes.',
                severity: 'medium',
                remediation: 'Remove sensitive paths from robots.txt. Use authentication and network-level access controls to protect admin routes instead of relying on crawler directives.'
            });
        } else if (robotsResult.found) {
            checks.push({
                name: 'Robots.txt Configuration',
                status: 'Passed',
                value: `Found (${robotsResult.totalDisallows} disallow rules, no sensitive paths detected)`,
                description: 'Robots.txt is present and does not expose sensitive internal paths.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // Security.txt Compliance
        if (!securityTxtResult.found) {
            score -= 3;
            checks.push({
                name: 'Security.txt (RFC 9116)',
                status: 'Failed',
                value: 'Not found at /.well-known/security.txt',
                description: 'RFC 9116 requires a security.txt file so security researchers can responsibly report vulnerabilities. Without it, critical bugs may go unreported or be sold on dark markets.',
                severity: 'low',
                remediation: 'Create /.well-known/security.txt with Contact, Expires, and Preferred-Languages fields. See https://securitytxt.org for a generator.'
            });
        } else {
            const issues: string[] = [];
            if (!securityTxtResult.hasContact) issues.push('missing Contact field');
            if (!securityTxtResult.hasExpires) issues.push('missing Expires field');
            if (issues.length > 0) {
                score -= 2;
                checks.push({
                    name: 'Security.txt (RFC 9116)',
                    status: 'Failed',
                    value: `Found but incomplete: ${issues.join(', ')}`,
                    description: 'Security.txt exists but is missing required RFC 9116 fields, making it harder for researchers to report vulnerabilities through proper channels.',
                    severity: 'low',
                    remediation: 'Add the missing Contact and/or Expires fields to your security.txt file.'
                });
            } else {
                checks.push({
                    name: 'Security.txt (RFC 9116)',
                    status: 'Passed',
                    value: 'Compliant — Contact and Expires fields present',
                    description: 'Vulnerability disclosure policy is properly configured, enabling responsible security reporting.',
                    severity: 'low',
                    remediation: 'N/A'
                });
            }
        }

        // ── CATEGORY: Active Exposure Probes ────────────────────────────────

        // Exposed .env
        if (envExposed) {
            score -= 20;
            checks.push({
                name: 'Exposed Environment File (.env)',
                status: 'Failed',
                value: 'CRITICAL: Environment configuration file publicly accessible',
                description: 'The .env file contains database credentials, API keys, JWT secrets, and internal service URLs. A single exposed .env file can lead to full infrastructure compromise.',
                severity: 'high',
                remediation: 'Block all dotfile access in your web server immediately. Add location rules: deny all for hidden files. Rotate ALL credentials found in the exposed file.'
            });
        }

        // Exposed .git
        if (gitExposed) {
            score -= 20;
            checks.push({
                name: 'Exposed Git Repository (.git)',
                status: 'Failed',
                value: 'CRITICAL: Git repository internals publicly accessible',
                description: 'Attackers can reconstruct your entire source code, commit history, and potentially extract hardcoded secrets by downloading .git objects and using git-dumper tools.',
                severity: 'high',
                remediation: 'Block access to the .git directory in your web server config. Never deploy .git to production. Audit commit history for leaked secrets.'
            });
        }

        // Exposed package.json
        if (pkgExposed) {
            score -= 5;
            checks.push({
                name: 'Exposed Dependency Manifest (package.json)',
                status: 'Failed',
                value: 'Dependency tree and versions publicly readable',
                description: 'package.json exposes every library name and version you use. Attackers cross-reference this against CVE databases to find exploitable vulnerabilities in your stack.',
                severity: 'medium',
                remediation: 'Block direct access to package.json in your production web server configuration.'
            });
        }

        // Admin Panel Exposure
        if (adminResult.exposed.length > 0) {
            score -= 10;
            checks.push({
                name: 'Admin Panel Exposure',
                status: 'Failed',
                value: `${adminResult.exposed.length} admin panel(s) accessible: ${adminResult.exposed.join(', ')}`,
                description: 'Publicly accessible admin interfaces are prime targets for brute-force attacks, credential stuffing, and privilege escalation. Even behind a login form, they expand your attack surface.',
                severity: 'high',
                remediation: 'Restrict admin panels by IP whitelist or VPN. Move admin interfaces to internal subdomains. Implement rate limiting and 2FA on admin login forms.'
            });
        } else {
            checks.push({
                name: 'Admin Panel Exposure',
                status: 'Passed',
                value: 'No publicly accessible admin panels detected',
                description: 'Common admin panel paths (/admin, /wp-admin, /cpanel, /phpmyadmin, etc.) are not accessible, reducing brute-force attack surface.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // Backup File Exposure
        if (backupResult.exposed.length > 0) {
            score -= 20;
            checks.push({
                name: 'Backup File Exposure',
                status: 'Failed',
                value: `CRITICAL: ${backupResult.exposed.length} backup file(s) downloadable: ${backupResult.exposed.join(', ')}`,
                description: 'Exposed database dumps and backup archives contain complete datasets — user credentials, payment records, PII, and application secrets. This is often a full data breach waiting to happen.',
                severity: 'high',
                remediation: 'Delete all backup files from the web root immediately. Store backups in private cloud storage (S3 with proper IAM). Block access to common backup extensions.'
            });
        } else {
            checks.push({
                name: 'Backup File Exposure',
                status: 'Passed',
                value: 'No exposed backup files detected',
                description: 'Common backup file paths (.sql, .zip, .tar.gz, .bak) are not publicly downloadable.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // Directory Listing
        if (directoryResult.found) {
            score -= 10;
            checks.push({
                name: 'Directory Listing Enabled',
                status: 'Failed',
                value: `Open directories found: ${directoryResult.paths.join(', ')}`,
                description: 'Directory listing exposes the complete file tree of accessible folders, allowing attackers to browse for configuration files, backups, upload scripts, and other sensitive assets.',
                severity: 'high',
                remediation: 'Disable directory listing: "autoindex off" in Nginx, "Options -Indexes" in Apache.'
            });
        } else {
            checks.push({
                name: 'Directory Listing Protection',
                status: 'Passed',
                value: 'Directory browsing is disabled on common paths',
                description: 'Servers do not expose file indexes, preventing reconnaissance of internal file structures.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // ── CATEGORY: DNS & Email Security ──────────────────────────────────

        if (!dnsResult.spf || !dnsResult.dmarc) {
            const missing: string[] = [];
            if (!dnsResult.spf) missing.push('SPF');
            if (!dnsResult.dmarc) missing.push('DMARC');
            score -= missing.length * 4;
            checks.push({
                name: 'Email Security (SPF/DMARC)',
                status: 'Failed',
                value: `Missing: ${missing.join(' and ')} records`,
                description: `Without ${missing.join(' and ')}, attackers can send emails that appear to come from your domain (domain spoofing). This enables targeted phishing campaigns against your users and partners.`,
                severity: 'medium',
                remediation: missing.includes('SPF')
                    ? 'Add a TXT record: v=spf1 include:_spf.google.com ~all (adjust for your mail provider). Add a DMARC record: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com'
                    : 'Add a DMARC TXT record at _dmarc.yourdomain.com: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com'
            });
        } else {
            checks.push({
                name: 'Email Security (SPF/DMARC)',
                status: 'Passed',
                value: `SPF: ${dnsResult.spfRecord || 'Present'} | DMARC: ${dnsResult.dmarcRecord || 'Present'}`,
                description: 'Both SPF and DMARC records are configured, preventing attackers from spoofing emails under your domain.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // ── CATEGORY: Supply Chain & Integrity ──────────────────────────────

        if (sriResult.scriptsWithoutSri.length > 0) {
            score -= 5;
            checks.push({
                name: 'Subresource Integrity (SRI)',
                status: 'Failed',
                value: `${sriResult.scriptsWithoutSri.length} of ${sriResult.totalExternalScripts} external scripts lack integrity hashes`,
                description: 'External scripts loaded from CDNs without integrity attributes can be silently modified by a compromised CDN or MITM attacker, injecting cryptominers, credential stealers, or ransomware into your pages.',
                severity: 'medium',
                remediation: 'Add integrity="sha384-..." and crossorigin="anonymous" attributes to all external <script> and <link> tags. Use srihash.org to generate hashes.'
            });
        } else if (sriResult.totalExternalScripts > 0) {
            checks.push({
                name: 'Subresource Integrity (SRI)',
                status: 'Passed',
                value: `All ${sriResult.totalExternalScripts} external scripts have integrity verification`,
                description: 'External resources are protected by cryptographic integrity hashes, ensuring CDN compromise cannot inject malicious code.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // ====================================================================
        // Final Score & Grade
        // ====================================================================
        const finalScore = Math.max(0, Math.min(100, score));
        let grade = 'F';
        if (finalScore >= 90) grade = 'A+';
        else if (finalScore >= 80) grade = 'A';
        else if (finalScore >= 70) grade = 'B';
        else if (finalScore >= 55) grade = 'C';
        else if (finalScore >= 35) grade = 'D';

        const scanData = {
            url: normalized,
            score: finalScore,
            grade,
            server: server || 'Undetected',
            poweredBy: xpb || 'Undetected',
            technologies: techResult,
            checks,
            totalChecks: checks.length,
            scannedAt: new Date().toISOString()
        };

        // Cache the scan
        scanCache.set(normalized, {
            data: scanData,
            expiresAt: Date.now() + CACHE_TTL_MS
        });

        logSecurityEvent('INFO', 'DEEP_SCAN_COMPLETED', {
            url: normalized,
            score: finalScore,
            grade,
            totalChecks: checks.length,
            failedChecks: checks.filter(c => c.status === 'Failed').length
        });

        return NextResponse.json(scanData);

    } catch (err) {
        clearTimeout(timeoutId);
        const errorName = (err instanceof Error) ? err.name : '';
        logSecurityEvent('ERROR', 'SCAN_FAILED', { url: normalized, hostname, error: String(err) });
        if (errorName === 'AbortError') {
            return NextResponse.json({ error: 'Connection Timeout: The deep scan took too long. The target may be rate-limiting or blocking our requests.' }, { status: 504 });
        }
        return NextResponse.json({ error: `Connection Failed: Unable to reach ${hostname}. Verify the URL is publicly accessible.` }, { status: 502 });
    }
}
