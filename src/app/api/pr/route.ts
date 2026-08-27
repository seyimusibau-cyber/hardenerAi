import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { parseDiffPath, applyUnifiedDiff } from '@/lib/apply-diff';

// POST /api/pr { findingId } -> opens a GitHub PR with the finding's validated
// remediation diff. Single-file diffs are applied to real content; if the diff
// can't be applied cleanly, we still open a PR with the diff attached so a human
// can apply it (rule book: keep a human in the loop).
function parseRepo(url: string): { owner: string; repo: string } | null {
    const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    return m ? { owner: m[1], repo: m[2] } : null;
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

        const token = process.env.GITHUB_TOKEN;
        if (!token) return NextResponse.json({ error: 'GitHub integration not configured' }, { status: 501 });

        const { findingId } = await request.json();
        const { data: finding } = await supabase.from('findings').select('*, scans!inner(user_id, target_url)')
            .eq('id', findingId).single();
        if (!finding || (finding as any).scans.user_id !== user.id) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        const diff = finding.unified_diff;
        if (!diff) return NextResponse.json({ error: 'Finding has no remediation diff' }, { status: 400 });

        const repo = parseRepo((finding as any).scans.target_url);
        if (!repo) return NextResponse.json({ error: 'Target is not a GitHub repo' }, { status: 400 });

        // Base branch + latest commit/tree
        const repoInfo = await gh(`/repos/${repo.owner}/${repo.repo}`, token);
        const base = repoInfo.default_branch;
        const ref = await gh(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${base}`, token);
        const baseSha = ref.object.sha;
        const branch = `hardener/fix-${String(findingId).slice(0, 8)}`;

        const filePath = parseDiffPath(diff);
        let applied = false;
        let prBody = `Automated remediation from **Hardener AI**.\n\n${finding.reasoning || ''}\n`;

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
                            message: `fix: ${finding.rule_id || 'security finding'} (Hardener AI)`,
                            content: Buffer.from(patched, 'utf8').toString('base64'),
                            sha: fileRes.sha, branch,
                        }),
                    });
                    applied = true;
                }
            } catch (e: any) {
                console.error('[pr] diff apply failed, attaching instead:', e.message);
            }
        }

        if (!applied) {
            prBody += `\n> ⚠️ Could not auto-apply the patch. Apply this diff manually:\n\n\`\`\`diff\n${diff}\n\`\`\``;
            // Ensure the branch differs from base so a PR can open: drop a note file.
            await gh(`/repos/${repo.owner}/${repo.repo}/contents/HARDENER_FIX_${String(findingId).slice(0, 8)}.md`, token, {
                method: 'PUT',
                body: JSON.stringify({
                    message: `chore: Hardener remediation note for ${finding.rule_id}`,
                    content: Buffer.from(`# Hardener remediation\n\n\`\`\`diff\n${diff}\n\`\`\`\n`, 'utf8').toString('base64'),
                    branch,
                }),
            }).catch(() => {});
        }

        const pr = await gh(`/repos/${repo.owner}/${repo.repo}/pulls`, token, {
            method: 'POST',
            body: JSON.stringify({
                title: `[Hardener] Fix ${finding.rule_id || 'security finding'}`,
                head: branch, base, body: prBody,
            }),
        });

        await supabase.from('remediation_prs').insert({
            finding_id: findingId, user_id: user.id, pr_url: pr.html_url, pr_number: pr.number, status: 'open',
        });
        return NextResponse.json({ pr_url: pr.html_url, pr_number: pr.number, auto_applied: applied });
    } catch (err: any) {
        console.error('PR route error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
