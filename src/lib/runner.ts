// Where a queued scan actually gets executed.
//
// Semgrep is a binary and a real scan outruns a Vercel function timeout, so the
// web app can never be the scanner. Something else has to run `worker/scan.mjs`.
// This picks that something, and the choice is explicit rather than inferred
// from which secrets happen to be present.
//
//   fly     ephemeral Fly.io machine (fastest, costs money)
//   github  workflow_dispatch on this repo's scan.yml (free on public repos,
//           2000 min/month on private) -- git, Node and the scanners are all
//           available on a hosted runner
//   none    no runner configured
//
// `none` FAILS the scan. That is the whole point of this module. The previous
// code fell through to `console.log("Skipping Fly.io... Simulating for dev")`
// and returned success, so on any deploy without FLY_API_TOKEN a scan flipped
// to Running and stayed there forever -- no findings, no error, no end. A scan
// that cannot be run is a failed scan, and it has to say so.
export type RunnerKind = 'service' | 'fly' | 'github' | 'none';

/** Terminal: no retry will fix this. Fail the scan and say why. */
export class RunnerUnavailableError extends Error {}

/**
 * Transient: the runner exists but could not take the job right now — cold
 * start, restart, or already busy. The scan must stay Queued so QStash retries
 * it. Marking it Failed here would turn a 50-second wait into a dead scan.
 */
export class RunnerBusyError extends Error {}

export function selectedRunner(): RunnerKind {
    const explicit = (process.env.RUNNER || '').trim().toLowerCase();
    if (explicit === 'service' || explicit === 'fly' || explicit === 'github' || explicit === 'none') {
        return explicit;
    }
    // Unset: infer from configured secrets, preferring the sandboxed path.
    if (process.env.SCANNER_URL && process.env.SCANNER_SHARED_SECRET) return 'service';
    if (process.env.GITHUB_RUNNER_TOKEN && process.env.GITHUB_RUNNER_REPO) return 'github';
    if (process.env.FLY_API_TOKEN && process.env.FLY_APP_NAME) return 'fly';
    return 'none';
}

/**
 * Hand the scan to the scanner service — a VPS or any host running
 * `worker/server.mjs`. From here they are indistinguishable: an HTTPS endpoint
 * that takes a signed job, so moving between them is a URL change.
 *
 * The signature covers `${timestamp}.${body}`. Putting the timestamp inside the
 * signed material means it cannot be edited, and it bounds replay — a captured
 * request stops working once it ages out instead of being reusable forever.
 */
async function dispatchService(scanId: string, targetUrl: string) {
    const base = (process.env.SCANNER_URL || '').replace(/\/$/, '');
    const secret = process.env.SCANNER_SHARED_SECRET;
    if (!base || !secret) {
        throw new RunnerUnavailableError(
            'RUNNER=service needs SCANNER_URL and SCANNER_SHARED_SECRET.'
        );
    }

    const body = JSON.stringify({ scanId, targetUrl });
    const ts = Date.now().toString();
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

    // Short timeout on purpose: this runs inside a serverless function that
    // cannot be held open for a cold start. A timeout is retryable, not fatal.
    const abort = AbortController ? new AbortController() : null;
    const timer = setTimeout(() => abort?.abort(), 8000);
    let res: Response;
    try {
        res = await fetch(`${base}/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-hardener-signature': `t=${ts},v1=${sig}`,
            },
            body,
            signal: abort?.signal,
        });
    } catch {
        throw new RunnerBusyError('The scanner did not answer in time. It may be starting up.');
    } finally {
        clearTimeout(timer);
    }

    if (res.status === 202) return;
    // Busy or not yet up — worth retrying.
    if (res.status === 503 || res.status === 502 || res.status === 504) {
        throw new RunnerBusyError(`The scanner is not ready (${res.status}).`);
    }
    // A bad signature or a missing route is a configuration fault. Retrying it
    // forever would hide the problem behind a scan that never finishes.
    throw new RunnerUnavailableError(`The scanner refused the job (${res.status}).`);
}

async function dispatchFly(scanId: string, targetUrl: string) {
    const app = process.env.FLY_APP_NAME;
    const res = await fetch(`https://api.machines.dev/v1/apps/${app}/machines`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.FLY_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            config: {
                image: process.env.FLY_SCANNER_IMAGE || 'registry.fly.io/hardener-scanner:latest',
                // Only per-scan vars travel here. Static secrets (GEMINI_API_KEY,
                // SUPABASE_URL, SUPABASE_SERVICE_KEY) are Fly app secrets the
                // machine inherits, so the service-role key stays out of this body.
                env: { SCAN_ID: scanId, TARGET_URL: targetUrl },
                auto_destroy: true,
            },
        }),
    });
    // An unchecked dispatch is the same failure as `none`: the scan is Running
    // and nothing is running it. Fly's response was never read before.
    if (!res.ok) {
        throw new RunnerUnavailableError(
            `Fly machine create failed (${res.status}). The scan was not started.`
        );
    }
}

async function dispatchGitHub(scanId: string, targetUrl: string) {
    const repo = process.env.GITHUB_RUNNER_REPO;          // "owner/name"
    const ref = process.env.GITHUB_RUNNER_REF || 'main';
    const workflow = process.env.GITHUB_RUNNER_WORKFLOW || 'scan.yml';
    const res = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_RUNNER_TOKEN}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            // Inputs are strings by contract; secrets live in repo settings.
            body: JSON.stringify({ ref, inputs: { scan_id: scanId, target_url: targetUrl } }),
        }
    );
    // 204 No Content is success for workflow_dispatch.
    if (res.status !== 204) {
        throw new RunnerUnavailableError(
            `GitHub workflow_dispatch failed (${res.status}). The scan was not started.`
        );
    }
}

export async function dispatchScan(scanId: string, targetUrl: string): Promise<RunnerKind> {
    const runner = selectedRunner();
    if (runner === 'service') await dispatchService(scanId, targetUrl);
    else if (runner === 'fly') await dispatchFly(scanId, targetUrl);
    else if (runner === 'github') await dispatchGitHub(scanId, targetUrl);
    else {
        throw new RunnerUnavailableError(
            'No scan runner is configured. Set RUNNER=service with SCANNER_URL and ' +
            'SCANNER_SHARED_SECRET (the sandboxed path), or RUNNER=github, or RUNNER=fly.'
        );
    }
    return runner;
}
