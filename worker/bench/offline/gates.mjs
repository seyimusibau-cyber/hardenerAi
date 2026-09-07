// Run Hardener's patch gates over the offline corpus. No API key, no spend.
//
// Every entry is a real model-generated diff against a real published CVE, and
// Canary already graded the same diff with its own applier. So this measures
// two things at once:
//   1. Hardener's apply rate on real model output (gate 1).
//   2. Where Hardener's applier DISAGREES with Canary's on identical input --
//      which is a defect in one of the two, never noise.
//
// Usage: node worker/bench/offline/gates.mjs [canaryDir]
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { patchApplies } from "../../validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const canaryDir = process.argv[2] || process.env.CANARY_DIR || join(here, "../../../../canary");
const corpus = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe", timeout: 60_000 });
}

// Materialize the task's vulnerable tree as a throwaway git repo, because
// `git apply` needs an index and the gates reset against it.
function materialize(taskId) {
  const src = join(canaryDir, "tasks/real", taskId, "files");
  if (!existsSync(src)) return null;
  const dir = mkdtempSync(join(tmpdir(), "hardener-offline-"));
  cpSync(src, dir, { recursive: true });
  git(["init", "-q"], dir);
  git(["-c", "user.email=b@b", "-c", "user.name=bench", "add", "-A"], dir);
  git(["-c", "user.email=b@b", "-c", "user.name=bench", "commit", "-qm", "vulnerable state"], dir);
  return dir;
}

// The applier Hardener shipped before the ladder: --3way, then a plain retry.
// Kept as the comparison arm so the improvement stays measurable rather than
// asserted.
function appliesOldWay(dir, patch) {
  const f = join(mkdtempSync(join(tmpdir(), "hp-")), "p.patch");
  writeFileSync(f, patch.endsWith("\n") ? patch : patch + "\n");
  try { git(["apply", "--check", "--3way", f], dir); return true; } catch {}
  try { git(["apply", "--check", f], dir); return true; } catch { return false; }
}

const rows = [];
for (const e of corpus.entries) {
  const dir = materialize(e.task_id);
  if (!dir) { rows.push({ ...e, hardener: null, old: null, skipped: "no task files" }); continue; }
  try {
    rows.push({ id: e.id, task_id: e.task_id, model: e.model, runner: e.runner,
                hardener: patchApplies(dir, e.patch), old: appliesOldWay(dir, e.patch),
                canary_applied: e.canary.patch_applied, canary_fixed: e.canary.patch_passed_test });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const n = rows.length;
const hard = rows.filter((r) => r.hardener).length;
const old = rows.filter((r) => r.old).length;
const gained = rows.filter((r) => r.hardener && !r.old).length;
const lost = rows.filter((r) => !r.hardener && r.old).length;
const can = rows.filter((r) => r.canary_applied).length;
const fixed = rows.filter((r) => r.canary_fixed).length;

console.log(`\n  offline patch gates — ${n} real model patches, 0 API calls\n`);
console.log(`  ${"id".padEnd(46)} ladder  old   canary`);
for (const r of rows) {
  console.log(`  ${r.id.slice(0, 46).padEnd(46)} ${String(r.hardener).padEnd(7)} ${String(r.old).padEnd(5)} ${String(r.canary_applied)}`);
}
console.log(`\n  gate 1, apply ladder:           ${hard}/${n}  (${(100*hard/n).toFixed(0)}%)`);
console.log(`  gate 1, previous applier:       ${old}/${n}  (${(100*old/n).toFixed(0)}%)`);
console.log(`  Canary's applier, same patches: ${can}/${n}  (${(100*can/n).toFixed(0)}%)`);
console.log(`  recovered by the ladder:        ${gained}   regressed: ${lost}`);
console.log(`  patches that repaired the CVE:  ${fixed}/${n}   <- the number that matters\n`);
