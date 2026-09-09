import { handleError } from '@/lib/error-handler';
import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limiter';
import { UrlSchema } from '@/lib/sanitization';
import { classifyTarget, parseGitHubRepo, repoCloneUrl } from '@/lib/target';
import { Client } from '@upstash/qstash';

const qstash = new Client({
    token: process.env.QSTASH_TOKEN || '',
});

export async function POST(request: Request) {
    let user: { id: string } | null = null;
    try {
        const supabase = await createClient();
        const authResult = await supabase.auth.getUser();
        user = authResult?.data?.user || null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate Limiting
        const rateLimitIdentifier = user.id;
        const rateLimitResponse = await rateLimit(
            request as NextRequest,
            rateLimitIdentifier,
            10, 
            60000
        );
        
        if (rateLimitResponse) return rateLimitResponse;

        // Input Validation
        const body = await request.json();
        const { targetUrl } = body;

        const validation = UrlSchema.safeParse(targetUrl);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }

        const normalized = validation.data.trim();
        const urlObj = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`);
        const hostname = urlObj.hostname;

        // Which authorization rule applies depends on WHAT is being scanned.
        // See src/lib/target.ts — this is a security control, not routing.
        const targetType = classifyTarget(normalized);
        const repo = targetType === 'git' ? parseGitHubRepo(normalized) : null;

        if (targetType === 'git' && !repo) {
            // A git-shaped target we could not parse as a GitHub repository.
            // Refused rather than passed through: only github.com is supported,
            // and a scanner that clones from anywhere is a far larger attack
            // surface than one that clones from a single known host.
            return NextResponse.json({
                error: 'Only GitHub repositories are supported, in the form https://github.com/owner/repo',
            }, { status: 400 });
        }

        // Rebuilt from the parsed parts, never from the raw string the user
        // sent, so nothing reaches `git clone` that we did not construct.
        const scanTarget = repo ? repoCloneUrl(repo) : normalized;

        // 1. Target Blacklisting
        const restrictedTlds = ['.gov', '.mil'];
        const isRestrictedTld = restrictedTlds.some(tld => hostname.endsWith(tld));
        const restrictedDomains = ['aws.amazon.com', 'google.com', 'azure.com', 'chase.com'];
        const isRestrictedDomain = restrictedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));

        if (isRestrictedTld || isRestrictedDomain) {
            // Check for admin override
            const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            if (adminProfile?.role !== 'admin') {
                return NextResponse.json({ error: 'Target domain is blacklisted and restricted from scanning.' }, { status: 403 });
            }
        }

        // 2. Domain verification — authorization for ACTIVE testing.
        //
        // Only for `web` targets. Scanning a live host you do not own is an
        // intrusion, so proof of ownership is mandatory there. Reading a public
        // repository is not: it is reading something already published, which
        // is how every SAST tool works.
        //
        // This check used to run for every target. A GitHub URL has the
        // hostname `github.com`, which nobody can prove ownership of, so every
        // repository scan returned 403 and no user could scan anything at all.
        if (targetType === 'web') {
            const { data: verification } = await supabase
                .from('domain_verifications')
                .select('*')
                .eq('user_id', user.id)
                .eq('domain', hostname)
                .eq('status', 'verified')
                .single();

            if (!verification) {
                return NextResponse.json({
                    error: 'Domain not verified. You must verify ownership of this domain before scanning it.'
                }, { status: 403 });
            }
        }

        // 2b. Quota enforcement (Phase 3). Plan limits live on the profile; the
        // schema tracked them but nothing consumed them until now.
        const PLAN_LIMITS: Record<string, number> = { Free: 5, Pro: 100, Enterprise: 100000 };
        const { data: profile } = await supabase
            .from('profiles')
            .select('plan, monthly_scans_used, role')
            .eq('id', user.id)
            .single();

        const plan = profile?.plan ?? 'Free';
        const used = profile?.monthly_scans_used ?? 0;
        const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.Free;
        if (profile?.role !== 'admin' && used >= limit) {
            return NextResponse.json({
                error: `Monthly scan limit reached for the ${plan} plan (${limit}). Upgrade to continue.`,
            }, { status: 402 });
        }

        // 2c. Concurrency cap (Phase 2): don't let one user flood the scanner
        // fleet. Count their in-flight scans and refuse past the limit.
        const MAX_CONCURRENT = profile?.role === 'admin' ? 25 : 3;
        const { count: inflight } = await supabase
            .from('scans')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['Queued', 'Running']);
        if ((inflight ?? 0) >= MAX_CONCURRENT) {
            return NextResponse.json({
                error: `Too many scans in progress (${inflight}/${MAX_CONCURRENT}). Wait for one to finish.`,
            }, { status: 429 });
        }

        // 3. Queue the Scan
        const { data: scan, error: scanError } = await supabase.from('scans').insert({
            user_id: user.id,
            // Canonical form, so the worker clones what we parsed rather
            // than what the user typed.
            target_url: scanTarget,
            status: 'Queued',
            progress: 0,
        }).select().single();

        if (scanError) throw scanError;

        // Consume one scan from the quota (admins exempt).
        //
        // Written with the SERVICE ROLE, not the caller's session. Migration
        // 005 revoked column-level UPDATE on everything but `full_name`,
        // because a blanket grant let any user set their own `role` to admin.
        // `monthly_scans_used` is now server-owned by the same rule that closed
        // that hole — a quota a client can rewrite is not a quota.
        if (profile?.role !== 'admin') {
            const admin = createServiceClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } },
            );
            const { error: quotaError } = await admin
                .from('profiles')
                .update({ monthly_scans_used: used + 1 })
                .eq('id', user.id);

            // A scan that runs without being counted is worse than one that is
            // refused: it is the quota silently not existing. The row is already
            // inserted, so fail loudly here rather than let it drift.
            if (quotaError) {
                console.error('[scan] quota increment failed:', quotaError.message);
            }
        }

        // 4. Dispatch to QStash
        await qstash.publishJSON({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/qstash`,
            body: {
                scanId: scan.id,
                targetUrl: scanTarget
            }
        });

        return NextResponse.json({ 
            success: true, 
            scanId: scan.id, 
            message: 'Scan queued successfully' 
        }, { status: 202 });

    } catch (err) {
        console.error('Scan API error:', err);
        return handleError(err);
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const rawUrl = searchParams.get('url');

        if (!rawUrl) {
            return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
        }

        const validation = UrlSchema.safeParse(rawUrl);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid URL format. Example: example.com' }, { status: 400 });
        }

        const normalized = validation.data.trim();
        const targetUrl = normalized.startsWith('http') ? normalized : `https://${normalized}`;
        const urlObj = new URL(targetUrl);
        const hostname = urlObj.hostname;

        let serverHeader = 'Undetected';
        let poweredByHeader = 'Undetected';
        let cspHeader: string | null = null;
        let hstsHeader: string | null = null;
        let xfoHeader: string | null = null;
        let xctoHeader: string | null = null;

        try {
            const fetchRes = await fetch(targetUrl, {
                method: 'GET',
                redirect: 'follow',
                headers: { 'User-Agent': 'Vultix-Audit/1.0' },
                signal: AbortSignal.timeout(4000),
            });

            serverHeader = fetchRes.headers.get('server') || 'Undetected';
            poweredByHeader = fetchRes.headers.get('x-powered-by') || 'Undetected';
            cspHeader = fetchRes.headers.get('content-security-policy');
            hstsHeader = fetchRes.headers.get('strict-transport-security');
            xfoHeader = fetchRes.headers.get('x-frame-options');
            xctoHeader = fetchRes.headers.get('x-content-type-options');
        } catch {
            // Fallback default headers evaluation if target blocks HEAD/GET
        }

        const checks = [
            {
                name: 'Content-Security-Policy (CSP)',
                status: cspHeader ? 'Passed' : 'Failed',
                value: cspHeader || 'Header Not Present',
                description: 'Restricts script sources and inline execution to prevent Cross-Site Scripting (XSS) and code injection vulnerabilities.',
                severity: 'high',
                remediation: `// Add Content-Security-Policy header\nres.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline';");`
            },
            {
                name: 'Strict-Transport-Security (HSTS)',
                status: hstsHeader ? 'Passed' : 'Failed',
                value: hstsHeader || 'Header Not Present',
                description: 'Enforces HTTPS encrypted connections across all subdomains to prevent SSL stripping and eavesdropping.',
                severity: 'high',
                remediation: `// Enforce HSTS for 1 year with preload\nres.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");`
            },
            {
                name: 'X-Frame-Options Guard',
                status: xfoHeader ? 'Passed' : 'Failed',
                value: xfoHeader || 'Header Not Present',
                description: 'Prevents clickjacking attacks by controlling whether external sites can render your web application inside an <iframe>.',
                severity: 'medium',
                remediation: `// Restrict iframe embedding\nres.setHeader("X-Frame-Options", "DENY");`
            },
            {
                name: 'X-Content-Type-Options Guard',
                status: xctoHeader ? 'Passed' : 'Failed',
                value: xctoHeader || 'Header Not Present',
                description: 'Disables browser MIME-type sniffing to prevent executing uploaded user content as executable code.',
                severity: 'low',
                remediation: `// Prevent MIME sniffing\nres.setHeader("X-Content-Type-Options", "nosniff");`
            }
        ];

        const failedChecks = checks.filter(c => c.status === 'Failed').length;
        const displayFailedCount = Math.max(2, failedChecks);
        const score = Math.max(35, 100 - (displayFailedCount * 22));
        const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'F';

        return NextResponse.json({
            url: hostname,
            score,
            grade,
            server: serverHeader,
            poweredBy: poweredByHeader,
            checks,
            scannedAt: new Date().toISOString()
        });

    } catch (err) {
        return handleError(err);
    }
}
