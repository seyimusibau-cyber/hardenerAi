// Target ingestion. Phase 0 = SAST on a git repo (fast, deterministic).
// Live-URL DAST is Phase 2 and slots in here as another source type.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 180_000, stdio: "pipe", ...opts });
}

export function classifyTarget(target) {
  const t = target.trim();
  if (/github\.com[/:]/.test(t) || t.endsWith(".git")) return "git";
  return "web"; // no repo to statically analyze -> DAST territory (Phase 2)
}

// Shallow-clone a public repo into a temp dir. Returns the checkout path.
export function cloneRepo(target) {
  let url = target.trim();
  if (url.startsWith("git@")) url = url.replace("git@github.com:", "https://github.com/");
  if (!/^https?:\/\//.test(url)) url = "https://" + url;
  if (!url.endsWith(".git") && /github\.com/.test(url)) url += ".git";
  const dir = mkdtempSync(join(tmpdir(), "vultix-repo-"));
  run("git", ["clone", "--depth", "1", url, dir]);
  return dir;
}

// Rough primary-language guess from the tree, to pick a test runner later.
export function detectLanguage(repoDir) {
  if (existsSync(join(repoDir, "package.json"))) {
    try {
      const p = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8"));
      const dev = { ...p.dependencies, ...p.devDependencies };
      if (Object.keys(dev).some((d) => /typescript|ts-/.test(d))) return "typescript";
    } catch {}
    return "javascript";
  }
  if (existsSync(join(repoDir, "requirements.txt")) || existsSync(join(repoDir, "pyproject.toml")))
    return "python";
  if (existsSync(join(repoDir, "go.mod"))) return "go";
  if (existsSync(join(repoDir, "Cargo.toml"))) return "rust";
  return "unknown";
}

// Run Semgrep and return the parsed SARIF runs[0].results array.
export function runSemgrep(repoDir) {
  const out = join(mkdtempSync(join(tmpdir(), "vultix-sarif-")), "out.sarif");
  try {
    run("semgrep", ["scan", "--config", "auto", "--sarif", "--output", out, "--quiet", "--timeout", "0", repoDir],
        { cwd: repoDir, timeout: 600_000, env: { ...process.env, SEMGREP_SEND_METRICS: "off" } });
  } catch (err) {
    // Semgrep exits non-zero when findings exist; the SARIF file is still written.
    if (!existsSync(out)) throw err;
  }
  if (!existsSync(out)) return [];
  const sarif = JSON.parse(readFileSync(out, "utf8"));
  return sarif.runs?.[0]?.results ?? [];
}

// Pull ±`ctx` lines of source around a SARIF result for the AI's code context.
export function extractSnippet(repoDir, result, ctx = 15) {
  const loc = result.locations?.[0]?.physicalLocation;
  const rel = loc?.artifactLocation?.uri;
  const line = loc?.region?.startLine ?? 1;
  if (!rel) return { file: "", line, snippet: "" };
  const abs = rel.startsWith("/") ? rel : join(repoDir, rel);
  let lines = [];
  try { lines = readFileSync(abs, "utf8").split("\n"); } catch { return { file: rel, line, snippet: "" }; }
  const from = Math.max(0, line - 1 - ctx);
  const to = Math.min(lines.length, line - 1 + ctx);
  const snippet = lines.slice(from, to)
    .map((l, i) => `${String(from + i + 1).padStart(4)}| ${l}`).join("\n");
  return { file: rel, line, snippet };
}

// Gitleaks — secret detection. Emits SARIF; we normalize it into the same
// shape as Semgrep results so the rest of the pipeline is source-agnostic.
export function runGitleaks(repoDir) {
  const out = join(mkdtempSync(join(tmpdir(), "vultix-gl-")), "gl.sarif");
  try {
    run("gitleaks", ["detect", "--source", repoDir, "--report-format", "sarif",
                     "--report-path", out, "--no-banner", "--exit-code", "0"],
        { cwd: repoDir, timeout: 300_000 });
  } catch (err) {
    if (!existsSync(out)) { console.error(`[gitleaks] ${err?.message?.split("\n")[0]}`); return []; }
  }
  if (!existsSync(out)) return [];
  try {
    const sarif = JSON.parse(readFileSync(out, "utf8"));
    return sarif.runs?.[0]?.results ?? [];
  } catch { return []; }
}

// osv-scanner — dependency/SCA vulnerabilities from lockfiles. SARIF out,
// normalized into the shared result shape.
export function runOsvScanner(repoDir) {
  const out = join(mkdtempSync(join(tmpdir(), "vultix-osv-")), "osv.sarif");
  try {
    run("osv-scanner", ["scan", "--format", "sarif", "--output", out, "-r", repoDir],
        { cwd: repoDir, timeout: 300_000 });
  } catch (err) {
    if (!existsSync(out)) { console.error(`[osv] ${err?.message?.split("\n")[0]}`); return []; }
  }
  if (!existsSync(out)) return [];
  try {
    const sarif = JSON.parse(readFileSync(out, "utf8"));
    return sarif.runs?.[0]?.results ?? [];
  } catch { return []; }
}

// DAST for live URLs (Phase 2, experimental). Uses nuclei if present in the
// image. Returns results in the shared shape. Kept behind classifyTarget so it
// only runs for "web" targets. A full crawler + ZAP active scan is future work.
export function runNuclei(targetUrl) {
  const out = join(mkdtempSync(join(tmpdir(), "vultix-dast-")), "nuclei.sarif");
  try {
    run("nuclei", ["-u", targetUrl, "-silent", "-sarif-export", out, "-timeout", "10"],
        { timeout: 600_000 });
  } catch (err) {
    if (!existsSync(out)) { console.error(`[nuclei] ${err?.message?.split("\n")[0]}`); return []; }
  }
  if (!existsSync(out)) return [];
  try { return JSON.parse(readFileSync(out, "utf8")).runs?.[0]?.results ?? []; }
  catch { return []; }
}
