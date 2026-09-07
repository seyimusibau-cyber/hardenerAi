// What kind of thing are we being asked to scan?
//
// This decides which authorization rule applies, so it is a security control,
// not a convenience:
//
//   git  — source code in a repository. Reading a PUBLIC repository is not
//          active testing; it is reading something already published. No proof
//          of ownership is required, which is how every SAST tool works.
//
//   web  — a live site. Pointing a scanner at a host you do not own IS active
//          testing, and doing it without permission is an intrusion. DNS-TXT
//          domain verification stays mandatory here.
//
// The rule used to be "verify ownership of everything", which sounds stricter
// but was not: a GitHub URL has the hostname `github.com`, nobody can prove
// ownership of that, so every repository scan returned 403 and the product had
// no working path at all.
//
// KEEP IN SYNC with `worker/sources.mjs:classifyTarget`. The worker is a
// separate container and cannot import this file; `src/lib/__tests__/target.test.ts`
// pins the shared cases so the two cannot drift silently.

export type TargetType = 'git' | 'web';

export function classifyTarget(target: string): TargetType {
    const t = target.trim();
    if (/github\.com[/:]/.test(t) || t.endsWith('.git')) return 'git';
    return 'web';
}

export interface GitHubRepo {
    owner: string;
    repo: string;
}

// GitHub's own limits: owner is 1-39 chars of alphanumerics and single hyphens;
// repo allows word characters, dots and hyphens. Anchored, because a loose
// pattern here would let a crafted target reach `git clone` as something other
// than the repository the user thinks they typed.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * Parse a GitHub repository target, or return null.
 *
 * Deliberately narrow: only github.com, only `owner/repo`. Other git hosts are
 * refused for now rather than half-supported — `/api/pr` speaks GitHub's API
 * only, and a scanner that clones from anywhere is a much larger attack surface
 * than one that clones from a single known host.
 */
export function parseGitHubRepo(target: string): GitHubRepo | null {
    let raw = target.trim();
    if (raw.startsWith('git@github.com:')) {
        raw = 'https://github.com/' + raw.slice('git@github.com:'.length);
    }
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    // Exact host match — `github.com.evil.tld` and `notgithub.com` must not pass.
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    // Credentials in the URL are never legitimate here and would end up in a
    // clone command and in logs.
    if (url.username || url.password) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!OWNER.test(owner) || !REPO.test(repo)) return null;
    // `.` and `..` are valid against REPO but are path traversal, not repos.
    if (repo === '.' || repo === '..') return null;

    return { owner, repo };
}

/** The canonical clone URL for a parsed repo. Never echoes user input back. */
export function repoCloneUrl({ owner, repo }: GitHubRepo): string {
    return `https://github.com/${owner}/${repo}.git`;
}
