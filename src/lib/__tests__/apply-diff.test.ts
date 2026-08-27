import { describe, it, expect } from 'vitest';
import { applyUnifiedDiff, parseDiffPath } from '../apply-diff';

describe('parseDiffPath', () => {
    it('reads the b/ path', () => {
        expect(parseDiffPath('--- a/src/x.js\n+++ b/src/x.js\n@@ -1 +1 @@')).toBe('src/x.js');
    });
    it('returns null when no +++ header', () => {
        expect(parseDiffPath('no header here')).toBeNull();
    });
});

describe('applyUnifiedDiff', () => {
    const original = ['line1', 'line2', 'line3', 'line4'].join('\n');

    it('applies a simple single-line replacement', () => {
        const diff = [
            '--- a/f.txt', '+++ b/f.txt',
            '@@ -2,1 +2,1 @@', '-line2', '+LINE2',
        ].join('\n');
        expect(applyUnifiedDiff(original, diff)).toBe(['line1', 'LINE2', 'line3', 'line4'].join('\n'));
    });

    it('applies an addition with surrounding context', () => {
        const diff = [
            '--- a/f.txt', '+++ b/f.txt',
            '@@ -1,2 +1,3 @@', ' line1', '+inserted', ' line2',
        ].join('\n');
        expect(applyUnifiedDiff(original, diff)).toBe(['line1', 'inserted', 'line2', 'line3', 'line4'].join('\n'));
    });

    it('returns null on context mismatch (never corrupts the file)', () => {
        const diff = [
            '--- a/f.txt', '+++ b/f.txt',
            '@@ -2,1 +2,1 @@', '-WRONG', '+X',
        ].join('\n');
        expect(applyUnifiedDiff(original, diff)).toBeNull();
    });

    it('preserves trailing lines after the last hunk', () => {
        const diff = [
            '--- a/f.txt', '+++ b/f.txt',
            '@@ -1,1 +1,1 @@', '-line1', '+first',
        ].join('\n');
        expect(applyUnifiedDiff(original, diff)).toBe(['first', 'line2', 'line3', 'line4'].join('\n'));
    });
});
