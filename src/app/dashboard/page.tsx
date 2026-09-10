"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { TargetList, type TargetRow } from "@/components/vultix/TargetList";
import { GitBranch, Globe, ArrowRight, Search, ShieldAlert, FileCode2, PlayCircle, BadgeCheck } from "lucide-react";

/**
 * The overview.
 *
 * The page answers one question — WHAT SHOULD I DO NEXT? — and ranks everything
 * by how close it sits to that answer.
 *
 * MOBILE IS THE CONSTRAINT, NOT AN AFTERTHOUGHT. The previous version pushed
 * past the viewport on a phone because the two header buttons sat in a
 * `shrink-0` container needing ~325px on a 360px screen. Nothing here may be
 * both fixed-width and unshrinkable: every horizontal run either wraps, has
 * `min-w-0`, or truncates. `overflow-x-hidden` on the shell is the backstop,
 * not the fix.
 *
 * Each module is a CARD so that prose is contained rather than running loose
 * down the page, and so the stack on a phone has visible boundaries. Cards
 * differ by the shape of what is inside them — a stepped ladder, a timeline, a
 * stacked bar, a chip grid — because repeating one shape is what made an
 * earlier version read as amateur.
 */

interface Profile {
    email: string | null;
    full_name: string | null;
    plan: "Free" | "Pro" | "Enterprise";
    monthly_scans_used: number;
    quota_reset_date: string | null;
}

interface Domain {
    id: string;
    domain: string;
    status: "pending" | "verified" | "failed";
}

interface ScanRow {
    id: string;
    target_id: string | null;
    status: string;
    stage: string | null;
    score: number | null;
    grade: string | null;
    findings_assessed: number | null;
    created_at: string;
    error_message: string | null;
}

interface FindingLite {
    severity: string | null;
    rule_id: string | null;
    is_vulnerability: boolean;
    patch_applies: boolean;
    patch_validated: boolean;
    unified_diff: string | null;
    estimated_patch_hours: number | null;
    scans: { target_id: string | null };
}

const PLAN_SCANS: Record<string, number> = { Free: 5, Pro: 100, Enterprise: 100000 };

/** The five rungs a finding can climb. Mirrors `rung()` in FindingCard. */
const LADDER = [
    { key: "candidate", label: "Candidate",  icon: Search },
    { key: "confirmed", label: "Confirmed",  icon: ShieldAlert },
    { key: "written",   label: "Patched",    icon: FileCode2 },
    { key: "applies",   label: "Applies",    icon: PlayCircle },
    { key: "proven",    label: "Proven",     icon: BadgeCheck },
] as const;

function ago(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 2) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** A module. One padded, bordered box; the header is optional. */
function Card({
    title, aside, children, className = "",
}: {
    title?: string;
    aside?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={`min-w-0 rounded-lg border border-slate-800/70 bg-ink-800 p-4 sm:p-5 ${className}`}>
            {title && (
                <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-slate-800/70 pb-2.5">
                    <h2 className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {title}
                    </h2>
                    {aside && <span className="shrink-0 font-mono text-[11px] text-slate-600">{aside}</span>}
                </div>
            )}
            {children}
        </section>
    );
}

export default function DashboardHome() {
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [targets, setTargets] = useState<TargetRow[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [scans, setScans] = useState<ScanRow[]>([]);
    const [findings, setFindings] = useState<FindingLite[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push("/login");
                return;
            }

            const [{ data: p }, { data: t }, { data: d }, { data: f }, { data: s }] = await Promise.all([
                supabase.from("profiles").select("email, full_name, plan, monthly_scans_used, quota_reset_date").eq("id", user.id).single(),
                supabase.from("targets").select("id, target_url, mode, last_scanned_at")
                    .eq("user_id", user.id).order("last_scanned_at", { ascending: false, nullsFirst: false }).limit(10),
                supabase.from("domain_verifications").select("id, domain, status").eq("user_id", user.id),
                supabase.from("findings")
                    .select("severity, rule_id, is_vulnerability, patch_applies, patch_validated, unified_diff, estimated_patch_hours, scans!inner(target_id)"),
                supabase.from("scans").select("id, target_id, status, stage, score, grade, findings_assessed, created_at, error_message")
                    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
            ]);
            if (!alive) return;

            setProfile((p as Profile) ?? null);
            setDomains((d as Domain[]) ?? []);
            setScans((s as ScanRow[]) ?? []);

            const rows = (f ?? []) as unknown as FindingLite[];
            setFindings(rows);

            const byTarget = new Map<string, { proven: number; unproven: number }>();
            for (const row of rows) {
                if (!row.is_vulnerability) continue;
                const id = row.scans?.target_id;
                if (!id) continue;
                const acc = byTarget.get(id) ?? { proven: 0, unproven: 0 };
                if (row.patch_validated) acc.proven++; else acc.unproven++;
                byTarget.set(id, acc);
            }

            const running = new Set(
                ((s as ScanRow[]) ?? [])
                    .filter((x) => x.status !== "Completed" && x.status !== "Failed")
                    .map((x) => x.target_id)
                    .filter(Boolean) as string[],
            );

            setTargets((((t as TargetRow[]) ?? []) as TargetRow[]).map((x) => {
                const c = byTarget.get(x.id);
                return {
                    ...x,
                    proven: c?.proven ?? 0,
                    unproven: x.mode === "git" ? c?.unproven ?? 0 : 0,
                    exposures: x.mode === "web" ? c?.unproven ?? 0 : 0,
                    scanning: running.has(x.id),
                };
            }));
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [router]);

    if (loading) {
        return (
            <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8 sm:py-9">
                <div className="h-6 w-48 max-w-full animate-pulse rounded bg-slate-850" />
                <div className="mt-8 h-24 animate-pulse rounded-lg bg-slate-850/60" />
                <div className="mt-6 h-52 animate-pulse rounded-lg bg-slate-850/40" />
            </div>
        );
    }

    const real = findings.filter((f) => f.is_vulnerability);
    const proven = real.filter((f) => f.patch_validated).length;
    const unproven = real.length - proven;
    const dismissed = findings.length - real.length;

    // Each rung counts findings that reached AT LEAST that far, so the shape
    // narrows and the drop-off is the story.
    const reached: Record<string, number> = {
        candidate: findings.length,
        confirmed: real.length,
        written: real.filter((f) => f.unified_diff).length,
        applies: real.filter((f) => f.patch_applies).length,
        proven,
    };

    const sev = {
        error: real.filter((f) => (f.severity || "").toLowerCase() === "error").length,
        warning: real.filter((f) => (f.severity || "").toLowerCase() === "warning").length,
        note: real.filter((f) => !["error", "warning"].includes((f.severity || "note").toLowerCase())).length,
    };
    const sevTotal = sev.error + sev.warning + sev.note;

    const hoursSaved = real
        .filter((f) => f.patch_validated)
        .reduce((n, f) => n + (f.estimated_patch_hours ?? 0), 0);

    const ruleCounts = new Map<string, number>();
    for (const f of real) {
        const r = (f.rule_id || "").split(".").pop() || f.rule_id;
        if (r) ruleCounts.set(r, (ruleCounts.get(r) ?? 0) + 1);
    }
    const topRules = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const used = profile?.monthly_scans_used ?? 0;
    const planName = profile?.plan ?? "Free";
    const limit = PLAN_SCANS[planName] ?? 5;
    const unlimited = limit >= 100000;
    const verified = domains.filter((d) => d.status === "verified").length;
    const pending = domains.filter((d) => d.status === "pending").length;
    const first = (profile?.full_name || profile?.email || "").split(/[\s@]/)[0];
    const quotaPct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
    const failed = scans.find((s) => s.status === "Failed");
    const scanning = targets.some((t) => t.scanning);
    const targetName = (id: string | null) => {
        const t = targets.find((x) => x.id === id);
        if (!t) return "a target";
        return t.target_url.replace(/^https?:\/\//, "").replace(/\.git$/, "").split("/").slice(-1)[0];
    };

    return (
        <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8 sm:py-9">
            {/* ---- The verdict. The only uncarded block: it is the lead. ---- */}
            <header>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">
                    {first ? `Welcome back, ${first}` : "Welcome back"}
                </p>
                <h1 className="mt-2.5 max-w-[46ch] text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-white sm:text-[26px]">
                    {scanning ? (
                        <>A scan is running.</>
                    ) : proven > 0 ? (
                        <>
                            <span className="text-emerald-400">
                                {proven === 1 ? "One fix is" : `${proven} fixes are`} proven
                            </span>{" "}
                            and ready to open as pull requests.
                        </>
                    ) : unproven > 0 ? (
                        <>
                            <span className="text-amber-400">
                                {unproven} {unproven === 1 ? "issue needs" : "issues need"} review
                            </span>
                            . None proven by a test yet.
                        </>
                    ) : targets.length === 0 ? (
                        <>Nothing is being watched yet.</>
                    ) : (
                        <>Everything you are watching is clean.</>
                    )}
                </h1>

                {/* Buttons stack and go full width on a phone. The old version
                    put them in a `shrink-0` row needing ~325px on a 360px
                    screen, which is what pushed the page sideways. */}
                <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                    <Link
                        href="/dashboard/scan/github"
                        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-slate-100 px-3.5 py-2.5 text-[13px] font-medium text-slate-950 transition-colors hover:bg-white sm:py-2"
                    >
                        <GitBranch className="h-3.5 w-3.5 shrink-0" />
                        Scan a repository
                    </Link>
                    <Link
                        href="/dashboard/scan/website"
                        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-800 px-3.5 py-2.5 text-[13px] text-slate-300 transition-colors hover:border-slate-700 hover:text-white sm:py-2"
                    >
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        Scan a website
                    </Link>
                </div>
            </header>

            {failed?.error_message && (
                <p className="mt-6 overflow-hidden rounded-r border-l-2 border-rose-500/70 bg-rose-500/5 py-2.5 pl-3.5 pr-3 text-[12.5px] leading-relaxed break-words text-rose-300/90">
                    Last scan failed: {failed.error_message.slice(0, 160)}
                </p>
            )}

            {/* ---- The numbers ------------------------------------------- */}
            <section className="mt-7 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-800/70 bg-ink-800 sm:grid-cols-4">
                <Stat label="Proven" value={proven} tone={proven > 0 ? "emerald" : "muted"} note="by a test" />
                <Stat label="Review" value={unproven} tone={unproven > 0 ? "amber" : "muted"} note="unproven" />
                <Stat label="Domains" value={verified} tone="plain" note={pending > 0 ? `${pending} pending` : "verified"} href="/dashboard/domains" />
                <Stat
                    label="Scans" value={used} suffix={unlimited ? undefined : `/ ${limit}`}
                    tone="plain" note={`${planName} plan`} href="/dashboard/plan"
                    meter={unlimited ? undefined : quotaPct}
                />
            </section>

            {/* ---- Ladder + activity -------------------------------------- */}
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
                <Card title="How far findings climbed" aside={String(findings.length)} className="lg:col-span-2">
                    <div className="space-y-2.5">
                        {LADDER.map((step) => {
                            const n = reached[step.key] ?? 0;
                            const pct = findings.length ? (n / findings.length) * 100 : 0;
                            const isProven = step.key === "proven";
                            return (
                                <div key={step.key} className="flex items-center gap-2.5 sm:gap-3.5">
                                    <step.icon className={`h-3.5 w-3.5 shrink-0 ${isProven && n > 0 ? "text-emerald-500" : "text-slate-600"}`} />
                                    <span className="w-[68px] shrink-0 truncate text-[12.5px] text-slate-300 sm:w-[92px]">
                                        {step.label}
                                    </span>
                                    <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-sm bg-slate-850/60">
                                        <div
                                            className={`h-full rounded-sm transition-all ${isProven ? "bg-emerald-600/80" : "bg-slate-700"}`}
                                            style={{ width: `${Math.max(pct, n > 0 ? 3 : 0)}%` }}
                                        />
                                    </div>
                                    <span className={`tnum w-6 shrink-0 text-right font-mono text-[12px] ${isProven && n > 0 ? "text-emerald-400" : "text-slate-400"}`}>
                                        {n}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {findings.length === 0 && (
                        <p className="mt-4 text-[12.5px] leading-relaxed text-slate-600">
                            Every finding earns each rung. The gap between{" "}
                            <span className="text-slate-400">confirmed</span> and{" "}
                            <span className="text-slate-400">proven</span> is the part Vultix does.
                        </p>
                    )}
                </Card>

                <Card title="Activity" aside={scans.length > 0 ? String(scans.length) : undefined}>
                    {scans.length === 0 ? (
                        <p className="text-[12.5px] leading-relaxed text-slate-600">
                            Nothing has run yet.
                        </p>
                    ) : (
                        <ol>
                            {scans.map((s, i) => {
                                const done = s.status === "Completed";
                                const bad = s.status === "Failed";
                                return (
                                    <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                                        {i < scans.length - 1 && (
                                            <span className="absolute left-[3px] top-3 h-full w-px bg-slate-800" aria-hidden />
                                        )}
                                        <span
                                            className={`relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ${
                                                bad ? "bg-rose-500" : done ? "bg-slate-600" : "animate-pulse bg-amber-500"
                                            }`}
                                            aria-hidden
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[12.5px] text-slate-300">{targetName(s.target_id)}</p>
                                            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-600">
                                                {bad ? "failed" : done ? `${s.findings_assessed ?? 0} verified` : (s.stage || s.status).toLowerCase()}
                                                {" · "}{ago(s.created_at)}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </Card>
            </div>

            {/* ---- The targets ------------------------------------------- */}
            <div className="mt-5">
                <Card
                    title="Watching"
                    aside={targets.length > 0 ? String(targets.length) : undefined}
                >
                    <TargetList targets={targets} />
                </Card>
            </div>

            {targets.length === 0 && (
                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <StartCard
                        href="/dashboard/scan/github"
                        icon={<GitBranch className="h-4 w-4 shrink-0 text-slate-400" />}
                        title="Scan a repository"
                        body="Finds leaked secrets, vulnerable dependencies and code flaws, then writes a fix and tests it."
                        cta="Choose a repository"
                    />
                    <StartCard
                        href="/dashboard/domains"
                        icon={<Globe className="h-4 w-4 shrink-0 text-slate-400" />}
                        title="Verify a domain"
                        body="A site must be proven yours with a DNS record before Vultix will scan it. Verify once, scan any time."
                        cta={verified > 0 ? "Manage domains" : "Add a domain"}
                    />
                </div>
            )}

            {/* ---- Reference --------------------------------------------- */}
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
                <Card title="Severity">
                    {sevTotal === 0 ? (
                        <p className="text-[12.5px] text-slate-600">Nothing confirmed to rank.</p>
                    ) : (
                        <>
                            <div className="flex h-2 overflow-hidden rounded-full bg-slate-850">
                                {sev.error > 0 && <div className="bg-rose-500" style={{ width: `${(sev.error / sevTotal) * 100}%` }} />}
                                {sev.warning > 0 && <div className="bg-amber-500" style={{ width: `${(sev.warning / sevTotal) * 100}%` }} />}
                                {sev.note > 0 && <div className="bg-slate-600" style={{ width: `${(sev.note / sevTotal) * 100}%` }} />}
                            </div>
                            <dl className="mt-3.5 space-y-2">
                                <SevRow colour="bg-rose-500" label="High" n={sev.error} />
                                <SevRow colour="bg-amber-500" label="Medium" n={sev.warning} />
                                <SevRow colour="bg-slate-600" label="Low" n={sev.note} />
                            </dl>
                        </>
                    )}
                </Card>

                <Card title="Most frequent">
                    {topRules.length === 0 ? (
                        <p className="text-[12.5px] leading-relaxed text-slate-600">
                            The rules that fire most often appear here — usually one mistake repeated.
                        </p>
                    ) : (
                        <ul>
                            {topRules.map(([rule, n]) => (
                                <li key={rule} className="flex items-baseline justify-between gap-3 border-b border-slate-800/60 py-2 first:pt-0 last:border-b-0 last:pb-0">
                                    <span className="min-w-0 truncate font-mono text-[11.5px] text-slate-400">{rule}</span>
                                    <span className="tnum shrink-0 font-mono text-[11.5px] text-slate-500">{n}&times;</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card title="Coverage">
                    <div className="flex flex-wrap gap-1.5">
                        {["Semgrep", "Gitleaks", "osv-scanner", "nuclei"].map((name) => (
                            <span
                                key={name}
                                className="rounded border border-slate-800 bg-slate-850/60 px-2 py-1 font-mono text-[10.5px] text-slate-400"
                            >
                                {name}
                            </span>
                        ))}
                    </div>
                    <p className="mt-3.5 text-[12px] leading-relaxed text-slate-600">
                        An AI reviewer then discards what it cannot justify.
                        {hoursSaved > 0 && (
                            <span className="text-slate-400">
                                {" "}Proven fixes so far are about {hoursSaved.toFixed(hoursSaved < 10 ? 1 : 0)} hours of work.
                            </span>
                        )}
                    </p>
                </Card>
            </div>
        </div>
    );
}

function SevRow({ colour, label, n }: { colour: string; label: string; n: number }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <dt className="flex min-w-0 items-center gap-2 truncate text-[12.5px] text-slate-400">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${n > 0 ? colour : "bg-slate-800"}`} aria-hidden />
                {label}
            </dt>
            <dd className={`tnum shrink-0 font-mono text-[12px] ${n > 0 ? "text-slate-300" : "text-slate-700"}`}>{n}</dd>
        </div>
    );
}

/**
 * One figure in the strip. Deliberately NOT its own card — the panel around
 * the whole strip is the object and these are its columns, which is why the
 * dividers are borders on the cells rather than a ring on each.
 */
function Stat({
    label, value, suffix, note, tone, href, meter,
}: {
    label: string;
    value: number;
    suffix?: string;
    note: string;
    tone: "emerald" | "amber" | "plain" | "muted";
    href?: string;
    meter?: number;
}) {
    const colour =
        tone === "emerald" ? "text-emerald-400"
        : tone === "amber" ? "text-amber-400"
        : tone === "muted" ? "text-slate-600"
        : "text-white";

    const body = (
        <>
            <div className="flex items-baseline justify-between gap-1.5">
                <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-slate-500">
                    {label}
                </span>
                {href && <ArrowRight className="h-3 w-3 shrink-0 text-slate-700 transition-colors group-hover:text-slate-400" />}
            </div>
            <div className={`tnum mt-2 truncate text-[22px] font-semibold leading-none tracking-[-0.02em] sm:text-[24px] ${colour}`}>
                {value}
                {suffix && <span className="ml-1 text-[12px] font-normal text-slate-600">{suffix}</span>}
            </div>
            <div className="mt-1.5 truncate text-[11.5px] text-slate-500">{note}</div>
            {meter !== undefined && (
                <div className="mt-2.5 h-0.5 w-full overflow-hidden rounded-full bg-slate-850">
                    <div
                        className={`h-full rounded-full ${meter >= 80 ? "bg-amber-500" : "bg-slate-500"}`}
                        style={{ width: `${Math.max(meter, 2)}%` }}
                    />
                </div>
            )}
        </>
    );

    // Borders on the cell, so a 2-up phone grid and a 4-up desktop row both
    // divide cleanly without a stray edge on the outside.
    const cls =
        "group block min-w-0 border-b border-slate-800/70 p-3.5 sm:border-b-0 sm:border-r sm:p-4 " +
        "[&:nth-child(even)]:border-l [&:nth-child(even)]:border-l-slate-800/70 " +
        "sm:[&:nth-child(even)]:border-l-0 sm:last:border-r-0 [&:nth-last-child(-n+2)]:border-b-0";

    return href ? (
        <Link href={href} className={`${cls} transition-colors hover:bg-slate-850/40`}>{body}</Link>
    ) : (
        <div className={cls}>{body}</div>
    );
}

function StartCard({
    href, icon, title, body, cta,
}: {
    href: string;
    icon: React.ReactNode;
    title: string;
    body: string;
    cta: string;
}) {
    return (
        <Link
            href={href}
            className="group min-w-0 rounded-lg border border-slate-800/70 bg-ink-800 p-4 transition-colors hover:border-slate-700 hover:bg-ink-700 sm:p-5"
        >
            <div className="flex items-center gap-2.5">
                {icon}
                <span className="min-w-0 truncate text-[13.5px] font-medium text-slate-100">{title}</span>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-slate-500">{body}</p>
            <span className="mt-3.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400 transition-colors group-hover:text-white">
                {cta}
                <ArrowRight className="h-3 w-3 shrink-0" />
            </span>
        </Link>
    );
}
