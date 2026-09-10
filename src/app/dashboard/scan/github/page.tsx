"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { csrfFetch } from "@/lib/csrf-client";

/**
 * Scan a GitHub repository.
 *
 * No ownership proof is required and that is deliberate, not an oversight:
 * reading a public repository is reading something already published, which is
 * how every SAST tool works. Active testing of a host you do not own is the
 * thing that needs permission — see /dashboard/scan/website.
 *
 * The page carries the whole process: paste, watch the named stages, land on
 * the result. Stages come from `scans.stage`, relayed out of the sandbox by
 * server.mjs, so what is shown is what the scanner is actually doing rather
 * than a progress bar counting to itself.
 */

const STAGES = [
    "Cloning repository",
    "Semgrep — code patterns",
    "Gitleaks — committed secrets",
    "osv-scanner — vulnerable dependencies",
    "AI verification",
];

export default function ScanGitHub() {
    const router = useRouter();
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function run(e: React.FormEvent) {
        e.preventDefault();
        const target = url.trim();
        if (!target || busy) return;

        setBusy(true); setError(null); setStage("Queueing…");
        const supabase = createClient();
        let poll: ReturnType<typeof setInterval> | undefined;

        try {
            const res = await csrfFetch("/api/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUrl: target }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "The scan could not be started.");

            const scanId: string = data.scanId;
            const started = Date.now();
            let targetId: string | null = null;

            await new Promise<void>((resolve, reject) => {
                poll = setInterval(async () => {
                    const { data: row } = await supabase
                        .from("scans").select("target_id, status, stage, error_message").eq("id", scanId).single();
                    if (!row) return;
                    targetId = row.target_id;
                    if (row.status === "Running") setStage(row.stage || "Scanning…");
                    if (row.status === "Completed") return resolve();
                    if (row.status === "Failed") return reject(new Error(row.error_message || "The scan failed."));
                    if (Date.now() - started > 10 * 60 * 1000) {
                        reject(new Error("Still running. It will appear on your dashboard when it finishes."));
                    }
                }, 3000);
            });

            router.push(targetId ? `/dashboard/targets/${targetId}` : "/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "The scan could not be started.");
            setBusy(false); setStage("");
        } finally {
            if (poll) clearInterval(poll);
        }
    }

    const current = STAGES.indexOf(stage);

    return (
        <div className="w-full max-w-2xl px-6 py-9 sm:px-9">
            <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-white">Scan a GitHub repository</h1>
            <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-slate-400">
                Vultix clones the code, finds what is broken, writes a patch, and runs a test to
                prove the patch works — then offers to open the pull request.
            </p>

            <form onSubmit={run} className="mt-7 flex max-w-2xl flex-wrap gap-2">
                <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={busy}
                    placeholder="github.com/owner/repo"
                    className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-900/50 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none disabled:opacity-50"
                />
                <button type="submit" disabled={busy || !url.trim()}
                    className="rounded bg-emerald-600 px-5 py-2.5 text-[13px] font-medium text-emerald-950 hover:bg-emerald-500 disabled:opacity-40">
                    {busy ? "Scanning…" : "Scan"}
                </button>
            </form>

            {/* Named steps, because a repository scan takes minutes and one
                spinner for four minutes reads as a hang. */}
            {busy && (
                <div className="mt-8 max-w-md border-l border-slate-800 pl-5">
                    {STAGES.map((s, i) => (
                        <div key={s} className="flex items-center gap-3 py-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${
                                current > i ? "bg-emerald-500" : current === i ? "animate-pulse bg-emerald-400" : "bg-slate-700"
                            }`} />
                            <span className={`font-mono text-[11.5px] ${
                                current >= i ? "text-slate-300" : "text-slate-600"
                            }`}>{s}</span>
                        </div>
                    ))}
                    {current === -1 && <p className="pt-1 font-mono text-[11.5px] text-slate-500">{stage}</p>}
                </div>
            )}

            {error && (
                <p className="mt-6 max-w-[64ch] border-l-2 border-rose-500/60 pl-3 text-[12.5px] leading-relaxed text-rose-400">
                    {error}
                </p>
            )}

            <div className="mt-12 max-w-[62ch] border-t border-slate-800 pt-5">
                <h2 className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-slate-500">Private repositories</h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
                    Public repositories work now. Private ones need you to install the Vultix GitHub
                    App so we can read them — per repository, and revocable by you at any time.
                    That is not built yet.
                </p>
            </div>
        </div>
    );
}
