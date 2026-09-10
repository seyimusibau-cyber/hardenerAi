"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { FindingCard, sortByRung, type FindingRow } from "@/components/vultix/FindingCard";

/**
 * One target: its findings, and its history.
 *
 * The screen branches on MODE, and the branch is the point. A repository can
 * climb all five rungs — candidate, confirmed, patched, proven, shipped — so it
 * gets the proof panel and a pull request button. A website stops at rung two:
 * there is no source code, so no diff, no test and no PR (vultix-backend/
 * scan.mjs: "No code to patch, so patch validation is skipped").
 *
 * A site rendered in the repository layout would show an empty Fixes section,
 * which reads as broken rather than as a different product. So it gets its own
 * ending, and the bridge back to Mode A: scan the repo behind the site.
 */

interface Target {
    id: string;
    target_url: string;
    mode: "git" | "web";
    last_scanned_at: string | null;
}

interface Scan {
    id: string;
    status: string;
    created_at: string;
    score: number | null;
    grade: string | null;
    findings_assessed: number | null;
    findings_truncated: boolean | null;
    error_message: string | null;
}

export default function TargetPage() {
    const { id } = useParams<{ id: string }>();
    const supabase = createClient();

    const [target, setTarget] = useState<Target | null>(null);
    const [scans, setScans] = useState<Scan[]>([]);
    const [findings, setFindings] = useState<FindingRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        // Everything is fetched first, then committed in one pass. Writing
        // state between awaits makes React re-render on each step and trips the
        // cascading-render rule; it also flashes a half-loaded screen.
        const { data: t } = await supabase.from("targets").select("*").eq("id", id).single();

        const { data: s } = await supabase
            .from("scans").select("id, status, created_at, score, grade, findings_assessed, findings_truncated, error_message")
            .eq("target_id", id).order("created_at", { ascending: false }).limit(10);
        const rows = (s as Scan[]) ?? [];

        let found: FindingRow[] = [];
        const latest = rows.find((x) => x.status === "Completed");
        if (latest) {
            const res = await fetch(`/api/findings?scanId=${encodeURIComponent(latest.id)}`);
            const data = await res.json().catch(() => ({}));
            if (res.ok) found = sortByRung((data.findings ?? []) as FindingRow[]);
        }

        return { target: (t as Target) ?? null, scans: rows, findings: found };
    }, [id, supabase]);

    function commit(next: { target: Target | null; scans: Scan[]; findings: FindingRow[] }) {
        setTarget(next.target);
        setScans(next.scans);
        setFindings(next.findings);
        setLoading(false);
    }

    useEffect(() => {
        // `alive` stops a late response writing state after navigation — the
        // findings fetch can outlast the page. It also keeps the effect body
        // free of a synchronous setState, which is what the cascading-render
        // rule is guarding against.
        let alive = true;
        void (async () => {
            const next = await load();
            if (alive && next) commit(next);
        })();
        return () => { alive = false; };
    }, [load]);

    if (loading) {
        return (
            <div className="w-full max-w-5xl px-6 py-9 sm:px-9">
                <div className="h-5 w-48 animate-pulse rounded bg-slate-900" />
            </div>
        );
    }

    if (!target) {
        return (
            <div className="w-full max-w-5xl px-6 py-9 sm:px-9">
                <p className="text-[14px] text-slate-300">That target does not exist, or is not yours.</p>
                <Link href="/dashboard" className="mt-3 inline-block font-mono text-[12px] text-emerald-400">← dashboard</Link>
            </div>
        );
    }

    const mode = target.mode;
    const real = findings.filter((f) => f.is_vulnerability);
    const proven = real.filter((f) => f.patch_validated);
    const dismissed = findings.length - real.length;
    const latest = scans.find((s) => s.status === "Completed");
    const name = target.target_url.replace(/^https?:\/\//, "").replace(/\.git$/, "");

    return (
        <div className="w-full max-w-5xl px-6 py-9 sm:px-9">
                <section className="pb-8">
                    <div className="flex items-baseline gap-2.5">
                        <h1 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-white">{name}</h1>
                        <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-slate-600">
                            {mode === "git" ? "repo" : "site"}
                        </span>
                    </div>

                    <p className="mt-2.5 max-w-[62ch] text-[13.5px] leading-relaxed text-slate-400">
                        {mode === "git" ? (
                            proven.length > 0 ? (
                                <>
                                    <span className="text-emerald-400">
                                        {proven.length === 1 ? "One fix is" : `${proven.length} fixes are`} ready to ship
                                    </span>
                                    {real.length > proven.length && `, and ${real.length - proven.length} more need review`}.
                                </>
                            ) : real.length > 0 ? (
                                <>{real.length} confirmed {real.length === 1 ? "issue" : "issues"}, none proven by a test yet.</>
                            ) : (
                                <>Nothing confirmed in the last scan.</>
                            )
                        ) : real.length > 0 ? (
                            <>{real.length} {real.length === 1 ? "exposure" : "exposures"} confirmed on this host.</>
                        ) : (
                            <>No exposures confirmed on this host.</>
                        )}
                        {dismissed > 0 && (
                            <span className="text-slate-500"> {dismissed} candidate{dismissed === 1 ? "" : "s"} dismissed as false positives.</span>
                        )}
                    </p>

                    {/* The score describes a SAMPLE when the cap truncated. Saying
                        so is the difference between a grade and a claim. */}
                    {latest?.findings_truncated && (
                        <p className="mt-3 max-w-[62ch] border-l-2 border-amber-500/60 pl-3 text-[12.5px] leading-relaxed text-amber-300/90">
                            Only {latest.findings_assessed} findings were verified on this scan.
                            The result describes a sample, not the whole {mode === "git" ? "repository" : "host"}.
                        </p>
                    )}
                </section>

                {findings.length > 0 ? (
                    <section className="border-t border-slate-800">
                        {findings.map((f) => <FindingCard key={f.id} f={f} mode={mode} />)}
                    </section>
                ) : (
                    <section className="border-t border-slate-800 py-14 text-center">
                        <p className="text-[13.5px] text-slate-400">
                            {scans.length === 0 ? "This target has not been scanned yet." : "Nothing was found in the last scan."}
                        </p>
                    </section>
                )}

                {/* Mode B -> Mode A. We cannot patch a live host, but we can
                    patch the code behind it — and that is the reason both modes
                    belong in one product. */}
                {mode === "web" && real.length > 0 && (
                    <section className="mt-8 border-l-2 border-emerald-600/60 pl-4">
                        <p className="max-w-[62ch] text-[13px] leading-relaxed text-slate-400">
                            <span className="font-medium text-slate-200">These are exposures, not fixes.</span>{" "}
                            A live host has no source code to patch, so Vultix can confirm what is
                            exposed but cannot write or prove a repair. Scan the repository behind
                            this site and it will open pull requests for what it finds.
                        </p>
                        <Link href="/dashboard" className="mt-3 inline-block font-mono text-[12px] text-emerald-400 hover:text-emerald-300">
                            Add the repository →
                        </Link>
                    </section>
                )}

                {scans.length > 0 && (
                    <section className="mt-12">
                        <h2 className="border-b border-slate-800 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            History
                        </h2>
                        {scans.map((s) => (
                            <div key={s.id} className="flex items-baseline justify-between gap-4 border-b border-slate-800/70 py-3">
                                <span className="font-mono text-[11.5px] text-slate-500">
                                    {new Date(s.created_at).toLocaleString()}
                                </span>
                                <span className={`shrink-0 font-mono text-[11.5px] ${
                                    s.status === "Completed" ? "text-slate-400"
                                        : s.status === "Failed" ? "text-rose-400" : "text-amber-400"
                                }`}>
                                    {s.status === "Failed" && s.error_message
                                        ? s.error_message.slice(0, 60)
                                        : s.status.toLowerCase()}
                                </span>
                            </div>
                        ))}
                    </section>
                )}
        </div>
    );
}
