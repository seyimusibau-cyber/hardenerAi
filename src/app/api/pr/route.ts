import { handleError } from '@/lib/error-handler';
import { parseGitHubRepo } from '@/lib/target';
import { rateLimit } from '@/lib/rate-limiter';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { parseDiffPath, applyUnifiedDiff } from '@/lib/apply-diff';

// POST /api/pr { findingId } -> opens a GitHub PR with the finding's validated
// remediation diff. Single-file diffs are applied to real content; if the diff
// can't be applied cleanly, we still open a PR with the diff attached so a human
// can apply it (rule book: keep a human in the loop).
// Which repositories this deployment may open a pull request on.
//
// This route acts with ONE shared credential — `GITHUB_TOKEN`, the operator's
// own account. It verifies the finding belongs to the caller's scan, then takes
// the repository from that scan's target. Before the git/web split in
// `/api/scan`, no user could scan a repository at all, so this was unreachable.
// The moment repository scans work, an unrestricted version of this route lets
// any signed-up stranger scan any public repository and have Vultix push a
// branch and open a pull request on it FROM THE OPERATOR'S ACCOUNT. Rate limits
// bound the volume; they do not change whose name is on the commit.
//
// So: deny by default, and allow only repositories the operator has explicitly
// listed. `PR_ALLOWED_REPOS=owner/repo,owner/other` — unset means the feature is
// off entirely.
//
// This is a holding measure, not the design. The real fix is the GitHub App
// (IMPLEMENTATION_PLAN.md §1.6): the user installs it on their own repositories,
// the token is theirs and expires hourly, and pull requests come from Vultix
// rather than from the operator. When that lands, this allow-list is replaced by
// "does this user have an installation covering this repository".
function prAllowList(): string[] {
    return (process.env.PR_ALLOWED_REPOS || '')
        .split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
}

async function gh(path: string, token: string, init?: RequestInit) {
    const res = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
    });
    if (!res.ok) throw new Error(`GitHub ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const rl = await rateLimit(request as NextRequest, `pr:${user.id}`, 5, 60_000);
        if (rl) return rl;

        const token = process.env.GITHUB_TOKEN;
        if (!token) return NextResponse.json({ error: 'GitHub integration not configured' }, { status: 501 });

        const { findingId } = await request.json();
        const { data: finding } = await supabase.from('findings').select('*, scans!inner(user_id, target_url)')
            .eq('id', findingId).single();
        const fscan = (finding as { scans?: { user_id: string; target_url: string } } | null)?.scans;
        if (!finding || fscan?.user_id !== user.id) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        const diff = finding.unified_diff;
        if (!diff) return NextResponse.json({ error: 'Finding has no remediation diff' }, { status: 400 });

        const repo = parseGitHubRepo(fscan!.target_url);
        if (!repo) return NextResponse.json({ error: 'Target is not a GitHub repo' }, { status: 400 });

        // Deny by default. See prAllowList() above for why this exists.
        const allowed = prAllowList();
        if (allowed.length === 0) {
            return NextResponse.json({
                error: 'Opening pull requests is not enabled on this deployment.',
            }, { status: 501 });
        }
        if (!allowed.includes(`${repo.owner}/${repo.repo}`.toLowerCase())) {
            return NextResponse.json({
                error: 'Vultix cannot open a pull request on this repository. '
                     + 'Download the patch and apply it yourself, or connect the repository once GitHub App support ships.',
            }, { status: 403 });
        }

        // Base branch + latest commit/tree
        const repoInfo = await gh(`/repos/${repo.owner}/${repo.repo}`, token);
        const base = repoInfo.default_branch;
        const ref = await gh(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${base}`, token);
        const baseSha = ref.object.sha;
        const branch = `vultix/fix-${String(findingId).slice(0, 8)}`;

        const filePath = parseDiffPath(diff);
        let applied = false;
        let prBody = `Automated remediation from **Vultix**.\n\n${finding.reasoning || ''}\n`;

        // Create the branch
        await gh(`/repos/${repo.owner}/${repo.repo}/git/refs`, token, {
            method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
        }).catch(() => {}); // ignore if it already exists

        if (filePath) {
            try {
                const fileRes = await gh(`/repos/${repo.owner}/${repo.repo}/contents/${encodeURIComponent(filePath)}?ref=${base}`, token);
                const original = Buffer.from(fileRes.content, 'base64').toString('utf8');
                const patched = applyUnifiedDiff(original, diff);
                if (patched !== null && patched !== original) {
                    await gh(`/repos/${repo.owner}/${repo.repo}/contents/${encodeURIComponent(filePath)}`, token, {
                        method: 'PUT',
                        body: JSON.stringify({
                            message: `fix: ${finding.rule_id || 'security finding'} (Vultix)`,
                            content: Buffer.from(patched, 'utf8').toString('base64'),
                            sha: fileRes.sha, branch,
                        }),
                    });
                    applied = true;
                }
            } catch (e) {
                console.error('[pr] diff apply failed, attaching instead:', e);
            }
        }

        if (!applied) {
            prBody += `\n> ⚠️ Could not auto-apply the patch. Apply this diff manually:\n\n\`\`\`diff\n${diff}\n\`\`\``;
            // Ensure the branch differs from base so a PR can open: drop a note file.
            await gh(`/repos/${repo.owner}/${repo.repo}/contents/VULTIX_FIX_${String(findingId).slice(0, 8)}.md`, token, {
                method: 'PUT',
                body: JSON.stringify({
                    message: `chore: Vultix remediation note for ${finding.rule_id}`,
                    content: Buffer.from(`# Vultix remediation\n\n\`\`\`diff\n${diff}\n\`\`\`\n`, 'utf8').toString('base64'),
                    branch,
                }),
            }).catch(() => {});
        }

        const pr = await gh(`/repos/${repo.owner}/${repo.repo}/pulls`, token, {
            method: 'POST',
            body: JSON.stringify({
                title: `[Vultix] Fix ${finding.rule_id || 'security finding'}`,
                head: branch, base, body: prBody,
            }),
        });

        // Service role: `remediation_prs` has a SELECT policy and no INSERT
        // one (003), so a user-scoped write is silently rejected by RLS — the
        // pull request would open on GitHub and leave no record here. Rows are
        // server-owned, like `findings` and now `scans`.
        const admin = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } },
        );
        const { error: prRowError } = await admin.from('remediation_prs').insert({
            finding_id: findingId, user_id: user.id, pr_url: pr.html_url, pr_number: pr.number, status: 'open',
        });
        // The PR is already open on GitHub at this point, so this cannot fail
        // the request — but an unrecorded PR is invisible to the dashboard and
        // would be opened twice on the next click.
        if (prRowError) console.error('[pr] failed to record remediation_pr:', prRowError.message);
        return NextResponse.json({ pr_url: pr.html_url, pr_number: pr.number, auto_applied: applied });
    } catch (err) {
        console.error('PR route error:', err);
        return handleError(err);
    }
}
