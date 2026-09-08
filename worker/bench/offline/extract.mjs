// Build the offline patch corpus.
//
// Canary already spent real money asking frontier models to fix 16 published
// CVEs, and it recorded every answer. Those recordings contain something this
// project has never had: real, model-generated unified diffs against real
// vulnerable code, with a graded outcome attached. That is a permanent, free,
// repeatable test set for Vultix's patch gates -- no API key, no spend, and
// it cannot drift, because the model's answer is already written down.
//
// Usage: node worker/bench/offline/extract.mjs [canaryDir]
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const canaryDir = process.argv[2] || process.env.CANARY_DIR || join(here, "../../../../canary");
if (!existsSync(join(canaryDir, "trajectories"))) {
  console.error(`no trajectories under ${canaryDir}. Pass the canary checkout as argv[1].`);
  process.exit(1);
}

// A recorded run keeps the model's raw JSON in a `model_call` record. Later
// records may refine it, so the last one carrying a non-empty patch wins.
function patchFrom(records) {
  let patch = "", rationale = "", confidence = null;
  for (const r of records) {
    if (r.kind !== "model_call" || typeof r.detail !== "string") continue;
    let parsed;
    try { parsed = JSON.parse(r.detail); } catch { continue; }
    if (typeof parsed.patch === "string" && parsed.patch.trim()) patch = parsed.patch;
    const f = parsed.findings?.[0];
    if (f) { rationale = f.rationale || rationale; confidence = f.confidence ?? confidence; }
  }
  return { patch, rationale, confidence };
}

const tasks = {};
for (const d of readdirSync(join(canaryDir, "tasks/real"))) {
  const tj = join(canaryDir, "tasks/real", d, "task.json");
  if (existsSync(tj)) tasks[d] = JSON.parse(readFileSync(tj, "utf8"));
}

const entries = [];
for (const dir of readdirSync(join(canaryDir, "trajectories"))) {
  const full = join(canaryDir, "trajectories", dir);
  for (const f of readdirSync(full).filter((x) => x.endsWith(".jsonl"))) {
    const records = readFileSync(join(full, f), "utf8").trim().split("\n")
      .map((l) => { try { return JSON.parse(l); } catch { return {}; } });
    const header = records[0]?._header;
    if (!header) continue;
    const task = tasks[header.task_id];
    if (!task) continue;                       // synthetic run, no real ground truth
    const { patch, rationale, confidence } = patchFrom(records);
    if (!patch.trim()) continue;               // nothing for the gates to chew on
    const final = records.find((r) => r.kind === "final")?.detail || {};
    entries.push({
      id: `${dir}__${header.runner}__${header.task_id}`,
      run: dir, runner: header.runner, model: header.model, task_id: header.task_id,
      // Ground truth, straight from the task definition.
      truth: {
        is_vulnerable: task.is_vulnerable,
        source: task.source,
        language: task.repo?.startsWith("pypi/") ? "python" : "unknown",
        test_cmd: task.test_cmd,
        fix_touched_lines: task.fix_touched_lines,
      },
      // What Canary observed when IT graded this same patch. Vultix's gates
      // are run against the same input, so any disagreement is a real,
      // attributable difference between the two appliers -- not noise.
      canary: {
        patch_applied: final.patch_applied ?? null,
        patch_passed_test: final.patch_passed_test ?? null,
      },
      confidence, rationale: (rationale || "").slice(0, 300), patch,
    });
  }
}

entries.sort((a, b) => a.id.localeCompare(b.id));
const out = join(here, "corpus.json");
writeFileSync(out, JSON.stringify({
  generated_from: canaryDir,
  note: "Model answers recorded by Canary. No API calls are needed to use this corpus.",
  count: entries.length,
  entries,
}, null, 2));

const byRun = {};
for (const e of entries) byRun[`${e.run} (${e.model})`] = (byRun[`${e.run} (${e.model})`] || 0) + 1;
console.log(`extracted ${entries.length} model-generated patches -> ${out}`);
for (const [k, v] of Object.entries(byRun)) console.log(`  ${k}: ${v}`);
console.log(`  canary graded applied: ${entries.filter((e) => e.canary.patch_applied).length}`);
console.log(`  canary graded fixed:   ${entries.filter((e) => e.canary.patch_passed_test).length}`);
