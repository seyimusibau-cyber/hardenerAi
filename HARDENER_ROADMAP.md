# Hardener — Build Roadmap & Status

The product had a hole in the middle: a strong shell (auth, domain verification,
billing, AI verifier) wrapped around a **scanner that was never built**. The
qstash webhook fired a Fly.io image (`hardener-scanner:latest`) that did not
exist, so no real finding was ever produced. This roadmap closes that loop and
builds outward.

## Status legend
✅ done · 🟡 partial / needs live verification · ⬜ not started

---

## Phase 0 — Close the loop (MVP: one real end-to-end scan)
- ✅ Scanner worker (`worker/`): clone → Semgrep (SARIF) → per-finding AI verify → persist.
- ✅ `Dockerfile` + `fly.toml` building `registry.fly.io/hardener-scanner:latest`.
- ✅ Worker → verifier → DB writeback (score, grade, vulns_found, headline diff/test).
- ✅ Failure path: worker errors write `status='Failed'` + `error_message`.
- ✅ Scope decision: SAST on git repos (fast, deterministic). Non-git → clear Failed.
- 🟡 **Live verification**: needs `fly deploy` + Fly secrets set, then a real scan.
      Cannot be verified from source alone.

## Phase 1 — Make it trustworthy (the differentiator)
- ✅ `findings` table (migration `002_findings.sql`) + RLS + `/api/findings` route.
- ✅ **Patch validation by execution** (`worker/validate.mjs`): `git apply --check`
      gate, then apply-and-run the generated test (Python/JS runners; others → applies-only).
- ✅ False-positive **metric** harness (`worker/bench/`) — precision/recall on labeled cases.
- ✅ Safety config: narrowed blanket `BLOCK_NONE` to `BLOCK_ONLY_HIGH` on the one category.
- ⬜ Dashboard UI to render the per-finding list (`/api/findings` exists; the 926-line
      `dashboard/page.tsx` needs a findings panel — a design task, not wired yet).

## Phase 2 — Coverage & robustness
- ✅ Gitleaks (secret scanning) merged into the same SARIF pipe.
- ✅ Progress streaming: worker updates `scans.progress` per stage.
- ✅ Idempotency: webhook claims a scan via `status: Queued→Running` conditional update.
- 🟡 Concurrency/timeout caps: Semgrep has a wall-clock; still need a per-user
      concurrent-machine cap and a hard machine kill.
- ⬜ Dependency/SCA scanner (Trivy or osv-scanner) — another SARIF source in `sources.mjs`.
- ⬜ Live-URL **DAST**: real crawler + ZAP/nuclei. Heavy; add a "web" source type.

## Phase 3 — Product & growth
- ✅ Quota enforcement: `scan/route.ts` checks + consumes `monthly_scans_used` by plan.
- ⬜ PR integration: open the validated diff as a GitHub PR (highest-value dev feature).
- ⬜ Scheduled re-scans (cron) + alerts (Slack/email) on new findings.
- ⬜ Exportable report (Stakeholder vs Developer views).

## Cross-cutting
- ✅ Secrets: static keys moved to Fly app secrets; service key no longer in the
      machine-create payload.
- 🟡 Cost control: findings capped at `MAX_FINDINGS` (25) per scan. Still want
      per-finding fingerprint caching to skip re-verifying unchanged code.
- ⬜ Re-record the demo on real output once Phase 0 is live-verified.

---

## To go live (Phase 0 acceptance)
```bash
# 1. apply the migration
psql "$SUPABASE_DB_URL" -f supabase/migrations/002_findings.sql
# 2. deploy the worker
cd worker && fly launch --no-deploy
fly secrets set GEMINI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
fly deploy
# 3. main app env: FLY_API_TOKEN, FLY_APP_NAME=hardener-scanner, QSTASH_*, NEXT_PUBLIC_APP_URL
# 4. trigger a scan on a repo you've verified -> watch findings populate
```
Exit criteria: one real repo scanned, findings verified, ≥1 patch validated,
results visible via `/api/findings`.
