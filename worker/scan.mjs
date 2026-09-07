// Hardener scanner worker — the missing spine.
// Flow: clone -> Semgrep -> (per finding) AI verify -> validate patch -> persist.
// Runs as an ephemeral Fly.io machine; auto-destroyed after exit.
import { createClient } from "@supabase/supabase-js";
import { classifyTarget, cloneRepo, detectLanguage, runSemgrep, runGitleaks, runOsvScanner, runNuclei, extractSnippet } from "./sources.mjs";
import { createHash } from "node:crypto";
import { verifyFinding } from "./verifier.mjs";
import { validatePatch } from "./validate.mjs";
import { completeness } from "./report.mjs";
import { rmSync } from "node:fs";

const {
  SCAN_ID, TARGET_URL,
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
  MAX_FINDINGS = "25",
  SCAN_TIMEOUT_MS = "1500000",
  APP_URL, NOTIFY_SECRET,
} = process.env;

// DRY_RUN started as a local debug aid. It is now also the production
// transport, because it is what lets a scan run with NO database credential.
//
// The scanner executes code it does not trust: `validate.mjs` runs a test an
// LLM wrote, inside a stranger's repository. `childEnv()` keeps the keys out of
// that test's environment, which stops an accidental leak — but the test runs as
// the same user in the same container as this process, so `/proc/<pid>/environ`
// is readable and a deliberate one still works.
//
// The fix is to not hold the secret here at all. Under DRY_RUN this process
// prints its results to stdout and writes nothing; the host reads them back and
// does the database write itself. The container never sees SUPABASE_SERVICE_KEY.
const DRY = process.env.DRY_RUN === "1";
const supabase = DRY ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const started = Date.now();

// Everything the host needs to finish the job, accumulated as the scan runs.
const dryScan = {};
let dryRows = [];

// Fenced so it survives anything else the scanners printed to stdout. The host
// splits on this marker rather than guessing which line is the payload.
const RESULT_FENCE = "---HARDENER-RESULT---";
let emitted = false;
function emitResult() {
  if (!DRY || emitted) return;
  emitted = true;
  process.stdout.write(`\n${RESULT_FENCE}\n` +
    JSON.stringify({ scan: dryScan, findings: dryRows }) + `\n`);
}

// Global wall-clock guard: a runaway scan marks itself Failed rather than
// hanging the machine forever (Phase 2: timeout caps).
const killer = setTimeout(async () => {
  console.error(`[scan ${SCAN_ID}] exceeded ${SCAN_TIMEOUT_MS}ms`);
  try { await setScan({ status: "Failed", progress: 100, error_message: "Scan exceeded time budget." }); } catch {}
  process.exit(1);
}, Number(SCAN_TIMEOUT_MS));
killer.unref();

function fingerprint(ruleId, file, snippet) {
  const norm = (snippet || "").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${ruleId}|${file}|${norm}`).digest("hex");
}

// Cross-scan cache: reuse a prior AI verdict for identical code (cost control).
async function cachedVerify(fp, snippet, sarif, verify) {
  if (DRY) return verify(snippet, sarif);
  const { data: hit } = await supabase.from("finding_cache").select("verdict").eq("fingerprint", fp).maybeSingle();
  if (hit?.verdict) {
    await supabase.rpc("increment_cache_hit", { fp }).catch(() => {});
    return { ...hit.verdict, _cached: true };
  }
  const v = await verify(snippet, sarif);
  if (!v._verify_error) {
    await supabase.from("finding_cache").upsert({ fingerprint: fp, verdict: v }, { onConflict: "fingerprint" }).catch(() => {});
  }
  return v;
}

async function setScan(fields) {
  if (DRY) {
    // Accumulated rather than written. Progress goes to stderr so it stays out
    // of the fenced payload on stdout.
    Object.assign(dryScan, fields);
    if (fields.status) console.error(`[dry] status -> ${fields.status}`);
    return;
  }
  await supabase.from("scans").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", SCAN_ID);
}

function grade(score) {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

async function main() {
  if (!TARGET_URL || (!DRY && !SCAN_ID)) throw new Error("missing SCAN_ID or TARGET_URL");
  await setScan({ status: "Running", progress: 5 });

  const targetType = classifyTarget(TARGET_URL); // "git" | "web"
  let repoDir;
  try {
    await setScan({ progress: 15 });
    let results, total, language;

    if (targetType === "git") {
      repoDir = cloneRepo(TARGET_URL);
      language = detectLanguage(repoDir);
      await setScan({ progress: 30 });
      results = [...runSemgrep(repoDir), ...runGitleaks(repoDir), ...runOsvScanner(repoDir)];
    } else {
      // Live-URL DAST (experimental). No code to patch, so patch validation is skipped.
      language = "web";
      await setScan({ progress: 30 });
      results = runNuclei(TARGET_URL);
    }

    total = results.length;
    results = results.slice(0, Number(MAX_FINDINGS)); // cost + latency cap
    // `total` is what the scanners raised; `assessed` is what this scan actually
    // looked at. Every completeness check below MUST use `assessed`. Comparing
    // against `total` passes silently on any repo with more findings than the
    // cap -- which is how a dead verifier reported grade A the first time, and
    // the cap makes that the common case, not the edge case.
    const assessed = results.length;

    let confirmed = 0, patchHours = 0, verifyErrors = 0;
    const rows = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const { file, line, snippet } = repoDir
        ? extractSnippet(repoDir, r)
        : { file: TARGET_URL, line: null, snippet: r.message?.text || "" };
      const sarif = {
        rule_id: r.ruleId, level: r.level,
        message: r.message?.text, file, line,
      };
      const fp = fingerprint(r.ruleId, file, snippet);
      const v = await cachedVerify(fp, snippet, sarif, verifyFinding);
      // A verification that FAILED is not a verification that found nothing.
      // verifyFinding returns is_vulnerability:false on any error, so without
      // this counter a dead model, an invalid key or an exhausted quota reads
      // as "no vulnerabilities" — and the scan below would hand the user a
      // score of 100 and a grade of A produced by an AI that never answered.
      if (v._verify_error) verifyErrors++;
      let applied = false, validated = false, why = "";
      if (repoDir && v.is_vulnerability && v.unified_diff) {
        ({ applied, validated, reason: why } =
          validatePatch(repoDir, v.unified_diff, v.unit_test, language));
        // An unproven patch is the common case, not an error. Say why, so the
        // difference between "we could not run the test" and "the patch does
        // not fix it" is visible rather than collapsing into a false flag.
        if (applied && !validated) console.log(`[validate] ${file}: unproven — ${why}`);
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
        patch_validation_note: why || null,
      });
      await setScan({ progress: 30 + Math.round((60 * (i + 1)) / results.length) });
    }

    dryRows = rows;
    if (DRY) {
      // Nothing written here — the host does it, from the fenced payload.
    } else if (rows.length) {
      // Idempotent: a QStash retry re-runs this scan; clear prior rows first so
      // findings aren't double-inserted.
      await supabase.from("findings").delete().eq("scan_id", SCAN_ID);
      const { error } = await supabase.from("findings").insert(rows);
      if (error) throw new Error(`findings insert failed: ${error.message}`);
    }

    // If nothing could be verified, the scan learned nothing. Reporting that as
    // a clean result is the most dangerous thing this worker could do, so it
    // fails loudly instead and the user is told why.
    const { truncated, noneVerified, scoreIsPartial } =
      completeness({ total, assessed, verifyErrors });
    if (noneVerified) {
      throw new Error(
        `verification unavailable: all ${assessed} assessed finding(s) failed to verify` +
        (truncated ? ` (of ${total} raised)` : ``) + `. ` +
        `No security conclusion can be drawn from this scan. ` +
        `Check GEMINI_API_KEY and that GEMINI_MODEL is a model this key can reach.`
      );
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
      checks: {
        semgrep_total: total, verified: confirmed, patches_validated: validatedCount,
        // How many of `total` this scan actually assessed. When `truncated` is
        // true the cap hid the rest, so `score` is computed from a sample and
        // a big repo can outscore a small one purely by overflowing the cap.
        assessed, truncated, max_findings: Number(MAX_FINDINGS),
        // Non-zero means some findings were never assessed, so `score` is an
        // upper bound on the problems present, not a measurement of them.
        verify_errors: verifyErrors,
        score_is_partial: scoreIsPartial,
      },
    });
    const appliedCount = rows.filter((x) => x.patch_applies).length;
    // Reported separately on purpose: "applied" and "validated" are different
    // claims, and only the second one means the defect is actually repaired.
    console.log(`[scan ${SCAN_ID}] done: ${confirmed}/${assessed} confirmed, ` +
                `${appliedCount} patches applied, ${validatedCount} proven by execution`);
    if (truncated) {
      console.warn(`[scan ${SCAN_ID}] WARNING: ${assessed} of ${total} finding(s) assessed ` +
                   `(MAX_FINDINGS=${MAX_FINDINGS}). The score is computed from that sample only.`);
    }
    if (verifyErrors > 0) {
      console.warn(`[scan ${SCAN_ID}] WARNING: ${verifyErrors}/${assessed} finding(s) could not be ` +
                   `verified. The score is an upper bound, not a clean bill of health.`);
    }

    // Best-effort completion alert (scheduled scans with a Slack/email sink).
    if (APP_URL && NOTIFY_SECRET) {
      try {
        await fetch(`${APP_URL}/api/webhooks/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hardener-secret": NOTIFY_SECRET },
          body: JSON.stringify({ scanId: SCAN_ID }),
        });
      } catch (e) { console.error(`[notify] ${e?.message}`); }
    }
  } finally {
    if (repoDir) { try { rmSync(repoDir, { recursive: true, force: true }); } catch {} }
  }
}

main()
  .then(() => emitResult())
  .catch(async (err) => {
    console.error(`[scan ${SCAN_ID}] fatal: ${err?.message}`);
    try {
      await setScan({ status: "Failed", progress: 100, error_message: String(err?.message || err).slice(0, 500) });
    } catch {}
    // Emit on the failure path too: a host that gets no payload cannot tell a
    // crashed scan from a killed container, and would leave the row Running.
    emitResult();
    process.exit(1);
  });
