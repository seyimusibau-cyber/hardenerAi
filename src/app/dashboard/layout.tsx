"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
    LayoutDashboard,
    GitBranch,
    UploadCloud,
    Globe,
    CheckCircle2,
    Zap,
    Shield,
    LogOut
} from "lucide-react";

/**
 * The application shell.
 *
 * Two rules hold this together.
 *
 * FULL BLEED. The shell used to sit inside `mx-auto max-w-6xl`, which floated
 * the whole product in a 1152px box with dead gutters either side of it. A
 * document is centred; an application is not. The sidebar is pinned to the
 * viewport edge and the content column takes whatever is left.
 *
 * EMERALD IS EARNED. Everywhere else in Vultix, emerald means "proven by a
 * test" and nothing else (see FindingCard). Spending it on the selected nav
 * item costs the colour its meaning, so selection is carried by weight, a
 * lighter ground and a rail — the cheapest signals that still read instantly.
 */

const SCANS = [
    { href: "/dashboard/scan/github", label: "GitHub Repo", icon: GitBranch },
    { href: "/dashboard/scan/upload", label: "Upload File", icon: UploadCloud, soon: true },
    { href: "/dashboard/scan/website", label: "Website", icon: Globe },
];

const ACCOUNT = [
    { href: "/dashboard/domains", label: "Domains", icon: CheckCircle2 },
    { href: "/dashboard/plan", label: "Plan & Usage", icon: Zap },
];

function Item({
    href,
    label,
    icon: Icon,
    soon,
    active
}: {
    href: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    soon?: boolean;
    active: boolean;
}) {
    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center justify-between rounded-md py-2 pl-3.5 pr-2.5 text-[13px] transition-colors ${
                active
                    ? "bg-slate-850/70 font-medium text-white"
                    : "text-slate-400 hover:bg-slate-850/40 hover:text-slate-100"
            }`}
        >
            {/* The rail, not a border box. One element carries selection. */}
            <span
                className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-colors ${
                    active ? "bg-slate-300" : "bg-transparent"
                }`}
                aria-hidden
            />
            <span className="flex items-center gap-2.5">
                {Icon && (
                    <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                            active ? "text-slate-200" : "text-slate-600 group-hover:text-slate-400"
                        }`}
                    />
                )}
                <span>{label}</span>
            </span>
            {soon && (
                <span className="rounded border border-slate-750 bg-slate-850 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-slate-500">
                    soon
                </span>
            )}
        </Link>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-3.5 pb-1.5 pt-6 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-slate-600">
            {children}
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [isAdmin, setIsAdmin] = useState(false);
    const [plan, setPlan] = useState<string | null>(null);
    const [who, setWho] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const supabase = createClient();
        void (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !alive) return;
            // The plan badge used to be the literal string "PRO" for everybody.
            // A badge that does not read the row it claims to report is worse
            // than no badge, so it comes from the profile or it does not render.
            const { data } = await supabase
                .from("profiles").select("role, plan, email, full_name").eq("id", user.id).single();
            if (!alive || !data) return;
            if (data.role === "admin") setIsAdmin(true);
            setPlan((data.plan as string) ?? null);
            setWho((data.full_name as string) || (data.email as string) || null);
        })();
        return () => { alive = false; };
    }, []);

    const handleSignOut = async () => {
        await createClient().auth.signOut();
        router.push("/");
    };

    const navItems = [...SCANS, ...ACCOUNT];

    return (
        <div className="min-h-screen bg-ink-900 text-slate-200 selection:bg-emerald-500/30">
            <div className="flex min-h-screen">
                {/* Sidebar — pinned to the viewport edge, scrolls independently. */}
                <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-slate-800/70 bg-ink-800 md:flex">
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-5">
                        <Link href="/dashboard" className="group flex items-center gap-2.5 px-3.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/logo.png"
                                alt=""
                                className="h-6 w-6 rounded-md border border-slate-800 object-contain"
                            />
                            <span className="text-[15px] font-semibold tracking-tight text-white">
                                Vult<span className="text-emerald-500">ix</span>
                            </span>
                        </Link>

                        <nav className="mt-7 space-y-0.5">
                            <Item
                                href="/dashboard"
                                label="Overview"
                                icon={LayoutDashboard}
                                active={pathname === "/dashboard"}
                            />

                            <SectionLabel>Scan</SectionLabel>
                            {SCANS.map((s) => (
                                <Item key={s.href} {...s} active={pathname === s.href} />
                            ))}

                            <SectionLabel>Account</SectionLabel>
                            {ACCOUNT.map((s) => (
                                <Item key={s.href} {...s} active={pathname.startsWith(s.href)} />
                            ))}
                            {isAdmin && (
                                <Item href="/admin" label="Admin" icon={Shield} active={false} />
                            )}
                        </nav>
                    </div>

                    {/* Footer: who is signed in, on what plan, and the way out. */}
                    <div className="border-t border-slate-800/70 px-3 py-3">
                        <div className="flex items-center justify-between gap-2 px-3.5 pb-2">
                            <span className="min-w-0 truncate text-[12px] text-slate-400" title={who ?? undefined}>
                                {who ?? " "}
                            </span>
                            {plan && (
                                <span className="shrink-0 rounded border border-slate-750 bg-slate-850 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-slate-400">
                                    {plan}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md py-2 pl-3.5 pr-2.5 text-[12.5px] text-slate-500 transition-colors hover:bg-slate-850/50 hover:text-slate-300"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>Sign out</span>
                        </button>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    {/* Mobile nav. Same items, laid down as a scrolling strip. */}
                    <nav className="no-scrollbar sticky top-0 z-30 flex items-center gap-1.5 overflow-x-auto border-b border-slate-800/70 bg-ink-800/95 px-3 py-2.5 backdrop-blur-md md:hidden">
                        <Link
                            href="/dashboard"
                            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors ${
                                pathname === "/dashboard"
                                    ? "bg-slate-850 font-medium text-white"
                                    : "text-slate-400 hover:text-slate-100"
                            }`}
                        >
                            Overview
                        </Link>
                        {navItems.map((s) => (
                            <Link
                                key={s.href}
                                href={s.href}
                                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors ${
                                    pathname === s.href
                                        ? "bg-slate-850 font-medium text-white"
                                        : "text-slate-400 hover:text-slate-100"
                                }`}
                            >
                                {s.label}
                            </Link>
                        ))}
                    </nav>

                    <main className="min-w-0 flex-1">{children}</main>
                </div>
            </div>
        </div>
    );
}
