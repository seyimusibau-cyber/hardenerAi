# Vultix scanner worker

Ephemeral Fly.io machine that does the actual scanning. Spawned per scan by
`/api/webhooks/qstash` (image `registry.fly.io/vultix-scanner:latest`,
`auto_destroy=true`).

## Flow
clone repo → Semgrep (`--config auto`, SARIF) → per finding: extract code
context → AI verify (genuine vs false positive + patch + test) → **validate the
patch by applying it and running the test** → write rows to `findings` and
aggregate onto `scans`.

## Env (passed by the webhook)
`SCAN_ID`, `TARGET_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`.
Optional: `MAX_FINDINGS` (default 25), `GEMINI_MODEL`.

## Deploy
```bash
cd worker
fly launch --no-deploy        # first time; creates the app
fly secrets set GEMINI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
fly deploy                     # builds + pushes registry.fly.io/vultix-scanner:latest
```

## Local smoke (no Fly)
```bash
npm install
SCAN_ID=<uuid> TARGET_URL=https://github.com/owner/repo \
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... GEMINI_API_KEY=... \
node scan.mjs
```

## Scope
Phase 0 = SAST on git repos. Non-git targets are marked `Failed` with a clear
message; live-URL DAST is Phase 2 (add a source type in `sources.mjs`).
