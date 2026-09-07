// The scanner service.
//
// Two jobs, and the split between them is the whole security design:
//
//   THIS PROCESS holds the credentials and talks to Supabase. It never touches
//   the code being scanned.
//
//   THE CONTAINER touches the code being scanned. It holds no database
//   credential, is thrown away after every scan, and cannot write to its own
//   filesystem.
//
// Why that split is not optional: `validate.mjs` executes a test an LLM wrote,
// inside a repository a stranger chose. That is arbitrary code execution by
// design. `childEnv()` keeps the keys out of the test's environment, which stops
// an accidental leak — but a test running as the same user in the same container
// can read `/proc/<pid>/environ` and get them anyway. So the process holding the
// keys and the process running the untrusted code must be different containers,
// not merely different processes.
//
// The container reports back on stdout (see DRY_RUN in scan.mjs) and this
// process performs the database write.
//
// Run: node server.mjs   (env below)
import http from "node:http";
import { spawn } from "node:child_process";
import { verify as verifySignature } from "./signature.mjs";
import { createClient } from "@supabase/supabase-js";

const {
  PORT = "8080",
  SCANNER_SHARED_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SCANNER_IMAGE = "hardener-scanner:latest",
  MAX_CONCURRENT_SCANS = "1",
  SCAN_MEMORY = "2g",
  SCAN_CPUS = "1.5",
  SCAN_TMPFS_SIZE = "4g",
  SCAN_TIMEOUT_MS = "1500000",
  MAX_FINDINGS = "25",
  VERIFIER = "gemini",
  GEMINI_API_KEY,
  GEMINI_MODEL,
  SANDBOX = "docker",
  ALLOW_UNSANDBOXED,
  SIGNATURE_MAX_AGE_MS = "300000",
} = process.env;

for (const [k, v] of Object.entries({ SCANNER_SHARED_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
  if (!v) { console.error(`missing required env ${k}`); process.exit(1); }
}

// `SANDBOX=none` runs the scan as a child process of this one — the exact
// arrangement the container exists to prevent. It stays available for local
// development and requires a second, differently-named variable, so it cannot
// be reached by setting one thing wrongly in a dashboard.
const SANDBOXED = SANDBOX !== "none";
if (!SANDBOXED && ALLOW_UNSANDBOXED !== "1") {
  console.error("SANDBOX=none requires ALLOW_UNSANDBOXED=1. Refusing to run untrusted code beside the keys.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const RESULT_FENCE = "---HARDENER-RESULT---";
const running = new Set();

// ---------------------------------------------------------------- signature

// See signature.mjs. Kept as a one-line wrapper so the secret and max-age are
// bound here rather than threaded through every call site.
function verify(rawBody, header) {
  return verifySignature(SCANNER_SHARED_SECRET, rawBody, header, Number(SIGNATURE_MAX_AGE_MS));
}

// ------------------------------------------------------------------ sandbox

function dockerArgs(scanId, targetUrl) {
  const env = {
    SCAN_ID: scanId,              // a row id, not a secret
    TARGET_URL: targetUrl,
    DRY_RUN: "1",                 // report on stdout; write nothing
    MAX_FINDINGS,
    SCAN_TIMEOUT_MS,
    VERIFIER,
    HOME: "/tmp",                 // the root filesystem is read-only
    // git needs an identity for `apply --3way` and the stash cycle, and the
    // image's global config lives in root's home, which this user cannot read.
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Hardener Worker",
    GIT_AUTHOR_EMAIL: "worker@hardener.ai",
    GIT_COMMITTER_NAME: "Hardener Worker",
    GIT_COMMITTER_EMAIL: "worker@hardener.ai",
  };
  // The one credential that may enter the container, and only when the AI
  // verifier is switched on. With VERIFIER=none the container holds nothing at
  // all — which is the strongest form of this and the reason to ship that mode.
  if (VERIFIER !== "none" && GEMINI_API_KEY) env.GEMINI_API_KEY = GEMINI_API_KEY;
  if (GEMINI_MODEL) env.GEMINI_MODEL = GEMINI_MODEL;

  const args = [
    "run", "--rm",
    "--name", `hardener-scan-${scanId}`,
    // Network is required: the scan clones the repository, and the verifier
    // calls the API. Egress is therefore NOT the boundary being defended here —
    // the boundary is that the container holds nothing worth exfiltrating.
    "--network", "bridge",
    "--user", "10001:10001",
    "--read-only",
    `--tmpfs=/tmp:rw,exec,nosuid,nodev,size=${SCAN_TMPFS_SIZE}`,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", "512",
    "--memory", SCAN_MEMORY,
    "--memory-swap", SCAN_MEMORY,   // equal to --memory disables swap for it
    "--cpus", SCAN_CPUS,
  ];
  for (const [k, v] of Object.entries(env)) args.push("-e", `${k}=${v}`);
  args.push(SCANNER_IMAGE, "node", "scan.mjs");
  return args;
}

// Runs one scan and returns the parsed payload, or throws.
function runScan(scanId, targetUrl) {
  const [cmd, args] = SANDBOXED
    ? ["docker", dockerArgs(scanId, targetUrl)]
    : ["node", ["scan.mjs"]];

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: SANDBOXED
        ? { PATH: process.env.PATH }
        : { ...process.env, SCAN_ID: scanId, TARGET_URL: targetUrl, DRY_RUN: "1" },
    });

    let out = "", err = "";
    // A scan that floods stdout must not become this service's memory problem.
    const CAP = 32 * 1024 * 1024;
    child.stdout.on("data", (d) => { if (out.length < CAP) out += d; });
    child.stderr.on("data", (d) => { if (err.length < CAP) err += d; });

    // The container has its own wall-clock guard; this one covers the case
    // where it is too wedged to enforce it.
    const kill = setTimeout(() => {
      if (SANDBOXED) spawn("docker", ["kill", `hardener-scan-${scanId}`], { stdio: "ignore" });
      else child.kill("SIGKILL");
    }, Number(SCAN_TIMEOUT_MS) + 60_000);

    child.on("error", (e) => { clearTimeout(kill); reject(new Error(`could not start scanner: ${e.message}`)); });
    child.on("close", (code) => {
      clearTimeout(kill);
      const i = out.lastIndexOf(RESULT_FENCE);
      if (i === -1) {
        // No payload: the scan died before it could report. Say so with the
        // tail of stderr rather than leaving the row Running forever.
        return reject(new Error(
          `scanner produced no result (exit ${code}). ${err.trim().split("\n").slice(-3).join(" ").slice(0, 300)}`
        ));
      }
      try {
        resolve(JSON.parse(out.slice(i + RESULT_FENCE.length)));
      } catch (e) {
        reject(new Error(`unreadable scanner result: ${e.message}`));
      }
    });
  });
}

// ----------------------------------------------------------------- database

async function setScan(scanId, fields) {
  await supabase.from("scans")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", scanId);
}

async function persist(scanId, payload) {
  const rows = (payload.findings || []).map((r) => ({ ...r, scan_id: scanId }));
  if (rows.length) {
    // Idempotent: a retried dispatch re-runs the scan, so clear first.
    await supabase.from("findings").delete().eq("scan_id", scanId);
    const { error } = await supabase.from("findings").insert(rows);
    if (error) throw new Error(`findings insert failed: ${error.message}`);
  }
  const scan = payload.scan || {};
  await setScan(scanId, {
    ...scan,
    status: scan.status || "Completed",
    progress: 100,
  });
}

async function handleScan(scanId, targetUrl) {
  running.add(scanId);
  try {
    await setScan(scanId, { status: "Running", progress: 10 });
    const payload = await runScan(scanId, targetUrl);
    await persist(scanId, payload);
    console.log(`[scan ${scanId}] done: ${(payload.findings || []).length} finding(s)`);
  } catch (e) {
    console.error(`[scan ${scanId}] failed: ${e.message}`);
    await setScan(scanId, {
      status: "Failed",
      progress: 100,
      error_message: String(e.message).slice(0, 500),
    }).catch(() => {});
  } finally {
    running.delete(scanId);
  }
}

// --------------------------------------------------------------------- http

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    return json(res, 200, { ok: true, running: running.size, sandboxed: SANDBOXED });
  }
  if (req.method !== "POST" || req.url !== "/scan") return json(res, 404, { error: "not found" });

  let raw = "";
  let tooBig = false;
  req.on("data", (d) => {
    raw += d;
    if (raw.length > 16 * 1024) { tooBig = true; req.destroy(); }
  });
  req.on("close", () => { if (tooBig && !res.headersSent) json(res, 413, { error: "body too large" }); });
  req.on("end", () => {
    const bad = verify(raw, req.headers["x-hardener-signature"]);
    if (bad) return json(res, 401, { error: bad });

    let body;
    try { body = JSON.parse(raw); } catch { return json(res, 400, { error: "invalid json" }); }
    const { scanId, targetUrl } = body || {};
    if (typeof scanId !== "string" || typeof targetUrl !== "string" || !scanId || !targetUrl) {
      return json(res, 400, { error: "scanId and targetUrl are required" });
    }
    if (running.has(scanId)) return json(res, 202, { accepted: true, note: "already running" });
    // 503, not 500: the caller should retry this rather than fail the scan.
    if (running.size >= Number(MAX_CONCURRENT_SCANS)) {
      return json(res, 503, { error: "scanner busy", running: running.size });
    }

    // Accept first, work after. The caller is a serverless function and must
    // not be held open for the length of a scan.
    json(res, 202, { accepted: true });
    handleScan(scanId, targetUrl);
  });
});

server.listen(Number(PORT), () => {
  console.log(`scanner listening on :${PORT} — sandbox=${SANDBOXED ? SCANNER_IMAGE : "NONE (development)"}, ` +
              `verifier=${VERIFIER}, max concurrent=${MAX_CONCURRENT_SCANS}`);
});
