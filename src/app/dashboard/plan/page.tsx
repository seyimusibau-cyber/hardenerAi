"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

/**
 * Plan and usage.
 *
 * The limits here MUST match PLAN_LIMITS in src/app/api/scan/route.ts. They
 * disagreed for a long time — the route enforced 5 free scans while the
 * dashboard and the pricing page both promised 10 — which means a user hit a
 * wall the interface told them was still two scans away.
 */

interface Profile {
    email: string | null;
    plan: "Free" | "Pro" | "Enterprise";
    monthly_scans_used: number;
    quota_reset_date: string | null;
}

// Keep in step with api/scan/route.ts.
const PLAN_SCANS: Record<string, number> = { Free: 5, Pro: 100, Enterprise: 100000 };

export default function Plan() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from("profiles").select("email, plan, monthly_scans_used, quota_reset_date").eq("id", user.id).single();
            if (!alive) return;
            setProfile((data as Profile) ?? null);
            setLoading(false);
        })();
        return () => { alive = false; };
    }, []);

    if (loading) {
        return <div className="w-full max-w-3xl px-6 py-9 sm:px-9"><div className="h-5 w-40 animate-pulse rounded bg-slate-900" /></div>;
    }

    const plan = profile?.plan ?? "Free";
    const used = profile?.monthly_scans_used ?? 0;
    const limit = PLAN_SCANS[plan];
    const unlimited = limit >= 100000;
    const pct = unlimited ? 0 : Math.min(100, (used / limit) * 100);

    return (
        <div className="w-full max-w-3xl px-6 py-9 sm:px-9">
            <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-white">Plan &amp; usage</h1>
            <p className="mt-1.5 text-[13.5px] text-slate-400">{profile?.email}</p>

            <section className="mt-8 max-w-2xl">
                <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[17px] font-semibold text-white">{plan}</span>
                    <span className="font-mono text-[12px] tabular-nums text-slate-400">
                        {used} / {unlimited ? "∞" : limit} scans
                    </span>
                </div>

                {!unlimited && (
                    <div className="mt-3 h-1 w-full bg-slate-800">
                        <div
                            className={`h-1 ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                )}

                <p className="mt-3 text-[12.5px] text-slate-500">
                    {unlimited
                        ? "Unlimited scans on this plan."
                        : used >= limit
                        ? "You have used every scan on this plan this month."
                        : `${limit - used} scan${limit - used === 1 ? "" : "s"} left this month.`}
                    {profile?.quota_reset_date && ` Resets ${new Date(profile.quota_reset_date).toLocaleDateString()}.`}
                </p>

                {plan === "Free" && (
                    <Link href="/pricing"
                        className="mt-6 inline-block rounded bg-emerald-600 px-4 py-2 text-[13px] font-medium text-emerald-950 hover:bg-emerald-500">
                        See plans
                    </Link>
                )}
            </section>

            <section className="mt-12 max-w-[62ch] border-t border-slate-800 pt-5">
                <h2 className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-slate-500">What a scan costs</h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
                    Re-scanning something Vultix has already seen is close to free — verdicts are
                    cached against the code itself, so only what changed is re-examined. Scanning
                    something new costs the most the first time and less thereafter.
                </p>
            </section>
        </div>
    );
}
