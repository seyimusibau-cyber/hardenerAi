// The contract these tests defend: `classifyTarget` decides which
// authorization rule applies, and `parseGitHubRepo` decides what reaches
// `git clone`. Both are security controls, so the interesting cases are the
// hostile ones, not the happy path.
import { describe, it, expect } from 'vitest';
import { classifyTarget, parseGitHubRepo, repoCloneUrl } from '../target';

describe('classifyTarget', () => {
    // These cases are duplicated in worker/test/sources.test.mjs. The worker
    // runs in a separate container and cannot import this module, so the only
    // thing keeping the two implementations honest is that both lists pass.
    it('routes GitHub URLs to git', () => {
        expect(classifyTarget('https://github.com/owner/repo')).toBe('git');
        expect(classifyTarget('git@github.com:owner/repo.git')).toBe('git');
        expect(classifyTarget('https://gitlab.com/x/y.git')).toBe('git');
    });

    it('routes plain sites to web, where domain verification still applies', () => {
        expect(classifyTarget('https://example.com')).toBe('web');
        expect(classifyTarget('acme.io')).toBe('web');
    });
});

describe('parseGitHubRepo', () => {
    it('accepts the forms a user actually types', () => {
        expect(parseGitHubRepo('https://github.com/vercel/next.js')).toEqual({ owner: 'vercel', repo: 'next.js' });
        expect(parseGitHubRepo('github.com/vercel/next.js')).toEqual({ owner: 'vercel', repo: 'next.js' });
        expect(parseGitHubRepo('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
        expect(parseGitHubRepo('git@github.com:owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
        expect(parseGitHubRepo('https://github.com/owner/repo/tree/main/src')).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('refuses hosts that merely look like GitHub', () => {
        // A substring match would pass all three of these straight to git clone.
        expect(parseGitHubRepo('https://github.com.evil.tld/owner/repo')).toBeNull();
        expect(parseGitHubRepo('https://notgithub.com/owner/repo')).toBeNull();
        expect(parseGitHubRepo('https://evil.tld/github.com/owner/repo')).toBeNull();
    });

    it('refuses credentials embedded in the URL', () => {
        // These would end up inside a clone command and in any logged error.
        expect(parseGitHubRepo('https://user:token@github.com/owner/repo')).toBeNull();
    });

    it('refuses path traversal and malformed names', () => {
        expect(parseGitHubRepo('https://github.com/owner/..')).toBeNull();
        expect(parseGitHubRepo('https://github.com/owner/.')).toBeNull();
        expect(parseGitHubRepo('https://github.com/../repo')).toBeNull();
        expect(parseGitHubRepo('https://github.com/owner')).toBeNull();
        expect(parseGitHubRepo('https://github.com/')).toBeNull();
        expect(parseGitHubRepo('https://github.com/-bad/repo')).toBeNull();
        expect(parseGitHubRepo('https://github.com/own er/repo')).toBeNull();
    });

    it('refuses non-http schemes', () => {
        expect(parseGitHubRepo('file:///etc/passwd')).toBeNull();
        expect(parseGitHubRepo('ssh://github.com/owner/repo')).toBeNull();
    });

    it('builds a clone URL from the parsed parts, never from raw input', () => {
        const parsed = parseGitHubRepo('https://github.com/owner/repo/tree/main?x=1#y');
        expect(repoCloneUrl(parsed!)).toBe('https://github.com/owner/repo.git');
    });
});
