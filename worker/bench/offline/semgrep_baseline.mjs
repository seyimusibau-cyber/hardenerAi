// The null hypothesis: what does Semgrep score on its own?
//
// Vultix is Semgrep + Gitleaks + osv-scanner with a Gemini call on top. The
// AI layer is the whole moat, so the only question that matters is whether it
// beats the scanner it wraps. Canary already measured the AI arm on these exact
// 16 tasks. This measures the scanners on the same tasks, with the same grading
// rule, for $0 -- so the two numbers can be put side by side.
//
// Grading matches canary/src/canary/models.py:hit() exactly: a finding counts
// as located if it lands within 3 lines of a line the real fix touched. A
// finding on a clean control counts as a false positive.
//
// Two arms, because they answer different questions:
//   repo-wide  every Semgrep finding in the tree -- what Vultix actually
//              shows a user, and what its score is computed from
//   scoped     only findings in the file the model was given -- the fair
//              like-for-like against Canary's AI runs
//
// Usage: node worker/bench/offline/semgrep_baseline.mjs [canaryDir]
import { readFileSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const canaryDir = process.argv[2] || process.env.CANARY_DIR || join(here, "../../../../canary");
const realDir = join(canaryDir, "tasks/real");
const WINDOW = 3;

function semgrep(dir) {
  const out = join(mkdtempSync(join(tmpdir(), "sgb-")), "o.sarif");
  try {
    execFileSync("semgrep", ["scan", "--config", "auto", "--sarif", "--output", out,
                             "--quiet", "--timeout", "0", "."],
                 { cwd: dir, encoding: "utf8", stdio: "pipe", timeout: 600_000 });
  } catch { /* non-zero exit just means findings exist */ }
  if (!existsSync(out)) return [];
  try {
    return (JSON.parse(readFileSync(out, "utf8")).runs?.[0]?.results ?? []).map((r) => ({
      rule: r.ruleId,
      file: r.locations?.[0]?.physicalLocation?.artifactLocation?.uri || "",
      line: r.locations?.[0]?.physicalLocation?.region?.startLine ?? -1,
    }));
  } catch { return []; }
}

// context_globs are plain paths in this corpus; suffix match is enough and is
// stricter than a glob would be.
const inScope = (f, globs) => (globs || []).some((g) => f === g || f.endsWith("/" + g));
const hit = (fs_, lines) => fs_.some((f) => (lines || []).some((l) => Math.abs(f.line - l) <= WINDOW));

const arms = { repo: { tp: 0, fp: 0, fn: 0 }, scoped: { tp: 0, fp: 0, fn: 0 } };
const rows = [];

for (const id of readdirSync(realDir).filter((d) => existsSync(join(realDir, d, "task.json")))) {
  const task = JSON.parse(readFileSync(join(realDir, id, "task.json"), "utf8"));
  if (task.is_canary) continue;                       // contamination probe, not a detection case
  const files = join(realDir, id, "files");
  if (!existsSync(files)) continue;

  const all = semgrep(files);
  const scoped = all.filter((f) => inScope(f.file, task.context_globs));
  const located = { repo: hit(all, task.fix_touched_lines), scoped: hit(scoped, task.fix_touched_lines) };

  for (const arm of ["repo", "scoped"]) {
    const found = arm === "repo" ? all : scoped;
    if (task.is_vulnerable) { if (located[arm]) arms[arm].tp++; else arms[arm].fn++; }
    else if (found.length) { arms[arm].fp++; }
  }
  rows.push({ id, vuln: task.is_vulnerable, all: all.length, scoped: scoped.length,
              hitRepo: located.repo, hitScoped: located.scoped });
}

const prf = ({ tp, fp, fn }) => {
  const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
  return { precision: +p.toFixed(3), recall: +r.toFixed(3), f1: +(p + r ? 2 * p * r / (p + r) : 0).toFixed(3), tp, fp, fn };
};

console.log(`\n  Semgrep-alone baseline — ${rows.length} tasks, 0 API calls\n`);
console.log(`  ${"task".padEnd(32)} vuln  findings  in-file  located`);
for (const r of rows) {
  console.log(`  ${r.id.padEnd(32)} ${String(r.vuln).padEnd(6)}${String(r.all).padEnd(10)}` +
              `${String(r.scoped).padEnd(9)}${r.hitScoped ? "YES" : "no"}`);
}
console.log(`\n  repo-wide arm (what Vultix shows):  ${JSON.stringify(prf(arms.repo))}`);
console.log(`  scoped arm (fair vs the AI runs):     ${JSON.stringify(prf(arms.scoped))}`);
console.log(`\n  Compare — Canary's AI baseline on these same tasks:`);
console.log(`    gemini-3.5-flash  precision 0.556  recall 0.455  f1 0.5    fix rate 0`);
console.log(`    gemini-3.7-flash  precision 0.333  recall 0.182  f1 0.235  fix rate 0\n`);
