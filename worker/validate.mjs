// Patch validation — turns "AI says it's fixed" into "we ran it".
// Two gates, cheapest first:
//   1. applies:   does the unified diff apply cleanly to the repo? (git apply --check)
//   2. validated: after applying, does the generated unit test pass? (best-effort)
// Test execution is language-dependent and best-effort: if we can't run it in
// this repo, `validated` stays false but `applies` is still a real signal.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 60_000, stdio: "pipe", ...opts });
}

export function patchApplies(repoDir, unifiedDiff) {
  if (!unifiedDiff || !unifiedDiff.trim()) return false;
  const patchFile = join(mkdtempSync(join(tmpdir(), "hard-")), "fix.patch");
  writeFileSync(patchFile, unifiedDiff.endsWith("\n") ? unifiedDiff : unifiedDiff + "\n");
  try {
    run("git", ["apply", "--check", "--3way", patchFile], { cwd: repoDir });
    return true;
  } catch {
    try { run("git", ["apply", "--check", patchFile], { cwd: repoDir }); return true; }
    catch { return false; }
  }
}

// Applies the patch on a throwaway branch, runs the generated test, reverts.
// Returns { applied, validated }. Never throws.
export function validatePatch(repoDir, unifiedDiff, unitTest, language) {
  const applied = patchApplies(repoDir, unifiedDiff);
  if (!applied) return { applied: false, validated: false };

  let validated = false;
  try {
    run("git", ["stash", "--include-untracked"], { cwd: repoDir });
    const patchFile = join(mkdtempSync(join(tmpdir(), "hard-")), "fix.patch");
    writeFileSync(patchFile, unifiedDiff.endsWith("\n") ? unifiedDiff : unifiedDiff + "\n");
    run("git", ["apply", "--3way", patchFile], { cwd: repoDir });

    if (unitTest && unitTest.trim()) {
      if (language === "python") {
        writeFileSync(join(repoDir, "test_hardener_fix.py"), unitTest);
        run("python", ["-m", "pytest", "-q", "test_hardener_fix.py"], { cwd: repoDir });
        validated = true;
      } else if (language === "javascript" || language === "typescript") {
        writeFileSync(join(repoDir, "hardener.fix.test.mjs"), unitTest);
        run("node", ["--test", "hardener.fix.test.mjs"], { cwd: repoDir });
        validated = true;
      }
      // other languages: not run in this container -> validated stays false (TODO: extend)
    }
  } catch (err) {
    console.error(`[validate] test did not pass: ${err?.message?.split("\n")[0]}`);
    validated = false;
  } finally {
    try { run("git", ["checkout", "--", "."], { cwd: repoDir }); } catch {}
    try { run("git", ["clean", "-fd"], { cwd: repoDir }); } catch {}
    try { run("git", ["stash", "pop"], { cwd: repoDir }); } catch {}
  }
  return { applied, validated };
}
