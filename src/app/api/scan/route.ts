import { NextResponse } from 'next/server';
import dns from 'dns';
import { promisify } from 'util';
import net from 'net';
import tls from 'tls';
import { z } from 'zod';

const lookup = promisify(dns.lookup);

// 1. In-Memory Cache with TTL
interface CacheEntry {
    data: unknown;
    expiresAt: number;
}
const scanCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

// 2. Structured JSON Logger Helper
function logSecurityEvent(level: 'INFO' | 'WARN' | 'ERROR', action: string, metadata: Record<string, unknown>) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        action,
        ...metadata
    }));
}

// 3. Input Validation Schema
const ScanRequestSchema = z.object({
    url: z.string().trim().min(1, "URL is required")
});

// 4. SSL/TLS Certificate Diagnostic Helper
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

        // Set a timeout of 2.5 seconds
        socket.setTimeout(2500, () => {
            if (resolved) return;
            resolved = true;
            resolve(null);
            socket.destroy();
        });
    });
}

function isPrivateIp(ip: string): boolean {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;

    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 10) return true; // 10.0.0.0/8
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
        if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
        if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16
    }

    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    }

    return false;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    // 1. Validate request parameters via Zod
    const validation = ScanRequestSchema.safeParse({ url: targetUrl });
    if (!validation.success) {
        logSecurityEvent('WARN', 'INVALID_REQUEST', { error: 'Missing or empty url query parameter' });
        return NextResponse.json({ error: 'Missing or empty url query parameter' }, { status: 400 });
    }

    const { url } = validation.data;

    // 2. Normalize URL
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

    // Clean up expired cache items to prevent memory leaks
    if (scanCache.size > 200) {
        const now = Date.now();
        for (const [key, val] of scanCache.entries()) {
            if (now >= val.expiresAt) {
                scanCache.delete(key);
            }
        }
    }

    // 3. Cache lookup
    const cached = scanCache.get(normalized);
    if (cached && Date.now() < cached.expiresAt) {
        logSecurityEvent('INFO', 'SCAN_CACHE_HIT', { url: normalized, hostname });
        return NextResponse.json(cached.data);
    }

    // 4. SSRF Check: DNS Lookup and Private Range Verification
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

    // 5. Perform scan request and SSL Diagnostics in parallel
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5 second timeout

    try {
        logSecurityEvent('INFO', 'SCAN_INITIATED', { url: normalized, hostname });

        const [response, certInfo] = await Promise.all([
            fetch(normalized, {
                method: 'GET',
                headers: {
                    'User-Agent': 'HardenerPlus-Scanner/1.0 (Security Auditing Tool)',
                },
                signal: controller.signal,
                redirect: 'follow',
            }),
            getCertificateInfo(hostname)
        ]);
        clearTimeout(timeoutId);

        const headers = response.headers;

        // Retrieve security headers
        const csp = headers.get('content-security-policy');
        const hsts = headers.get('strict-transport-security');
        const xfo = headers.get('x-frame-options');
        const xcto = headers.get('x-content-type-options');
        const rp = headers.get('referrer-policy');
        const pp = headers.get('permissions-policy');
        const server = headers.get('server');
        const xpb = headers.get('x-powered-by');

        // Perform Active Weak Spot Probes (parallel check for exposed files)
        const envUrl = `${normalized.replace(/\/$/, '')}/.env`;
        const gitUrl = `${normalized.replace(/\/$/, '')}/.git/config`;
        const pkgUrl = `${normalized.replace(/\/$/, '')}/package.json`;

        const probeFile = async (url: string, regex: RegExp) => {
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
            } catch {
                // ignore
            }
            return false;
        };

        const [envExposed, gitExposed, pkgExposed] = await Promise.all([
            probeFile(envUrl, /DB_|PORT=|API_|SECRET_|KEY=|SUPABASE_|DATABASE_URL|JWT_/i),
            probeFile(gitUrl, /\[core\]|repositoryformatversion|remote "origin"/i),
            probeFile(pkgUrl, /"dependencies"|"devDependencies"|"name":/i)
        ]);

        // Calculate Score & Generate Security Checks
        let score = 100;
        const checks = [];

        // HTTPS Check
        const isHttps = normalized.startsWith('https://');
        if (!isHttps) {
            score -= 20;
            checks.push({
                name: 'HTTPS Enabled',
                status: 'Failed',
                value: 'Using unencrypted HTTP connection',
                description: 'Hypertext Transfer Protocol Secure (HTTPS) encrypts the communication channel. Plaintext HTTP leaks all session data to network eavesdroppers.',
                severity: 'high',
                remediation: 'Redirect all HTTP requests to HTTPS and acquire an SSL/TLS certificate.'
            });
        } else {
            checks.push({
                name: 'HTTPS Enabled',
                status: 'Passed',
                value: 'Secure connection active',
                description: 'Hypertext Transfer Protocol Secure (HTTPS) encrypts the communication channel between client and server.',
                severity: 'low',
                remediation: 'N/A'
            });
        }

        // SSL/TLS Certificate Check
        if (certInfo) {
            if (certInfo.authorized) {
                if (certInfo.daysRemaining <= 30) {
                    score -= 10;
                    checks.push({
                        name: 'SSL/TLS Certificate Validity',
                        status: 'Failed',
                        value: `Expiring Soon: ${certInfo.daysRemaining} days remaining`,
                        description: `SSL certificate is valid and secure, but expires on ${new Date(certInfo.validTo).toLocaleDateString()}. (Issued by: ${certInfo.issuer})`,
                        severity: 'medium',
                        remediation: 'Renew your SSL/TLS certificate before it expires to prevent client connection failures.'
                    });
                } else {
                    checks.push({
                        name: 'SSL/TLS Certificate Validity',
                        status: 'Passed',
                        value: `Valid: Issued by ${certInfo.issuer} (${certInfo.daysRemaining} days remaining)`,
                        description: `The certificate is signed by a trusted authority and is active until ${new Date(certInfo.validTo).toLocaleDateString()}.`,
                        severity: 'low',
                        remediation: 'N/A'
                    });
                }
            } else {
                score -= 30;
                checks.push({
                    name: 'SSL/TLS Certificate Validity',
                    status: 'Failed',
                    value: `INVALID: ${certInfo.error || 'Untrusted certificate chain'}`,
                    description: `The SSL certificate configuration is untrusted or self-signed. Browsers will show security warnings to users. (Issued by: ${certInfo.issuer})`,
                    severity: 'high',
                    remediation: 'Acquire and configure a valid, trusted SSL/TLS certificate from Let\'s Encrypt or another certified root authority.'
                });
            }
        } else {
            if (isHttps) {
                score -= 20;
                checks.push({
                    name: 'SSL/TLS Certificate Validity',
                    status: 'Failed',
                    value: 'Could not fetch certificate data',
                    description: 'The secure socket connection could not retrieve certificate information. The server may be blocking queries or misconfigured.',
                    severity: 'medium',
                    remediation: 'Inspect your web server TLS handshake configuration and ensure port 443 is fully accessible.'
                });
            }
        }

        // CSP Check
        if (csp) {
            const hasUnsafeInline = csp.includes("'unsafe-inline'");
            const hasUnsafeEval = csp.includes("'unsafe-eval'");
            const hasWildcard = csp.includes('*');

            if (hasUnsafeInline || hasUnsafeEval || hasWildcard) {
                score -= 10;
                checks.push({
                    name: 'Content-Security-Policy (CSP)',
                    status: 'Failed',
                    value: `Weak Directives Active: ${csp.substring(0, 45)}...`,
                    description: "CSP is present but permits 'unsafe-inline', 'unsafe-eval', or wildcard origins. Attackers can bypass resource isolation filters and run XSS payloads.",
                    severity: 'medium',
                    remediation: "Refactor scripts to eliminate inline code. Set strict CSP directives using cryptographical nonces or hashes."
                });
            } else {
                checks.push({
                    name: 'Content-Security-Policy (CSP)',
                    status: 'Passed',
                    value: csp.length > 50 ? `${csp.substring(0, 50)}...` : csp,
                    description: 'CSP is present and correctly locks resource injection vectors.',
                    severity: 'low',
                    remediation: 'N/A'
                });
            }
        } else {
            score -= 25;
            checks.push({
                name: 'Content-Security-Policy (CSP)',
                status: 'Failed',
                value: 'Not configured',
                description: 'CSP helps prevent cross-site scripting (XSS) and clickjacking attacks by specifying exactly which dynamic resources are allowed to load.',
                severity: 'high',
                remediation: "Add a Content-Security-Policy header. Example: default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com;"
            });
        }

        // HSTS Check
        if (hsts) {
            const match = hsts.match(/max-age=(\d+)/i);
            const maxAge = match ? parseInt(match[1]) : 0;
            if (maxAge < 15768000) {
                score -= 10;
                checks.push({
                    name: 'Strict-Transport-Security (HSTS)',
                    status: 'Failed',
                    value: `Short duration (max-age=${maxAge}s)`,
                    description: 'HSTS is active, but the max-age duration is less than 6 months (15768000s). High security standards require at least 1-2 years to prevent downgrade intercepts.',
                    severity: 'medium',
                    remediation: 'Increase the Strict-Transport-Security max-age header value to 31536000 (1 year) or 63072000 (2 years).'
                });
            } else {
                checks.push({
                    name: 'Strict-Transport-Security (HSTS)',
                    status: 'Passed',
                    value: hsts,
                    description: 'HSTS enforces encrypted HTTPS transport across all sessions.',
                    severity: 'low',
                    remediation: 'N/A'
                });
            }
        } else {
            score -= 20;
            checks.push({
                name: 'Strict-Transport-Security (HSTS)',
                status: 'Failed',
                value: 'Not configured',
                description: 'HSTS forces browsers to communicate only through secure HTTPS connections, preventing man-in-the-middle attacks.',
                severity: 'medium',
                remediation: 'Add Strict-Transport-Security header. Example: max-age=63072000; includeSubDomains; preload'
            });
        }

        // X-Frame-Options Check
        if (xfo) {
            checks.push({
                name: 'X-Frame-Options',
                status: 'Passed',
                value: xfo,
                description: 'X-Frame-Options protects against clickjacking by preventing other sites from rendering your app inside an iframe.',
                severity: 'low',
                remediation: 'N/A'
            });
        } else {
            score -= 15;
            checks.push({
                name: 'X-Frame-Options',
                status: 'Failed',
                value: 'Not configured',
                description: 'X-Frame-Options protects against clickjacking by preventing other sites from rendering your app inside an iframe.',
                severity: 'medium',
                remediation: 'Set X-Frame-Options header to DENY or SAMEORIGIN.'
            });
        }

        // X-Content-Type-Options Check
        if (xcto) {
            checks.push({
                name: 'X-Content-Type-Options',
                status: 'Passed',
                value: xcto,
                description: 'Prevents browsers from MIME-sniffing a response away from the declared content-type, blocking script execution attacks.',
                severity: 'low',
                remediation: 'N/A'
            });
        } else {
            score -= 15;
            checks.push({
                name: 'X-Content-Type-Options',
                status: 'Failed',
                value: 'Not configured',
                description: 'Prevents browsers from MIME-sniffing a response away from the declared content-type, blocking script execution attacks.',
                severity: 'medium',
                remediation: 'Set X-Content-Type-Options header to nosniff.'
            });
        }

        // Referrer-Policy Check
        if (rp) {
            checks.push({
                name: 'Referrer-Policy',
                status: 'Passed',
                value: rp,
                description: 'Controls how much referrer information is sent along with requests, safeguarding user privacy.',
                severity: 'low',
                remediation: 'N/A'
            });
        } else {
            score -= 10;
            checks.push({
                name: 'Referrer-Policy',
                status: 'Failed',
                value: 'Not configured',
                description: 'Controls how much referrer information is sent along with requests, safeguarding user privacy.',
                severity: 'low',
                remediation: 'Set Referrer-Policy header to no-referrer-when-downgrade or strict-origin-when-cross-origin.'
            });
        }

        // Permissions-Policy Check
        if (pp) {
            checks.push({
                name: 'Permissions-Policy',
                status: 'Passed',
                value: pp,
                description: 'Restricts which browser APIs and features (e.g. camera, geolocation, microphone) are available to be accessed by the site.',
                severity: 'low',
                remediation: 'N/A'
            });
        } else {
            score -= 5;
            checks.push({
                name: 'Permissions-Policy',
                status: 'Failed',
                value: 'Not configured',
                description: 'Restricts which browser APIs and features (e.g. camera, geolocation, microphone) are available to be accessed by the site.',
                severity: 'low',
                remediation: "Add Permissions-Policy header. Example: camera=(), microphone=(), geolocation=()"
            });
        }

        // Information Leak: Server Version
        if (server) {
            const hasVersion = /\d+/.test(server);
            if (hasVersion) {
                score -= 10;
                checks.push({
                    name: 'Server Version Disclosure',
                    status: 'Failed',
                    value: `Exposed: ${server}`,
                    description: 'The Server header reveals exact software versions (e.g. apache, nginx). Attackers use these versions to lookup target exploits.',
                    severity: 'medium',
                    remediation: 'Configure server properties (like "server_tokens off" in Nginx, or "ServerSignature Off" in Apache) to suppress version details.'
                });
            }
        }

        // Information Leak: X-Powered-By
        if (xpb) {
            score -= 5;
            checks.push({
                name: 'Technology Stack Disclosure',
                status: 'Failed',
                value: `Exposed: ${xpb}`,
                description: 'The X-Powered-By header discloses the runtime engine (Express, PHP, ASP.NET), helping attackers refine exploitation profiles.',
                severity: 'low',
                remediation: 'Disable the X-Powered-By header. In Node.js Express, use app.disable("x-powered-by"); or adjust web server headers.'
            });
        }

        // Active Probe Results: Exposed .env file
        if (envExposed) {
            score -= 30;
            checks.push({
                name: 'Exposed Environment Configuration (.env)',
                status: 'Failed',
                value: 'VULNERABLE: Exposed environment files found',
                description: 'The .env configuration file contains sensitive credentials, database keys, and API secrets. Leaving it publicly readable is a critical severity risk.',
                severity: 'high',
                remediation: 'Configure your web server to block access to hidden files (starting with dot) immediately. Ensure .env is added to your .gitignore.'
            });
        }

        // Active Probe Results: Exposed .git repository
        if (gitExposed) {
            score -= 30;
            checks.push({
                name: 'Exposed Git Repository (.git/config)',
                status: 'Failed',
                value: 'VULNERABLE: Git repository directory accessible',
                description: 'Exposed Git folders allow attackers to download your entire source code history, revealing credentials, commits, and private repository structures.',
                severity: 'high',
                remediation: 'Restrict access to the .git directory in your web server configurations. Never deploy the .git directory to production.'
            });
        }

        // Active Probe Results: Exposed package.json
        if (pkgExposed) {
            score -= 10;
            checks.push({
                name: 'Exposed package.json File',
                status: 'Failed',
                value: 'VULNERABLE: package.json metadata accessible',
                description: 'Disclosing package.json exposes all library dependencies and versions, aiding attackers in searching for known CVE exploits.',
                severity: 'medium',
                remediation: 'Block direct access to package.json and project metadata files in your production router configuration.'
            });
        }

        // Determine Grade
        const finalScore = Math.max(0, Math.min(100, score));
        let grade = 'F';
        if (finalScore >= 90) grade = 'A+';
        else if (finalScore >= 80) grade = 'A';
        else if (finalScore >= 70) grade = 'B';
        else if (finalScore >= 50) grade = 'C';
        else if (finalScore >= 30) grade = 'D';

        const scanData = {
            url: normalized,
            score: finalScore,
            grade,
            server: server || 'Undetected',
            poweredBy: xpb || 'Undetected',
            checks,
            scannedAt: new Date().toISOString()
        };

        // Cache the completed scan details
        scanCache.set(normalized, {
            data: scanData,
            expiresAt: Date.now() + CACHE_TTL_MS
        });

        logSecurityEvent('INFO', 'SCAN_COMPLETED', { url: normalized, score: finalScore, grade });

        return NextResponse.json(scanData);

    } catch (err) {
        clearTimeout(timeoutId);
        const errorName = (err instanceof Error) ? err.name : '';
        logSecurityEvent('ERROR', 'SCAN_FAILED', { url: normalized, hostname, error: String(err) });
        if (errorName === 'AbortError') {
            return NextResponse.json({ error: 'Connection Timeout: The target website took too long to respond.' }, { status: 504 });
        }
        return NextResponse.json({ error: `Connection Failed: Unable to fetch security information from ${hostname}. Make sure the URL is public and valid.` }, { status: 502 });
    }
}
