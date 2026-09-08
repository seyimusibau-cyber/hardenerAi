// The contract these tests defend: a patch counts as validated only when the
// generated test FAILED before it and PASSED after. Everything else — a clean
// apply, a test that was already green — is not evidence of a fix.
import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePatch, patchApplies } from "../validate.mjs";

const BUGGY = `export function applyDiscount(total, pct) {
  // pct arrives as 0-100
  return total - (total * pct);
}
`;
const FIXED = `export function applyDiscount(total, pct) {
  // pct arrives as 0-100
  return total - (total * pct / 100);
}
`;
// Fails on BUGGY (returns -180), passes on FIXED (returns 18).
const REAL_TEST = `import { test } from "node:test";
import assert from "node:assert";
import { applyDiscount } from "./cart.mjs";
test("ten percent off twenty is eighteen", () => {
  assert.strictEqual(applyDiscount(20, 10), 18);
});
`;
// Passes on both. This is the one the old code would have called validated.
const VACUOUS_TEST = `import { test } from "node:test";
import assert from "node:assert";
test("the sun rose", () => { assert.ok(true); });
`;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
}

/** A repo sitting at the buggy commit, plus a valid diff from buggy -> fixed. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "vultix-validate-"));
  git(["init", "-q", "."], dir);
  git(["config", "user.name", "T"], dir);
  git(["config", "user.email", "t@e.com"], dir);
  writeFileSync(join(dir, "cart.mjs"), BUGGY);
  git(["add", "-A"], dir);
  git(["commit", "-qm", "buggy"], dir);

  // Derive the diff from git itself rather than hand-writing one.
  writeFileSync(join(dir, "cart.mjs"), FIXED);
  const diff = git(["diff"], dir);
  git(["checkout", "--", "."], dir);
  return { dir, diff };
}

const cleanup = (dir) => { try { rmSync(dir, { recursive: true, force: true }); } catch {} };

test("a real fix, with a test that fails before and passes after, validates", () => {
  const { dir, diff } = makeRepo();
  try {
    const r = validatePatch(dir, diff, REAL_TEST, "javascript");
    assert.strictEqual(r.applied, true);
    assert.strictEqual(r.failedBefore, true, "test must fail on the unpatched tree");
    assert.strictEqual(r.validated, true, r.reason);
  } finally { cleanup(dir); }
});

test("a test that already passes is NOT validation, even with a real fix", () => {
  const { dir, diff } = makeRepo();
  try {
    const r = validatePatch(dir, diff, VACUOUS_TEST, "javascript");
    assert.strictEqual(r.applied, true, "the patch itself is fine");
    assert.strictEqual(r.failedBefore, false);
    assert.strictEqual(r.validated, false, "a vacuous test proves nothing");
    assert.match(r.reason, /before the patch/);
  } finally { cleanup(dir); }
});

test("a patch that applies cleanly but does not fix anything is not validated", () => {
  const { dir } = makeRepo();
  try {
    // Touches only the comment: applies, changes no behaviour.
    const cosmetic = [
      "diff --git a/cart.mjs b/cart.mjs",
      "--- a/cart.mjs",
      "+++ b/cart.mjs",
      "@@ -1,4 +1,4 @@",
      " export function applyDiscount(total, pct) {",
      "-  // pct arrives as 0-100",
      "+  // pct arrives as a percentage, 0-100",
      "   return total - (total * pct);",
      " }",
      "",
    ].join("\n");
    assert.strictEqual(patchApplies(dir, cosmetic), true, "precondition: it applies");
    const r = validatePatch(dir, cosmetic, REAL_TEST, "javascript");
    assert.strictEqual(r.applied, true);
    assert.strictEqual(r.failedBefore, true);
    assert.strictEqual(r.validated, false, "applying cleanly is not fixing");
    assert.match(r.reason, /still fails/);
  } finally { cleanup(dir); }
});

test("a patch that does not apply is reported as such", () => {
  const { dir } = makeRepo();
  try {
    const r = validatePatch(dir, "not a diff at all", REAL_TEST, "javascript");
    assert.strictEqual(r.applied, false);
    assert.strictEqual(r.validated, false);
    assert.match(r.reason, /does not apply/);
  } finally { cleanup(dir); }
});

test("an unrunnable language is reported unproven, never validated", () => {
  const { dir, diff } = makeRepo();
  try {
    const r = validatePatch(dir, diff, REAL_TEST, "rust");
    assert.strictEqual(r.applied, true);
    assert.strictEqual(r.validated, false);
    assert.match(r.reason, /no test runner/);
  } finally { cleanup(dir); }
});

test("a missing test leaves the patch unproven", () => {
  const { dir, diff } = makeRepo();
  try {
    const r = validatePatch(dir, diff, "", "javascript");
    assert.strictEqual(r.applied, true);
    assert.strictEqual(r.validated, false);
    assert.match(r.reason, /unproven/);
  } finally { cleanup(dir); }
});

test("the working tree is restored afterwards", () => {
  const { dir, diff } = makeRepo();
  try {
    validatePatch(dir, diff, REAL_TEST, "javascript");
    assert.strictEqual(git(["status", "--porcelain"], dir).trim(), "",
      "validation must not leave the repo dirty");
  } finally { cleanup(dir); }
});

test("validating one patch does not contaminate the next", () => {
  // scan.mjs calls validatePatch once per finding against the SAME repoDir.
  // If a run leaves its patch behind, every later finding is judged against a
  // tree that already carries it — and this is exactly what `git apply --3way`
  // plus `git checkout -- .` used to do, because --3way stages its result.
  const { dir, diff } = makeRepo();
  try {
    const first = validatePatch(dir, diff, REAL_TEST, "javascript");
    assert.strictEqual(first.validated, true, first.reason);

    // Same inputs again: if the tree were still patched, the test would now
    // pass BEFORE the patch and this would come back unvalidated.
    const second = validatePatch(dir, diff, REAL_TEST, "javascript");
    assert.strictEqual(second.failedBefore, true, "tree was left patched by the first run");
    assert.strictEqual(second.validated, true, second.reason);
  } finally { cleanup(dir); }
});

// --- the apply ladder ---------------------------------------------------
// Models get two mechanical things wrong often enough to matter: they omit the
// a/ b/ path prefixes, and they miscount the @@ hunk header. Measured on 33
// recorded model patches, tolerating both took gate 1 from 8/33 to 22/33 with
// no regressions. These pin the two rungs that did it.
import { mkdtempSync as mk, writeFileSync as wf } from "node:fs";

function repoWith(file, body) {
  const dir = mk(join(tmpdir(), "ladder-"));
  wf(join(dir, file), body);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x"], { cwd: dir });
  return dir;
}

test("gate 1 accepts a diff written without a/ b/ prefixes", () => {
  const dir = repoWith("cart.mjs", BUGGY);
  try {
    // -p1 would strip "cart.mjs" itself and look for a file that isn't there.
    const patch = `--- cart.mjs\n+++ cart.mjs\n@@ -1,4 +1,4 @@\n export function applyDiscount(total, pct) {\n   // pct arrives as 0-100\n-  return total - (total * pct);\n+  return total - (total * pct / 100);\n }\n`;
    assert.strictEqual(patchApplies(dir, patch), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("gate 1 accepts a diff whose hunk header miscounts its own lines", () => {
  const dir = repoWith("cart.mjs", BUGGY);
  try {
    // Header claims 9 lines; the body has 4. Plain git apply calls this a
    // "corrupt patch" and throws the candidate away.
    const patch = `--- a/cart.mjs\n+++ b/cart.mjs\n@@ -1,9 +1,9 @@\n export function applyDiscount(total, pct) {\n   // pct arrives as 0-100\n-  return total - (total * pct);\n+  return total - (total * pct / 100);\n }\n`;
    assert.strictEqual(patchApplies(dir, patch), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a patch that needs a fallback rung still reaches gate 3", () => {
  // Regression: --check used the whole ladder but the real apply hardcoded
  // --3way, so every diff that needed a fallback died as "patch passed --check
  // but failed to apply" and could never be proven either way.
  const dir = repoWith("cart.mjs", BUGGY);
  try {
    const patch = `--- cart.mjs\n+++ cart.mjs\n@@ -1,4 +1,4 @@\n export function applyDiscount(total, pct) {\n   // pct arrives as 0-100\n-  return total - (total * pct);\n+  return total - (total * pct / 100);\n }\n`;
    const r = validatePatch(dir, patch, REAL_TEST, "javascript");
    assert.strictEqual(r.applied, true);
    assert.notStrictEqual(r.reason, "patch passed --check but failed to apply");
    assert.strictEqual(r.validated, true, "fails before, passes after — a real fix");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("gate 1 still refuses a diff that targets a file the repo does not have", () => {
  const dir = repoWith("cart.mjs", BUGGY);
  try {
    const patch = `--- a/nope.mjs\n+++ b/nope.mjs\n@@ -1,1 +1,1 @@\n-a\n+b\n`;
    assert.strictEqual(patchApplies(dir, patch), false, "permissive is not unconditional");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
