"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function PricingPage() {
    const [showAlert, setShowAlert] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState("");

    const handleUpgradeClick = (planName: string) => {
        setSelectedPlan(planName);
        setShowAlert(true);
    };

    return (
        <div className="min-h-screen bg-[#01040f] text-slate-100 font-sans pb-16 selection:bg-emerald-500/30">
            {/* Nav */}
            <nav className="fixed top-0 w-full z-50 bg-[#020617] border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <Link href="/" className="flex items-center gap-2">
                            <img
                                src="/logo.png"
                                alt="HardenerPlus Logo"
                                className="w-6 h-6 rounded-md object-contain border border-slate-800"
                            />
                            <span className="text-lg font-bold tracking-tight text-white">
                                Hardener<span className="text-emerald-500">Plus</span>
                            </span>
                        </Link>

                        <div className="flex items-center gap-6 text-sm">
                            <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
                                Dashboard
                            </Link>
                            <Link href="/docs" className="text-slate-400 hover:text-white transition-colors">
                                Docs
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Content */}
            <main className="pt-32 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-widest">
                        Subscription Plans
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                        Flexible Pricing for Secure Architectures
                    </h1>
                    <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
                        Scale your security scanning capabilities from single projects to enterprise infrastructures.
                    </p>
                </div>

                {/* Coming Soon Alert Modal */}
                {showAlert && (
                    <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/30 shadow-2xl flex flex-col md:flex-row gap-4 items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex gap-3 items-center">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            </div>
                            <div className="text-left space-y-0.5">
                                <p className="font-bold text-white text-sm">Stripe Payments Coming Soon</p>
                                <p className="text-xs text-slate-400">
                                    The payment gateway for **{selectedPlan}** is currently in sandboxed test mode for the hackathon. Upgrade options will lock in shortly!
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowAlert(false)}
                            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer"
                        >
                            Got It
                        </button>
                    </div>
                )}

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
                    {/* Free */}
                    <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between relative overflow-hidden">
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Free Plan</h3>
                                <div className="mt-4 flex items-baseline text-white">
                                    <span className="text-4xl font-extrabold tracking-tight">$0</span>
                                    <span className="ml-1 text-xs text-slate-500">/ month</span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Perfect for developers starting out with basic header audits and site inspections.
                            </p>
                            <ul className="space-y-3 text-xs text-slate-450 border-t border-slate-800/80 pt-6">
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    10 security scans / month
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    Surface-level headers audit
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    Copy remediation templates
                                </li>
                            </ul>
                        </div>
                        <button
                            disabled
                            className="mt-8 w-full py-3 bg-slate-950 text-slate-500 border border-slate-800 rounded-xl text-xs font-bold text-center"
                        >
                            Active Plan
                        </button>
                    </div>

                    {/* Pro */}
                    <div className="p-8 rounded-3xl bg-slate-900 border border-emerald-500/20 flex flex-col justify-between relative overflow-hidden shadow-xl shadow-emerald-500/[0.01]">
                        <div className="absolute top-0 right-0 bg-emerald-500/10 border-b border-l border-emerald-500/20 text-emerald-400 px-4 py-1.5 rounded-bl-xl text-[9px] font-black uppercase tracking-widest font-mono">Popular</div>
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-500 font-mono">Pro Plan</h3>
                                <div className="mt-4 flex items-baseline text-white">
                                    <span className="text-4xl font-extrabold tracking-tight">$49</span>
                                    <span className="ml-1 text-xs text-slate-500">/ month</span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Built for scale. Features SSL diagnostics, active file probes, and expanded monthly quotas.
                            </p>
                            <ul className="space-y-3 text-xs text-slate-450 border-t border-slate-800/80 pt-6">
                                <li className="flex items-center gap-2.5 font-semibold text-slate-350">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    100 security scans / month
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    Detailed SSL/TLS diagnostics
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    SSRF protection audits
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    Advanced active file probing
                                </li>
                            </ul>
                        </div>
                        <button
                            onClick={() => handleUpgradeClick("Pro Plan")}
                            className="mt-8 w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all text-center cursor-pointer shadow-lg shadow-emerald-500/10 animate-pulse"
                        >
                            Upgrade to Pro
                        </button>
                    </div>

                    {/* Enterprise */}
                    <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between relative overflow-hidden">
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Enterprise Plan</h3>
                                <div className="mt-4 flex items-baseline text-white">
                                    <span className="text-4xl font-extrabold tracking-tight">$999</span>
                                    <span className="ml-1 text-xs text-slate-500">/ month</span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Complete security orchestrator. Supports custom scan configurations, webhook alerts, and multi-domains mapping.
                            </p>
                            <ul className="space-y-3 text-xs text-slate-450 border-t border-slate-800/80 pt-6">
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    Unlimited security scans
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    Custom scans and schedules
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    Slack/Discord alerts integration
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                    Priority dedicated worker threads
                                </li>
                            </ul>
                        </div>
                        <button
                            onClick={() => handleUpgradeClick("Enterprise Plan")}
                            className="mt-8 w-full py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                        >
                            Select Enterprise
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
