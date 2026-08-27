// Hardener scanner worker — the missing spine.
// Flow: clone -> Semgrep -> (per finding) AI verify -> validate patch -> persist.
// Runs as an ephemeral Fly.io machine; auto-destroyed after exit.
import { createClient } from "@supabase/supabase-js";
import { classifyTarget, cloneRepo, detectLanguage, runSemgrep, runGitleaks, extractSnippet } from "./sources.mjs";
import { verifyFinding } from "./verifier.mjs";
import { validatePatch } from "./validate.mjs";
import { rmSync } from "node:fs";

const {
  SCAN_ID, TARGET_URL,
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
  MAX_FINDINGS = "25",
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const started = Date.now();

async function setScan(fields) {
  await supabase.from("scans").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", SCAN_ID);
}

function grade(score) {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

async function main() {
  if (!SCAN_ID || !TARGET_URL) throw new Error("missing SCAN_ID or TARGET_URL");
  await setScan({ status: "Running", progress: 5 });

  if (classifyTarget(TARGET_URL) !== "git") {
    // Phase 0 is SAST-only. Live-URL DAST is Phase 2.
    await setScan({ status: "Failed", progress: 100,
      error_message: "Only git repositories are supported in this version (DAST is on the roadmap)." });
    return;
  }

  let repoDir;
  try {
    await setScan({ progress: 15 });
    repoDir = cloneRepo(TARGET_URL);
    const language = detectLanguage(repoDir);

    await setScan({ progress: 30 });
    let results = [...runSemgrep(repoDir), ...runGitleaks(repoDir)];
    const total = results.length;
    results = results.slice(0, Number(MAX_FINDINGS)); // cost + latency cap

    let confirmed = 0, patchHours = 0;
    const rows = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const { file, line, snippet } = extractSnippet(repoDir, r);
      const sarif = {
        rule_id: r.ruleId, level: r.level,
        message: r.message?.text, file, line,
      };
      const v = await verifyFinding(snippet, sarif);
      let applied = false, validated = false;
      if (v.is_vulnerability && v.unified_diff) {
        ({ applied, validated } = validatePatch(repoDir, v.unified_diff, v.unit_test, language));
      }
      if (v.is_vulnerability) { confirmed++; patchHours += v.estimated_patch_hours || 0; }
      rows.push({
        scan_id: SCAN_ID,
        rule_id: r.ruleId || null,
        severity: r.level || "warning",
        file_path: file || null,
        start_line: line || null,
        message: r.message?.text || null,
        code_snippet: snippet || null,
        is_vulnerability: !!v.is_vulnerability,
        reasoning: v.reasoning || null,
        unified_diff: v.unified_diff || null,
        unit_test: v.unit_test || null,
        estimated_patch_hours: v.estimated_patch_hours || 0,
        patch_applies: applied,
        patch_validated: validated,
      });
      await setScan({ progress: 30 + Math.round((60 * (i + 1)) / results.length) });
    }

    if (rows.length) {
      const { error } = await supabase.from("findings").insert(rows);
      if (error) throw new Error(`findings insert failed: ${error.message}`);
    }

    // Aggregate score: start at 100, subtract per confirmed vuln by severity.
    const penalty = rows.filter((x) => x.is_vulnerability)
      .reduce((s, x) => s + (x.severity === "error" ? 12 : x.severity === "warning" ? 6 : 3), 0);
    const score = Math.max(0, 100 - penalty);
    const validatedCount = rows.filter((x) => x.patch_validated).length;

    // The scans row keeps a headline patch (the first validated one) for the
    // dashboard's single-diff view; the full set lives in `findings`.
    const headline = rows.find((x) => x.patch_validated) || rows.find((x) => x.is_vulnerability);
    await setScan({
      status: "Completed",
      progress: 100,
      vulns_found: confirmed,
      score,
      grade: grade(score),
      security_health_score: grade(score),
      estimated_patch_hours: patchHours,
      ai_remediation_diff: headline?.unified_diff || null,
      ai_unit_test: headline?.unit_test || null,
      time_taken: `${Math.round((Date.now() - started) / 1000)}s`,
      checks: { semgrep_total: total, verified: confirmed, patches_validated: validatedCount },
    });
    console.log(`[scan ${SCAN_ID}] done: ${confirmed}/${total} confirmed, ${validatedCount} patches validated`);
  } finally {
    if (repoDir) { try { rmSync(repoDir, { recursive: true, force: true }); } catch {} }
  }
}

main().catch(async (err) => {
  console.error(`[scan ${SCAN_ID}] fatal: ${err?.message}`);
  try { await setScan({ status: "Failed", progress: 100, error_message: String(err?.message || err).slice(0, 500) }); } catch {}
  process.exit(1);
});
