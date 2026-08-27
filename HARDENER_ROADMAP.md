# Hardener — Build Roadmap & Status

The product had a hole in the middle: a strong shell (auth, domain verification,
billing, AI verifier) wrapped around a **scanner that was never built**. This
roadmap closed that loop and built outward across all phases.

## Status legend
✅ done · 🟡 partial / needs live verification · ⬜ not started

---

## Phase 0 — Close the loop (MVP)
- ✅ Scanner worker (`worker/`): clone → Semgrep → per-finding AI verify → persist.
- ✅ `Dockerfile` + `fly.toml` → `registry.fly.io/hardener-scanner:latest`.
- ✅ Worker → verifier → DB writeback (score, grade, headline diff/test).
- ✅ Failure path: worker errors write `status='Failed'` + `error_message`.
- 🟡 **Live verification** still required: `fly deploy` + secrets, then a real scan.

## Phase 1 — Trustworthy (the differentiator)
- ✅ `findings` table (`002`) + RLS + `/api/findings`.
- ✅ Patch validation by execution (`worker/validate.mjs`): apply-check + run test.
- ✅ False-positive precision/recall harness (`worker/bench/`).
- ✅ Safety config narrowed (`BLOCK_NONE` → `BLOCK_ONLY_HIGH`, one category).
- ✅ **Dashboard findings UI** (`FindingsPanel`/`FindingCard` in `dashboard/page.tsx`):
      per-finding verdict, confirmed/false-positive/patch-verified badges, diff view.

## Phase 2 — Coverage & robustness
- ✅ Gitleaks (secrets) merged into the SARIF pipe.
- ✅ osv-scanner (dependency/SCA) merged into the SARIF pipe.
- ✅ Live-URL **DAST** via nuclei (experimental; `web` target type, no patch step).
- ✅ Progress streaming: worker updates `scans.progress` per stage.
- ✅ Idempotency: webhook claims a scan via `Queued→Running` conditional update.
- ✅ Concurrency cap (per-user in-flight limit) + worker wall-clock timeout guard.

## Phase 3 — Product & growth
- ✅ Quota enforcement: `scan/route.ts` checks + consumes `monthly_scans_used`.
- ✅ PR integration (`/api/pr`): opens a GitHub PR with the validated diff
      (single-file auto-apply; falls back to attaching the diff for a human).
- ✅ Scheduled re-scans (`/api/webhooks/schedule` cron + `/api/schedules` CRUD).
- ✅ Alerts on completion (`/api/webhooks/notify` + `src/lib/notifier.ts`, Slack/email).
- ✅ Exportable HTML report (`/api/report`).
- ⬜ Deep DAST (real crawler + ZAP active scan) — nuclei is a first pass only.

## Cross-cutting
- ✅ Cross-scan verifier cache (`finding_cache`, fingerprint) — skips re-verifying unchanged code.
- ✅ Findings capped at `MAX_FINDINGS` (25) per scan.
- ✅ Static secrets moved to Fly secrets; service key out of the machine payload.
- 🟡 Re-record the demo on real output once Phase 0 is live-verified.

---

## Environment / secrets

**Main app** (Vercel/host env): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`,
`NEXT_PUBLIC_APP_URL`, `FLY_API_TOKEN`, `FLY_APP_NAME=hardener-scanner`,
`GITHUB_TOKEN` (PRs), `RESEND_API_KEY` + `ALERT_FROM_EMAIL` (email alerts),
`NOTIFY_SECRET` (shared with worker).

**Worker** (Fly app secrets): `GEMINI_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `APP_URL`, `NOTIFY_SECRET`. Optional: `MAX_FINDINGS`,
`SCAN_TIMEOUT_MS`, `GEMINI_MODEL`.

## Go-live (Phase 0 acceptance)
```bash
# migrations
psql "$SUPABASE_DB_URL" -f supabase/migrations/002_findings.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/003_cache_schedules_prs.sql
# worker
cd worker && fly launch --no-deploy
fly secrets set GEMINI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... APP_URL=... NOTIFY_SECRET=...
fly deploy
# scheduled re-scans: create a QStash schedule POSTing /api/webhooks/schedule hourly
```
Exit criteria: one repo scanned, findings verified, ≥1 patch validated, visible in the dashboard.
