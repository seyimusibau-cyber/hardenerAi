"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { csrfFetch } from "@/lib/csrf-client";

/**
 * Scan a website.
 *
 * You pick from domains already verified on this account. You do not type a
 * URL. An unverified host is not a validation error to recover from — it is
 * simply not on the list, and the way to add one is to verify it.
 *
 * The dropdown is CONVENIENCE, not the control. /api/scan keeps its own 403,
 * because a UI that only offers valid options stops honest mistakes and stops
 * nothing else. The gate exists because pointing a scanner at a host you do not
 * own is active testing, and doing it without permission is an intrusion.
 *
 * A website scan ends at "confirmed exposure": there is no source code, so no
 * diff, no test and no pull request. The page says so rather than showing an
 * empty fixes section, which would read as broken rather than different.
 */

interface Domain {
    id: string;
    domain: string;
    status: "pending" | "verified" | "failed";
}

export default function ScanWebsite() {
    const router = useRouter();
    const [domains, setDomains] = useState<Domain[]>([]);
    const [chosen, setChosen] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }
            const { data } = await supabase
                .from("domain_verifications").select("id, domain, status").eq("user_id", user.id);
            if (!alive) return;
            const rows = (data as Domain[]) ?? [];
            setDomains(rows);
            const first = rows.find((d) => d.status === "verified");
            if (first) setChosen(first.domain);
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [router]);

    async function run(e: React.FormEvent) {
        e.preventDefault();
        if (!chosen || busy) return;
        setBusy(true); setError(null); setStage("Queueing…");
        const supabase = createClient();
        let poll: ReturnType<typeof setInterval> | undefined;

        try {
            const res = await csrfFetch("/api/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUrl: chosen }),
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
                    if (row.status === "Running") setStage(row.stage || "Probing the host…");
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

    const verified = domains.filter((d) => d.status === "verified");
    const pending = domains.filter((d) => d.status !== "verified");

    return (
        <div className="w-full max-w-2xl px-6 py-9 sm:px-9">
            <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-white">Scan a website</h1>
            <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-slate-400">
                Vultix sends real requests to the host and confirms what is exposed. Because that
                is active testing, it only runs against domains you have proved you control.
            </p>

            {loading ? (
                <div className="mt-8 h-5 w-52 animate-pulse rounded bg-slate-900" />
            ) : verified.length === 0 ? (
                <div className="mt-8 max-w-2xl border border-slate-800 bg-slate-900/20 px-6 py-12 text-center">
                    <p className="text-[13.5px] text-slate-300">No verified domains yet.</p>
                    <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-slate-500">
                        Add a TXT record to your DNS and Vultix can confirm the domain is yours.
                        It takes a couple of minutes, and you only do it once per domain.
                    </p>
                    <Link href="/dashboard/domains"
                        className="mt-5 inline-block rounded bg-emerald-600 px-4 py-2 text-[13px] font-medium text-emerald-950 hover:bg-emerald-500">
                        Verify a domain
                    </Link>
                    {pending.length > 0 && (
                        <p className="mt-4 font-mono text-[11.5px] text-amber-400">
                            {pending.length} awaiting DNS — check again in a few minutes.
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <form onSubmit={run} className="mt-7 flex max-w-2xl flex-wrap gap-2">
                        <select
                            value={chosen}
                            onChange={(e) => setChosen(e.target.value)}
                            disabled={busy}
                            className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-900/50 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-200 focus:border-slate-600 focus:outline-none disabled:opacity-50"
                        >
                            {verified.map((d) => <option key={d.id} value={d.domain}>{d.domain}</option>)}
                        </select>
                        <button type="submit" disabled={busy || !chosen}
                            className="rounded bg-emerald-600 px-5 py-2.5 text-[13px] font-medium text-emerald-950 hover:bg-emerald-500 disabled:opacity-40">
                            {busy ? "Scanning…" : "Scan"}
                        </button>
                    </form>

                    <p className="mt-3 text-[12px] text-slate-600">
                        Only verified domains appear here.{" "}
                        <Link href="/dashboard/domains" className="text-slate-400 hover:text-slate-200">Add another →</Link>
                    </p>

                    {busy && stage && <p className="mt-7 font-mono text-[11.5px] text-slate-400">{stage}</p>}
                    {error && (
                        <p className="mt-6 max-w-[64ch] border-l-2 border-rose-500/60 pl-3 text-[12.5px] leading-relaxed text-rose-400">
                            {error}
                        </p>
                    )}
                </>
            )}

            <div className="mt-12 max-w-[62ch] border-t border-slate-800 pt-5">
                <h2 className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-slate-500">What this finds</h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
                    Exposures on the running host — misconfigurations, exposed panels, weak headers.
                    A live site has no source code, so a website scan confirms what is wrong but
                    cannot write or prove a fix. For that, scan the repository behind it.
                </p>
            </div>
        </div>
    );
}
