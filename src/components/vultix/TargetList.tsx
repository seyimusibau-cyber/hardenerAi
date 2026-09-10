"use client";

import Link from "next/link";

/**
 * The list a returning user actually wants.
 *
 * The old dashboard showed a flat table of SCAN EVENTS, which cannot answer
 * "is my repo clean now?" without the reader grouping rows in their head. A
 * target is the thing they own; a scan is one moment in its history.
 *
 * State is carried by a 2px stripe rather than a card. Border, fill and radius
 * each say "separate object" — spending all three on every row flattens the
 * hierarchy until the page is a list of equals, which is what made the old one
 * feel dry.
 */

export interface TargetRow {
    id: string;
    target_url: string;
    mode: "git" | "web";
    last_scanned_at: string | null;
    proven?: number;
    unproven?: number;
    exposures?: number;
    scanning?: boolean;
}

function label(t: TargetRow): string {
    if (t.mode === "git") {
        const m = t.target_url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
        return m ? m[2] : t.target_url;
    }
    try {
        return new URL(t.target_url.startsWith("http") ? t.target_url : `https://${t.target_url}`).hostname;
    } catch {
        return t.target_url;
    }
}

function ago(iso: string | null): string {
    if (!iso) return "never scanned";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function stripeFor(t: TargetRow): string {
    if (t.scanning) return "bg-slate-600 animate-pulse";
    if ((t.proven ?? 0) > 0) return "bg-emerald-500";
    if ((t.unproven ?? 0) > 0 || (t.exposures ?? 0) > 0) return "bg-amber-500/70";
    return "bg-slate-800";
}

function status(t: TargetRow) {
    if (t.scanning) return <span className="text-slate-400">scanning…</span>;
    if (t.mode === "web") {
        return (t.exposures ?? 0) > 0 ? (
            <span className="text-amber-400">{t.exposures} exposures</span>
        ) : (
            <span className="text-slate-500">clear</span>
        );
    }
    if ((t.proven ?? 0) > 0) {
        return (
            <>
                <span className="text-emerald-400">{t.proven} proven</span>
                {(t.unproven ?? 0) > 0 && (
                    <span className="text-slate-500"> · {t.unproven} unpatched</span>
                )}
            </>
        );
    }
    if ((t.unproven ?? 0) > 0) return <span className="text-amber-400">{t.unproven} unproven</span>;
    return <span className="text-slate-500">clean</span>;
}

export function TargetList({ targets }: { targets: TargetRow[] }) {
    if (targets.length === 0) {
        return (
            <div className="border-t border-slate-800 px-1 py-14 text-center">
                <p className="text-[14px] text-slate-300">Nothing is being watched yet.</p>
                <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">
                    Add a GitHub repository and Vultix will find what is broken, write the fix,
                    and prove it works before you merge anything.
                </p>
            </div>
        );
    }

    return (
        <div className="border-t border-slate-800">
            {targets.map((t) => (
                <Link
                    key={t.id}
                    href={`/dashboard/targets/${t.id}`}
                    className="flex items-start gap-4 border-b border-slate-800/70 px-1 py-4 transition-colors last:border-b-0 hover:bg-slate-900/40"
                >
                    <span className={`mt-1 h-9 w-0.5 shrink-0 ${stripeFor(t)}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                            <span className="truncate text-[13.5px] font-medium text-slate-100">{label(t)}</span>
                            <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-slate-600">
                                {t.mode === "git" ? "repo" : "site"}
                            </span>
                        </span>
                        <span className="mt-1 block truncate font-mono text-[11px] text-slate-600">
                            {t.target_url.replace(/^https?:\/\//, "").replace(/\.git$/, "")} · {ago(t.last_scanned_at)}
                        </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px]">{status(t)}</span>
                </Link>
            ))}
        </div>
    );
}
