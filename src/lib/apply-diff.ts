// Minimal single-file unified-diff applier. Handles standard `@@ -a,b +c,d @@`
// hunks for ONE file. Returns the patched content, or null if it doesn't apply
// cleanly (caller then falls back to attaching the diff instead of a code PR).
export function parseDiffPath(diff: string): string | null {
    const m = diff.match(/^\+\+\+ [ab]\/(.+)$/m) || diff.match(/^\+\+\+ (.+)$/m);
    return m ? m[1].trim() : null;
}

export function applyUnifiedDiff(original: string, diff: string): string | null {
    const lines = original.split('\n');
    const out: string[] = [];
    let cursor = 0; // 0-based index into `lines`
    const diffLines = diff.split('\n');

    let i = 0;
    // skip file headers
    while (i < diffLines.length && !diffLines[i].startsWith('@@')) i++;

    while (i < diffLines.length) {
        const h = diffLines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!h) { i++; continue; }
        const oldStart = parseInt(h[1], 10) - 1;
        // copy unchanged lines up to hunk start
        if (oldStart < cursor) return null;
        for (; cursor < oldStart; cursor++) out.push(lines[cursor]);
        i++;
        // apply hunk body
        while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
            const l = diffLines[i];
            if (l.startsWith('+')) { out.push(l.slice(1)); }
            else if (l.startsWith('-')) {
                if (lines[cursor] !== l.slice(1)) return null; // context mismatch
                cursor++;
            } else { // context (space prefix or empty)
                const ctx = l.startsWith(' ') ? l.slice(1) : l;
                if (lines[cursor] !== ctx) return null;
                out.push(lines[cursor]); cursor++;
            }
            i++;
        }
    }
    for (; cursor < lines.length; cursor++) out.push(lines[cursor]);
    return out.join('\n');
}
