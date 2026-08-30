// Patch validation — turns "AI says it's fixed" into "we ran it, and it changed
// something".
//
// Three gates, cheapest first:
//   1. applies:   does the unified diff apply cleanly? (git apply --check)
//   2. fails before: does the generated test FAIL on the unpatched tree?
//   3. validated: does that same test PASS once the patch is applied?
//
// Gate 2 is the one that makes the other two mean anything. A generated test
// that already passes on the broken code is not exercising the defect — it is
// vacuous, or aimed at the wrong thing — and running it after the patch then
// "confirms" a fix that fixed nothing. Measured on real published defects:
// patches applied cleanly 8 times out of 12 and repaired the defect zero
// times, so "applied" and "the test passed afterwards" are both worth zero on
// their own.
//
// Test execution is language-dependent and best-effort. Where we cannot run it,
// `validated` stays false and `reason` says why: an unproven patch is reported
// as unproven, never as validated.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 60_000, stdio: "pipe", ...opts });
}

// The environment a generated test runs in.
//
// Two reasons this is an allow-list rather than `process.env`:
//
//   Correctness. `NODE_TEST_CONTEXT` makes `node --test` report through a
//   parent runner and exit 0 even when a test fails. Inherited, every generated
//   JS test "passes" — including on the unpatched tree — and every patch is
//   waved through as validated. `NODE_OPTIONS` can distort the run the same way.
//
//   Safety. The test is code an LLM wrote, executed on the worker. It has no
//   business seeing SUPABASE_SERVICE_KEY, GEMINI_API_KEY or anything else we
//   happen to be holding, so it is handed the minimum needed to run.
function childEnv() {
  const keep = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SystemRoot"];
  const env = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return env;
}

// How to run a generated test, per language. Anything absent here is not
// runnable in this container.
const RUNNERS = {
  python:     { file: "test_hardener_fix.py",   cmd: "python", args: (f) => ["-m", "pytest", "-q", f] },
  javascript: { file: "hardener.fix.test.mjs",  cmd: "node",   args: (f) => ["--test", f] },
  typescript: { file: "hardener.fix.test.mjs",  cmd: "node",   args: (f) => ["--test", f] },
};

function writePatch(unifiedDiff) {
  const patchFile = join(mkdtempSync(join(tmpdir(), "hard-")), "fix.patch");
  writeFileSync(patchFile, unifiedDiff.endsWith("\n") ? unifiedDiff : unifiedDiff + "\n");
  return patchFile;
}

export function patchApplies(repoDir, unifiedDiff) {
  if (!unifiedDiff || !unifiedDiff.trim()) return false;
  const patchFile = writePatch(unifiedDiff);
  try {
    run("git", ["apply", "--check", "--3way", patchFile], { cwd: repoDir });
    return true;
  } catch {
    try { run("git", ["apply", "--check", patchFile], { cwd: repoDir }); return true; }
    catch { return false; }
  }
}

// Runs the generated test in repoDir. Returns true if it passed. Never throws.
function testPasses(repoDir, runner, unitTest) {
  const path = join(repoDir, runner.file);
  try {
    writeFileSync(path, unitTest);
    run(runner.cmd, runner.args(runner.file), { cwd: repoDir, env: childEnv() });
    return true;
  } catch {
    return false;
  } finally {
    try { rmSync(path, { force: true }); } catch {}
  }
}

// Applies the patch on a throwaway working tree, requires the generated test to
// fail before and pass after, then restores the tree.
// Returns { applied, validated, failedBefore, reason }. Never throws.
export function validatePatch(repoDir, unifiedDiff, unitTest, language) {
  const applied = patchApplies(repoDir, unifiedDiff);
  if (!applied) {
    return { applied: false, validated: false, failedBefore: false,
             reason: "patch does not apply" };
  }
  if (!unitTest || !unitTest.trim()) {
    return { applied, validated: false, failedBefore: false,
             reason: "no test generated, so the patch is unproven" };
  }
  const runner = RUNNERS[language];
  if (!runner) {
    return { applied, validated: false, failedBefore: false,
             reason: `no test runner for ${language} in this container` };
  }

  let failedBefore = false, validated = false, reason = "";
  let stashed = false;
  try {
    try {
      run("git", ["stash", "--include-untracked"], { cwd: repoDir });
      stashed = true;
    } catch { /* nothing to stash */ }

    // Gate 2 — the test must fail on the unpatched tree.
    failedBefore = !testPasses(repoDir, runner, unitTest);
    if (!failedBefore) {
      return { applied, validated: false, failedBefore: false,
               reason: "test passed before the patch, so it does not exercise the defect" };
    }

    // Gate 3 — and pass once the patch is applied.
    const patchFile = writePatch(unifiedDiff);
    try {
      run("git", ["apply", "--3way", patchFile], { cwd: repoDir });
    } catch {
      return { applied, validated: false, failedBefore,
               reason: "patch passed --check but failed to apply" };
    }
    validated = testPasses(repoDir, runner, unitTest);
    reason = validated ? "" : "test still fails after the patch";
  } catch (err) {
    reason = `validation could not run: ${err?.message?.split("\n")[0]}`;
    validated = false;
  } finally {
    // `git apply --3way` STAGES its result, and `git checkout -- .` restores the
    // worktree from the index — so it puts the patch back rather than removing
    // it. Left that way, the next finding in the scan is validated against a
    // tree that already carries the previous finding's patch. Reset both.
    try { run("git", ["reset", "-q", "--hard"], { cwd: repoDir }); } catch {}
    try { run("git", ["clean", "-fdq"], { cwd: repoDir }); } catch {}
    if (stashed) { try { run("git", ["stash", "pop"], { cwd: repoDir }); } catch {} }
  }
  return { applied, validated, failedBefore, reason };
}
