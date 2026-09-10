"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { csrfFetch } from "@/lib/csrf-client";

/**
 * Settings — the things visited once.
 *
 * Domain verification lives here, not on the dashboard. It used to be the first
 * thing a new user saw: a DNS TXT record form, before they had scanned anything
 * and for a control that never applies to a GitHub repository at all.
 *
 * The gate itself is not friction to be optimised away. Pointing a scanner at a
 * host you do not own IS active testing, and doing it without permission is an
 * intrusion — see the header of src/lib/target.ts. So the copy states the
 * reason rather than apologising for the wait.
 */

interface Verification {
    id: string;
    domain: string;
    status: "pending" | "verified" | "failed";
    verified_at: string | null;
}

export default function Domains() {
    const supabase = createClient();
    const [domains, setDomains] = useState<Verification[]>([]);

    const [domain, setDomain] = useState("");
    const [token, setToken] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: d } = await supabase
            .from("domain_verifications").select("id, domain, status, verified_at")
            .eq("user_id", user.id).order("created_at", { ascending: false });
        setDomains((d as Verification[]) ?? []);
    }, [supabase]);

    useEffect(() => { load(); }, [load]);

    async function generate(e: React.FormEvent) {
        e.preventDefault();
        const d = domain.trim();
        if (!d || busy) return;
        setBusy(true); setMsg(null); setToken(null);
        try {
            const res = await csrfFetch("/api/verify-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "generate", domain: d }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not create a verification token.");
            setToken(data.token);
            setPending(d);
        } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
        } finally { setBusy(false); }
    }

    async function check() {
        if (!pending || busy) return;
        setBusy(true); setMsg(null);
        try {
            const res = await csrfFetch("/api/verify-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "verify", domain: pending }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                // DNS propagation is minutes to hours. Saying so is kinder than
                // a bare failure, which reads as "you did it wrong".
                throw new Error(data.error || "That TXT record has not reached us yet. DNS can take a few minutes to a few hours — try again shortly.");
            }
            setMsg({ ok: true, text: `${pending} is verified. You can scan it now.` });
            setToken(null); setPending(null); setDomain("");
            await load();
        } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
        } finally { setBusy(false); }
    }


    return (
        <div className="w-full max-w-3xl px-6 py-9 sm:px-9">
                <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-white">Domains</h1>

                {/* domains */}
                <section>
                    <h2 className="border-b border-slate-800 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        Verified domains
                    </h2>
                    <p className="max-w-[64ch] pt-4 text-[13px] leading-relaxed text-slate-400">
                        Scanning a live website means sending real requests to it, which is only
                        yours to authorise. Proving you control the domain is what keeps that on
                        the right side of the line.{" "}
                        <span className="text-slate-500">GitHub repositories need none of this — reading public code is not a probe.</span>
                    </p>

                    {domains.length > 0 && (
                        <div className="mt-5 border-t border-slate-800">
                            {domains.map((d) => (
                                <div key={d.id} className="flex items-center justify-between gap-4 border-b border-slate-800/70 py-3">
                                    <span className="truncate font-mono text-[12.5px] text-slate-300">{d.domain}</span>
                                    <span className={`shrink-0 font-mono text-[11px] ${
                                        d.status === "verified" ? "text-emerald-400" : "text-amber-400"
                                    }`}>
                                        {d.status === "verified" ? "verified" : "awaiting DNS"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <form onSubmit={generate} className="mt-6 flex flex-wrap gap-2">
                        <input
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            disabled={busy}
                            placeholder="example.com"
                            className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-900/50 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
                        />
                        <button
                            type="submit"
                            disabled={busy || !domain.trim()}
                            className="rounded border border-slate-700 px-4 py-2.5 text-[13px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                        >
                            Get record
                        </button>
                    </form>

                    {token && pending && (
                        <div className="mt-5 border border-slate-800 bg-[#0A1017] p-5">
                            <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-slate-500">
                                Add this TXT record to {pending}
                            </div>
                            <div className="mt-3 flex items-start gap-3">
                                <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-emerald-400">{token}</code>
                                <button
                                    onClick={() => { navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                    className="shrink-0 rounded border border-slate-700 px-2.5 py-1 font-mono text-[10.5px] text-slate-400 hover:text-slate-200"
                                >
                                    {copied ? "copied" : "copy"}
                                </button>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button
                                    onClick={check}
                                    disabled={busy}
                                    className="rounded bg-emerald-600 px-4 py-2 text-[13px] font-medium text-emerald-950 hover:bg-emerald-500 disabled:opacity-40"
                                >
                                    {busy ? "Checking…" : "Check DNS"}
                                </button>
                                <span className="text-[12px] text-slate-500">
                                    Propagation usually takes minutes. You can leave and come back.
                                </span>
                            </div>
                        </div>
                    )}

                    {msg && (
                        <p className={`mt-4 max-w-[64ch] text-[12.5px] leading-relaxed ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>
                            {msg.text}
                        </p>
                    )}
                </section>
        </div>
    );
}
