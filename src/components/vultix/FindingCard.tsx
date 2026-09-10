"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { ProofPanel } from "./ProofPanel";

/**
 * One finding, and the action it leads to.
 *
 * Ordered by RUNG rather than severity — see `rung()` in the dashboard. A
 * proven medium is a button; an unverified critical is homework. Severity
 * alone puts the homework first.
 *
 * Colour is a claim here, not decoration:
 *   emerald  proven by a test — and nothing else in the product is emerald
 *   amber    real, but unproven
 *   slate    dismissed as a false positive, or a site finding with no fix path
 */

export interface FindingRow {
    id: string;
    rule_id: string | null;
    severity: string | null;
    file_path: string | null;
    start_line: number | null;
    message: string | null;
    reasoning: string | null;
    unified_diff: string | null;
    unit_test: string | null;
    is_vulnerability: boolean;
    patch_applies: boolean;
    patch_validated: boolean;
    patch_validation_note?: string | null;
    estimated_patch_hours?: number | null;
}

/** How far up the ladder this finding climbed. */
export function rung(f: FindingRow): number {
    if (!f.is_vulnerability) return 0;
    if (f.patch_validated) return 4;
    if (f.patch_applies) return 3;
    if (f.unified_diff) return 2;
    return 1;
}

const SEVERITY_ORDER: Record<string, number> = { error: 3, warning: 2, note: 1 };

export function sortByRung(findings: FindingRow[]): FindingRow[] {
    return [...findings].sort(
        (a, b) =>
            rung(b) - rung(a) ||
            (SEVERITY_ORDER[(b.severity || "note").toLowerCase()] ?? 0) -
                (SEVERITY_ORDER[(a.severity || "note").toLowerCase()] ?? 0),
    );
}

function stripe(f: FindingRow): string {
    if (!f.is_vulnerability) return "bg-slate-800";
    if (f.patch_validated) return "bg-emerald-500";
    return "bg-amber-500/70";
}

function state(f: FindingRow): { label: string; cls: string } {
    if (!f.is_vulnerability) return { label: "dismissed", cls: "text-slate-500" };
    if (f.patch_validated) return { label: "proven", cls: "text-emerald-400" };
    if (f.patch_applies) return { label: "unproven", cls: "text-amber-400" };
    if (f.unified_diff) return { label: "patch written", cls: "text-amber-400" };
    return { label: "no patch", cls: "text-slate-400" };
}

export function FindingCard({ f, mode }: { f: FindingRow; mode: "git" | "web" }) {
    const [open, setOpen] = useState(rung(f) === 4); // proven fixes open by default
    const [pr, setPr] = useState<"idle" | "opening" | "done" | "error">("idle");
    const [prUrl, setPrUrl] = useState<string | null>(null);
    const [prError, setPrError] = useState<string | null>(null);
    const s = state(f);

    async function openPullRequest() {
        setPr("opening");
        setPrError(null);
        try {
            const res = await csrfFetch("/api/pr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ findingId: f.id }),
            });
            const data = await res.json();
            if (!res.ok) {
                // A 501 means no allowlist is configured on this deployment.
                // That is a setup step, and the copy has to read that way or it
                // sounds like the patch is at fault.
                setPrError(data.error || "Could not open the pull request.");
                setPr("error");
                return;
            }
            setPrUrl(data.pr_url || null);
            setPr("done");
        } catch {
            setPrError("Could not reach the server.");
            setPr("error");
        }
    }

    return (
        <div className="border-b border-slate-800/70 last:border-b-0">
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-start gap-4 px-1 py-4 text-left transition-colors hover:bg-slate-900/40"
            >
                <span className={`mt-1 h-9 w-0.5 shrink-0 ${stripe(f)}`} aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-slate-100">
                        {f.message?.split("\n")[0] || f.rule_id || "finding"}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[11px] text-slate-500">
                        {f.file_path}
                        {f.start_line ? `:${f.start_line}` : ""}
                    </span>
                </span>
                <span className={`shrink-0 font-mono text-[11px] ${s.cls}`}>{s.label}</span>
            </button>

            {open && (
                <div className="pb-5">
                    {f.reasoning && (
                        <p className="max-w-[68ch] px-5 pb-4 text-[13px] leading-relaxed text-slate-400">
                            {f.reasoning}
                        </p>
                    )}

                    {mode === "git" && (
                        <ProofPanel
                            unitTest={f.unit_test}
                            unifiedDiff={f.unified_diff}
                            patchApplies={f.patch_applies}
                            patchValidated={f.patch_validated}
                            validationNote={f.patch_validation_note}
                            estimatedHours={f.estimated_patch_hours}
                        />
                    )}

                    {mode === "git" && f.unified_diff && f.is_vulnerability && (
                        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 px-5 py-4 sm:px-7">
                            {pr === "done" && prUrl ? (
                                <a
                                    href={prUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded bg-emerald-600 px-4 py-2 text-[13px] font-medium text-emerald-950 hover:bg-emerald-500"
                                >
                                    View pull request ↗
                                </a>
                            ) : (
                                <button
                                    onClick={openPullRequest}
                                    disabled={pr === "opening"}
                                    className={`rounded px-4 py-2 text-[13px] font-medium disabled:opacity-50 ${
                                        f.patch_validated
                                            ? "bg-emerald-600 text-emerald-950 hover:bg-emerald-500"
                                            : "border border-slate-700 text-slate-300 hover:bg-slate-800"
                                    }`}
                                >
                                    {pr === "opening" ? "Opening…" : "Open pull request"}
                                </button>
                            )}
                            <span className="text-[12px] text-slate-500">
                                Opens on a branch. Nothing is merged for you.
                            </span>
                            {pr === "error" && prError && (
                                <p className="w-full text-[12px] leading-relaxed text-rose-400">{prError}</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
