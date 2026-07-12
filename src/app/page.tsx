"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

interface ScanCheck {
    name: string;
    status: 'Passed' | 'Failed';
    value: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    remediation: string;
}

interface ScanResult {
    url: string;
    score: number;
    grade: string;
    server: string;
    poweredBy: string;
    checks: ScanCheck[];
    scannedAt: string;
}

function CheckCard({ check, isLocked }: { check: ScanCheck; isLocked: boolean }) {
    const [isOpen, setIsOpen] = useState(check.status === 'Failed' && !isLocked);

    return (
        <div className={`border rounded-xl transition-all ${
            check.status === 'Passed'
                ? 'bg-slate-900/45 border-slate-800/60'
                : 'bg-red-500/[0.02] border-red-500/15'
        }`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 font-sans text-left focus:outline-none rounded-xl"
            >
                <div className="flex items-center gap-3 min-w-0">
                    {check.status === 'Passed' ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </div>
                    )}
                    <div className="truncate flex-grow">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{check.name}</span>
                            {check.status === 'Failed' && (
                                <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                                    check.severity === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                    check.severity === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                    'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                    {check.severity}
                                </span>
                            )}
                            {isLocked && (
                                <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    Locked
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-[200px] sm:max-w-md">{check.value}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-slate-500 shrink-0 ml-2">
                    <span className="text-xs hover:text-slate-300 font-medium hidden sm:inline">
                        {isLocked ? "Unlock Fix" : isOpen ? "Hide Fix" : "Show Fix"}
                    </span>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
            </button>

            {isOpen && (
                <div className="px-4 pb-5 border-t border-slate-800/40 pt-4 text-sm text-slate-400 leading-relaxed font-sans animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="text-xs text-slate-450 mb-3">{check.description}</p>
                    
                    {isLocked ? (
                        <div className="mt-4 p-6 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center relative overflow-hidden">
                            <div className="absolute inset-0 opacity-[0.03] filter blur-[2px] select-none pointer-events-none font-mono text-[7px] text-left p-4 leading-normal">
                                {`// production config patches\nconst securityHeaders = {\n  ContentSecurityPolicy: "default-src 'self'",\n  StrictTransportSecurity: "max-age=63072000; preload",\n  XFrameOptions: "DENY",\n  XContentTypeOptions: "nosniff"\n};`}
                            </div>
                            <div className="relative z-10 space-y-3 max-w-sm">
                                <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                </div>
                                <h4 className="font-bold text-white text-sm font-mono">Remediation Patch Locked</h4>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Free account registration is required to unlock full config templates and automated patch tools.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                                    <Link href="/signup" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-500/10">
                                        Create Free Account
                                    </Link>
                                    <Link href="/login" className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-xs font-bold transition-all">
                                        Sign In
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 relative group">
                            <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(check.remediation);
                                        alert("Remediation code copied to clipboard!");
                                    }}
                                    className="p-1.5 bg-slate-900 border border-slate-800 text-slate-450 hover:text-white rounded"
                                    title="Copy snippet"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                </button>
                            </div>
                            <div className="text-[10px] text-slate-650 uppercase tracking-wider mb-2 font-bold select-none">Remediation Snippet</div>
                            <pre className="overflow-x-auto select-all whitespace-pre-wrap">{check.remediation}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function Home() {
    const router = useRouter();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [url, setUrl] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStatus, setScanStatus] = useState("");
    const [scanError, setScanError] = useState<string | null>(null);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const checkSession = async () => {
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    setIsLoggedIn(true);
                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("role")
                        .eq("id", user.id)
                        .single();
                    
                    const adminUser = profile?.role === "admin";
                    setIsAdmin(adminUser);

                    if (adminUser) {
                        router.push("/admin");
                    }
                } else {
                    setIsLoggedIn(false);
                    setIsAdmin(false);
                }
            } catch {
                setIsLoggedIn(false);
                setIsAdmin(false);
            }
        };
        checkSession();
    }, [router]);

    const handleSignOut = async () => {
        try {
            const supabase = createClient();
            await supabase.auth.signOut();
            setIsLoggedIn(false);
            setIsAdmin(false);
            window.location.reload();
        } catch {
            // ignore
        }
    };

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = url.trim();
        if (!trimmed) return;

        setIsScanning(true);
        setScanProgress(5);
        setScanStatus("Resolving hostname...");
        setScanError(null);
        setScanResult(null);

        const progressInterval = setInterval(() => {
            setScanProgress((prev) => {
                if (prev >= 85) return prev;
                return prev + Math.floor(Math.random() * 8) + 2;
            });
        }, 300);

        const statuses = [
            "Resolving hostname and verification checks...",
            "Applying SSRF protection filters...",
            "Initiating secure handshake...",
            "Reading response headers...",
            "Analyzing Content-Security-Policy rules...",
            "Evaluating TLS & Strict-Transport-Security...",
            "Checking clickjacking guards...",
            "Compiling safety score..."
        ];

        let statusIndex = 0;
        const statusInterval = setInterval(() => {
            if (statusIndex < statuses.length - 1) {
                statusIndex++;
                setScanStatus(statuses[statusIndex]);
            }
        }, 700);

        try {
            const res = await fetch(`/api/scan?url=${encodeURIComponent(trimmed)}`);
            const data = await res.json();

            clearInterval(progressInterval);
            clearInterval(statusInterval);

            if (!res.ok) {
                throw new Error(data.error || "An unexpected error occurred during the security scan.");
            }

            setScanProgress(100);

            // Log successfully completed scan to database & increment credit quota
            if (isLoggedIn) {
                try {
                    const supabase = createClient();
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        const failedCount = data.checks.filter((c: ScanCheck) => c.status === "Failed").length;
                        
                        // 1. Get current profile stats to increment scans credit
                        const { data: profileData } = await supabase
                            .from("profiles")
                            .select("monthly_scans_used")
                            .eq("id", user.id)
                            .single();
                            
                        // 2. Insert scan record
                        await supabase.from("scans").insert({
                            user_id: user.id,
                            target_url: trimmed,
                            status: "Completed",
                            progress: 100,
                            vulns_found: failedCount,
                            time_taken: "2.5s",
                            score: data.score,
                            grade: data.grade
                        });

                        // 3. Update scans used count
                        const newScansUsed = (profileData?.monthly_scans_used || 0) + 1;
                        await supabase
                            .from("profiles")
                            .update({ monthly_scans_used: newScansUsed })
                            .eq("id", user.id);
                    }
                } catch {
                    // silent database log failure
                }
            }

            setTimeout(() => {
                setScanResult(data);
                setIsScanning(false);
                setTimeout(() => {
                    const target = document.getElementById("scan-report-results");
                    if (target) {
                        target.scrollIntoView({ behavior: "smooth" });
                    }
                }, 100);
            }, 500);

        } catch (err) {
            clearInterval(progressInterval);
            clearInterval(statusInterval);
            const msg = err instanceof Error ? err.message : "Failed to establish connection to target server.";
            setScanError(msg);
            setIsScanning(false);

            // Log failed scan to database
            if (isLoggedIn) {
                try {
                    const supabase = createClient();
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        await supabase.from("scans").insert({
                            user_id: user.id,
                            target_url: trimmed,
                            status: "Failed",
                            progress: 100,
                            vulns_found: 0,
                            error_message: msg
                        });
                    }
                } catch {
                    // silent database log failure
                }
            }
        }
    };

    return (
        <>
            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 bg-[#020617] border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <Link href="/" className="flex items-center gap-2">
                            <img
                                src="/logo.png"
                                alt="HardenerPlus Logo"
                                className="w-8 h-8 rounded-lg object-contain border border-slate-800"
                            />
                            <span className="text-xl font-bold tracking-tight text-white">
                                Hardener<span className="text-emerald-500">Plus</span>
                            </span>
                        </Link>

                        <div className="hidden md:flex items-center gap-8 text-sm font-medium">
                            <a href="#how" className="text-slate-400 hover:text-white transition-colors">
                                How it Works
                            </a>
                            <a href="#pricing" className="text-slate-400 hover:text-white transition-colors">
                                Pricing
                            </a>
                            <a href="#security" className="text-slate-400 hover:text-white transition-colors">
                                Safety Standard
                            </a>
                            {isLoggedIn ? (
                                <>
                                    {isAdmin ? (
                                        <a href="/admin" className="text-slate-400 font-bold hover:text-white transition-colors">
                                            Admin Dashboard
                                        </a>
                                    ) : (
                                        <a href="/dashboard" className="text-slate-400 font-bold hover:text-white transition-colors">
                                            My Dashboard
                                        </a>
                                    )}
                                    <button
                                        onClick={handleSignOut}
                                        className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-350 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer"
                                    >
                                        Sign Out
                                    </button>
                                </>
                            ) : (
                                <>
                                    <a href="/login" className="text-slate-400 font-bold hover:text-white transition-colors">
                                        Log In
                                    </a>
                                    <a href="/signup" className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg font-semibold transition-all">
                                        Get Started
                                    </a>
                                </>
                            )}
                        </div>

                        <button className="md:hidden text-slate-400" id="menu-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lucide lucide-menu"
                                id="menu-icon"
                            >
                                <line x1="4" x2="20" y1="12" y2="12" />
                                <line x1="4" x2="20" y1="6" y2="6" />
                                <line x1="4" x2="20" y1="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
                {/* Mobile Menu */}
                <div className={`${isMenuOpen ? "block" : "hidden"} md:hidden bg-slate-950 border-b border-slate-800 px-4 py-4 space-y-4`} id="mobile-menu">
                    <a href="#how" className="block text-slate-400 hover:text-white transition-colors">
                        How it Works
                    </a>
                    {isLoggedIn ? (
                        <>
                            {isAdmin ? (
                                <a href="/admin" className="block text-slate-400 font-bold hover:text-white transition-colors">
                                    Admin Dashboard
                                </a>
                            ) : (
                                <a href="/dashboard" className="block text-slate-400 font-bold hover:text-white transition-colors">
                                    My Dashboard
                                </a>
                            )}
                            <button
                                onClick={handleSignOut}
                                className="w-full bg-slate-900 text-center block text-slate-300 py-2 rounded-lg font-semibold border border-slate-800 cursor-pointer"
                            >
                                Sign Out
                            </button>
                        </>
                    ) : (
                        <>
                            <a href="/login" className="block text-slate-400 font-bold hover:text-white transition-colors">
                                Log In
                            </a>
                            <a href="/signup" className="w-full bg-emerald-600 text-center block text-white py-2 rounded-lg font-semibold">
                                Get Started
                            </a>
                        </>
                    )}
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-16 px-4">
                <div className="max-w-4xl mx-auto text-center space-y-6">
                    <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
                        Harden Your App Security <br />
                        <span className="text-emerald-500">In 10 Seconds.</span>
                    </h1>

                    <p className="text-sm sm:text-md text-slate-400 max-w-xl mx-auto leading-relaxed">
                        Audit web security headers and SSL diagnostics instantly. Retrieve automated remediation profiles to secure your production environments against vulnerabilities.
                    </p>

                    {/* Scanner Input Area */}
                    <div className="max-w-2xl mx-auto pt-2">
                        <div className="p-1 bg-slate-900 rounded-xl border border-slate-800 shadow-xl">
                            <form id="scan-form" className="flex flex-col sm:flex-row gap-1" onSubmit={handleScan}>
                                <div className="relative flex-grow">
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <rect width="20" height="14" x="2" y="3" rx="2" />
                                            <line x1="8" x2="16" y1="21" y2="21" />
                                            <line x1="12" x2="12" y1="17" y2="21" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        id="url-input"
                                        placeholder="Enter your app URL (e.g. vibe-app.vercel.app)"
                                        className="w-full bg-slate-950 border-none rounded-lg py-4 pl-12 pr-4 text-white focus:ring-1 focus:ring-emerald-500 transition-all outline-none text-sm"
                                        required
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    id="scan-btn"
                                    disabled={isScanning}
                                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-8 py-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2"
                                >
                                    <span>{isScanning ? "Scanning..." : "Start Free Scan"}</span>
                                    {!isScanning && (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="lucide lucide-arrow-right"
                                        >
                                            <line x1="5" x2="19" y1="12" y2="12" />
                                            <polyline points="12 5 19 12 12 19" />
                                        </svg>
                                    )}
                                </button>
                            </form>
                        </div>

                        {/* Scan Progress Bar */}
                        <div id="progress-container" className={`mt-8 animate-in fade-in ${isScanning ? "block" : "hidden"}`}>
                            <div className="flex justify-between text-[10px] text-slate-500 mb-2 font-mono uppercase tracking-widest gap-4">
                                <span className="truncate">{scanStatus || "Analyzing Stack"}</span>
                                <span id="progress-text" className="shrink-0">{scanProgress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    id="progress-bar"
                                    className="h-full bg-emerald-500 transition-all duration-200"
                                    style={{ width: `${scanProgress}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Scan Error Message */}
                        {scanError && (
                            <div className="mt-8 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-left text-sm text-rose-450 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                                <div>
                                    <h4 className="font-bold text-rose-300">Scan Execution Error</h4>
                                    <p className="mt-1 text-slate-400 leading-relaxed text-xs">{scanError}</p>
                                </div>
                            </div>
                        )}

                        {/* Scan Results Report */}
                        {scanResult && (
                            <div id="scan-report-results" className="mt-12 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Report Header */}
                                <div className="p-6 md:p-8 border-b border-slate-800/80 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">Pulse Check</span>
                                            <span className="text-xs text-slate-500 font-mono">Status: Completed</span>
                                        </div>
                                        <h2 className="text-lg font-bold text-white mt-2 font-mono truncate max-w-[280px] sm:max-w-md">{scanResult.url}</h2>
                                        <p className="text-xs text-slate-500 mt-1 font-mono">Scanned at {new Date(scanResult.scannedAt).toLocaleString()}</p>
                                    </div>
                                    <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <span className="text-[10px] text-slate-500 uppercase font-mono">Server:</span>
                                            <span className="font-semibold text-slate-350">{scanResult.server}</span>
                                        </div>
                                        {scanResult.poweredBy !== 'Undetected' && (
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                <span className="text-[10px] text-slate-500 uppercase font-mono">Stack:</span>
                                                <span className="font-semibold text-slate-350">{scanResult.poweredBy}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Report Metrics Summary */}
                                <div className="p-6 md:p-8 border-b border-slate-800/80 bg-slate-950/20 grid grid-cols-1 md:grid-cols-3 gap-8">
                                    {/* Radial Score Gauge */}
                                    <div className="flex flex-col items-center justify-center py-4 border-b md:border-b-0 md:border-r border-slate-800/80">
                                        <div className="relative">
                                            <svg className="w-36 h-36" viewBox="0 0 224 224">
                                                <circle cx="112" cy="112" r="100" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
                                                <circle cx="112" cy="112" r="100" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray="628.3" strokeDashoffset={628.3 - (628.3 * scanResult.score) / 100} className={`progress-ring__circle transition-all duration-1000 ${
                                                    scanResult.score >= 80 ? 'text-emerald-500' :
                                                    scanResult.score >= 50 ? 'text-amber-500' : 'text-rose-500'
                                                }`} strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-4xl font-bold text-white tracking-tighter">{scanResult.score}</span>
                                                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Safety Index</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Grade Display */}
                                    <div className="flex flex-col items-center justify-center py-4 border-b md:border-b-0 md:border-r border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-2">Security Grade</span>
                                        <div className={`text-6xl font-black font-sans leading-none ${
                                            scanResult.grade.startsWith('A') ? 'text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]' :
                                            scanResult.grade.startsWith('B') || scanResult.grade.startsWith('C') ? 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.2)]' :
                                            'text-rose-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                                        }`}>
                                            {scanResult.grade}
                                        </div>
                                        <span className="text-xs text-slate-400 mt-3 font-medium">
                                            {scanResult.score >= 80 ? 'Strong Protection Standards' :
                                             scanResult.score >= 50 ? 'Intermediate Security Gaps' :
                                             'Action Required: Vulnerable Stack'}
                                        </span>
                                    </div>

                                    {/* Remediation Action */}
                                    <div className="flex flex-col justify-center items-center md:items-start text-center md:text-left py-4">
                                        <h3 className="text-md font-bold text-white mb-2 font-mono">Harden Stack</h3>
                                        <p className="text-xs text-slate-400 leading-relaxed mb-5 max-w-[240px]">
                                            Inject security headers into your runtime architecture configuration to mitigate logical attacks.
                                        </p>
                                        <Link href="/docs" className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all w-full md:w-auto justify-center shadow-lg shadow-emerald-500/10">
                                            <span>Read Hardening Guides</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                        </Link>
                                    </div>
                                </div>

                                {/* Header Check Details */}
                                <div className="p-6 md:p-8 space-y-4 bg-slate-950/20">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Audited HTTP Security Headers</h3>
                                    <div className="space-y-3">
                                        {(() => {
                                            let failedCount = 0;
                                            return scanResult.checks.map((check: ScanCheck, idx: number) => {
                                                let isLocked = false;
                                                if (check.status === 'Failed') {
                                                    failedCount++;
                                                    if (failedCount > 2) {
                                                        isLocked = true;
                                                    }
                                                }
                                                return (
                                                    <CheckCard
                                                        key={idx}
                                                        check={check}
                                                        isLocked={isLocked}
                                                    />
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}

                        <p className="mt-6 text-xs text-slate-500 italic">
                            Non-invasive surface audit. No login required for initial scan.
                        </p>
                    </div>
                </div>
            </section>

            {/* Tech Stack Banner */}
            <section className="py-10 border-b border-t border-slate-900 bg-[#01030a]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-8">Securing Modern Architectures</p>
                    <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="flex items-center gap-2 text-white font-bold"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> React</div>
                        <div className="flex items-center gap-2 text-white font-bold"><div className="w-3 h-3 bg-green-500 rounded-full"></div> Node.js</div>
                        <div className="flex items-center gap-2 text-white font-bold"><div className="w-3 h-3 bg-yellow-400 rounded-full"></div> Python</div>
                        <div className="flex items-center gap-2 text-white font-bold"><div className="w-3 h-3 bg-cyan-400 rounded-full"></div> Go</div>
                        <div className="flex items-center gap-2 text-white font-bold"><div className="w-3 h-3 bg-orange-500 rounded-full"></div> Rust</div>
                        <div className="flex items-center gap-2 text-white font-bold"><div className="w-3 h-3 bg-blue-600 rounded-full"></div> Postgres</div>
                    </div>
                </div>
            </section>

            {/* Workflow Section */}
            <section className="py-24 bg-[#020617]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-20">
                        <h2 className="text-3xl font-bold text-white mb-4">Seamless Integration. Immediate Results.</h2>
                        <p className="text-slate-500 uppercase tracking-widest text-xs font-bold">How Hardener Plus Works</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-12 relative">
                        {/* Connecting Line */}
                        <div className="hidden md:block absolute top-12 left-[16.66%] right-[16.66%] h-0.5 bg-gradient-to-r from-emerald-500/0 via-emerald-500/20 to-emerald-500/0"></div>

                        {/* Step 1 */}
                        <div className="relative text-center">
                            <div className="w-24 h-24 mx-auto bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mb-6 relative z-10 transition-transform hover:scale-105 duration-300">
                                <span className="text-2xl font-bold text-emerald-500">01</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Connect & Scan</h3>
                            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
                                Link your repository or provide a staging URL. Our engine maps your architecture dynamically.
                            </p>
                        </div>

                        {/* Step 2 */}
                        <div className="relative text-center">
                            <div className="w-24 h-24 mx-auto bg-slate-900 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 relative z-10 shadow-[0_0_30px_rgba(16,185,129,0.1)] transition-transform hover:scale-105 duration-300">
                                <span className="text-2xl font-bold text-emerald-500">02</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Analyze & Identify</h3>
                            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
                                We run proprietary heuristics to detect business-logic flaws and injection vulnerabilities.
                            </p>
                        </div>

                        {/* Step 3 */}
                        <div className="relative text-center">
                            <div className="w-24 h-24 mx-auto bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mb-6 relative z-10 transition-transform hover:scale-105 duration-300">
                                <span className="text-2xl font-bold text-emerald-500">03</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Automated Patching</h3>
                            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
                                Review and merge auto-generated PRs containing exact fixes for your specific framework.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section id="how" className="py-24 bg-[#01040f] border-y border-slate-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-20">
                        <h2 className="text-3xl font-bold text-white mb-4">Engineered for Reliability</h2>
                        <p className="text-slate-500 uppercase tracking-widest text-xs font-bold">The Last Mile of Development</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="p-10 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 transition-all">
                            <div className="text-emerald-500 mb-8">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-4">Hardener Plus Engine</h3>
                            <p className="text-slate-400 leading-relaxed text-sm">
                                Utilizes advanced heuristics and dynamic profiling to identify sophisticated logical bypasses.
                            </p>
                        </div>

                        <div className="p-10 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 transition-all">
                            <div className="text-emerald-500 mb-8">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-4">Founders Report</h3>
                            <p className="text-slate-400 leading-relaxed text-sm">
                                Clean, actionable summaries. We prioritize fixes based on business impact, not just CVSS scores.
                            </p>
                        </div>

                        <div className="p-10 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 transition-all">
                            <div className="text-emerald-500 mb-8">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-4">Direct Hardening</h3>
                            <p className="text-slate-400 leading-relaxed text-sm">
                                Receive tested code snippets for your specific stack (PHP, C#, Node) to close vulnerabilities immediately.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Dashboard Preview */}
            <section className="py-24 px-4">
                <div className="max-w-6xl mx-auto">
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
                        <div className="border-b border-slate-800 p-5 flex items-center justify-between bg-slate-950/50">
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-800"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-800"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-800"></div>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 tracking-widest uppercase">
                                Console // Audit_Output
                            </div>
                        </div>

                        <div className="p-8 md:p-16 grid md:grid-cols-2 gap-16 items-center">
                            <div>
                                <div className="mb-10">
                                    <h4 className="text-2xl font-bold text-white mb-3 tracking-tight">Audit Summary</h4>
                                    <p className="text-slate-500 text-sm">
                                        Target: <span className="text-emerald-500 font-mono">pathfinder.io</span>
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center gap-4 p-5 rounded-lg bg-slate-950 border-l-4 border-amber-500">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="text-amber-500 shrink-0"
                                        >
                                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                            <line x1="12" x2="12" y1="9" y2="13" />
                                            <line x1="12" x2="12.01" y1="17" y2="17" />
                                        </svg>
                                        <div>
                                            <p className="text-white font-bold text-sm">Key Leakage</p>
                                            <p className="text-slate-500 text-xs">Unencrypted keys found in client JS.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 p-5 rounded-lg bg-slate-950 border-l-4 border-emerald-500">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="text-emerald-500 shrink-0"
                                        >
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                            <polyline points="22 4 12 14.01 9 11.01" />
                                        </svg>
                                        <div>
                                            <p className="text-white font-bold text-sm">SQL Sanitization</p>
                                            <p className="text-slate-500 text-xs">Parameterization verified across all inputs.</p>
                                        </div>
                                    </div>
                                </div>

                                <button className="mt-10 w-full bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
                                    <span>Apply Hardening Patch</span>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="fill-current"
                                    >
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex flex-col items-center justify-center py-10">
                                <div className="relative mb-8">
                                    <svg className="w-56 h-56" viewBox="0 0 224 224">
                                        <circle
                                            cx="112"
                                            cy="112"
                                            r="100"
                                            stroke="currentColor"
                                            strokeWidth="12"
                                            fill="transparent"
                                            className="text-slate-800"
                                        />
                                        <circle
                                            cx="112"
                                            cy="112"
                                            r="100"
                                            stroke="currentColor"
                                            strokeWidth="12"
                                            fill="transparent"
                                            strokeDasharray="628.3"
                                            strokeDashoffset="94.24"
                                            className="text-emerald-500 progress-ring__circle"
                                            strokeLinecap="butt"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-6xl font-bold text-white tracking-tighter">85</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">
                                            Safety Score
                                        </span>
                                    </div>
                                </div>
                                <p className="text-center text-slate-500 text-sm max-w-xs leading-relaxed font-medium italic">
                                    &quot;Your application architecture meets 85% of our security hardening benchmarks.&quot;
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="py-24 bg-[#01040f]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h2 className="text-4xl font-bold text-white mb-6 tracking-tight">Pricing</h2>
                    <p className="text-slate-500 mb-20 uppercase tracking-widest text-xs font-bold">
                        Global Scale. Simple Rates.
                    </p>

                    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                        {/* Free Tier */}
                        <div className="p-10 rounded-xl bg-slate-900/50 border border-slate-800 text-left flex flex-col transition-all hover:border-slate-700">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Pulse Check</h3>
                            <p className="text-4xl font-bold text-white mb-8">
                                $0<span className="text-xs font-normal text-slate-500 ml-1 tracking-normal">/scan</span>
                            </p>
                            <ul className="space-y-4 mb-10 flex-grow">
                                <li className="flex items-center gap-3 text-sm text-slate-400">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div> Surface Scan
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-400">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div> Tech Stack Analysis
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-400">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div> Header Audit
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-400">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div> Basic Report
                                </li>
                            </ul>
                            <a href="/signup?plan=free" className="w-full block text-center bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg font-bold transition-all">
                                Start Free
                            </a>
                        </div>

                        {/* Pro Tier */}
                        <div className="p-10 rounded-xl bg-slate-900 border-2 border-emerald-600 text-left flex flex-col relative shadow-2xl">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 px-3 py-1 rounded text-[10px] font-bold text-white uppercase tracking-widest">
                                Popular
                            </div>
                            <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-widest mb-4">Deep Audit</h3>
                            <p className="text-4xl font-bold text-white mb-8">
                                $49<span className="text-xs font-normal text-slate-500 ml-1 tracking-normal">/scan</span>
                            </p>
                            <ul className="space-y-4 mb-10 flex-grow">
                                <li className="flex items-center gap-3 text-sm text-slate-200">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Hardener Plus Advanced Scan
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-200">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Exploit Proof Logs
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-200">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Code Fix Snippets
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-200">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Priority Queue
                                </li>
                            </ul>
                            <a href="/signup?plan=pro" className="w-full block text-center bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-lg font-bold transition-all">
                                Run Audit
                            </a>
                        </div>

                        {/* Managed Tier */}
                        <div className="p-10 rounded-xl bg-slate-900/50 border border-slate-800 text-left flex flex-col transition-all hover:border-slate-700">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Enterprise</h3>
                            <p className="text-4xl font-bold text-white mb-8">
                                $299<span className="text-xs font-normal text-slate-500 ml-1 tracking-normal">/mo</span>
                            </p>
                            <ul className="space-y-4 mb-10 flex-grow">
                                <li className="flex items-center gap-3 text-sm text-slate-400">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div> Monthly Deep Audits
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-400">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div> Managed PR Submission
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-400">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div> Security Badge
                                </li>
                                <li className="flex items-center gap-3 text-sm text-slate-400">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div> Vulnerability Monitor
                                </li>
                            </ul>
                            <a href="mailto:sales@hardener.ai" className="w-full block text-center bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg font-bold transition-all">
                                Contact Sales
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-24 bg-[#020617] border-t border-slate-900">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-white mb-4">Frequently Asked Questions</h2>
                        <p className="text-slate-500 uppercase tracking-widest text-xs font-bold">Clear answers</p>
                    </div>

                    <div className="space-y-4">
                        <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors">
                            <h4 className="text-lg font-bold text-white mb-3 flex items-center justify-between">
                                Does Hardener Plus require source code access?
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="6 9 12 15 18 9" /></svg>
                            </h4>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                For our Deep Audit, source access is recommended to provide precise code fixes. However, our Pulse Check can run purely on surface architecture without repository access.
                            </p>
                        </div>
                        <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors">
                            <h4 className="text-lg font-bold text-white mb-3 flex items-center justify-between">
                                How is this different from generic static analysis?
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="6 9 12 15 18 9" /></svg>
                            </h4>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Traditional SAST tools generate massive amounts of noise and false positives. Hardener Plus uses dynamic profiling tailored to modern frameworks to detect complex logical bypasses that rules-based engines miss, prioritizing business impact.
                            </p>
                        </div>
                        <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors">
                            <h4 className="text-lg font-bold text-white mb-3 flex items-center justify-between">
                                Can I integrate it into my CI/CD pipeline?
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="6 9 12 15 18 9" /></svg>
                            </h4>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Yes. The Enterprise tier includes GitHub/GitLab actions that automatically scan pull requests and block deployments if critical vulnerabilities are detected.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-24 border-t border-slate-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-12">
                        <div className="flex flex-col items-center md:items-start">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="text-emerald-500">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />
                                        <path d="m9 12 2 2 4-4" />
                                    </svg>
                                </div>
                                <span className="text-xl font-bold text-white tracking-tight">Hardener Plus</span>
                            </div>
                            <p className="text-slate-500 text-sm max-w-xs text-center md:text-left leading-relaxed font-medium">
                                Advanced security audits for the modern software era. Based on industry-leading security benchmarks.
                            </p>
                        </div>

                        <div className="flex gap-12 text-xs text-slate-500 font-bold uppercase tracking-widest">
                            <a href="#" className="hover:text-white transition-colors">
                                Privacy
                            </a>
                            <a href="#" className="hover:text-white transition-colors">
                                Terms
                            </a>
                            <a href="#" className="hover:text-white transition-colors">
                                Security
                            </a>
                        </div>

                        <div className="flex gap-3">
                            <a
                                href="#"
                                className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-white transition-all"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                                    <path d="M9 18c-4.51 2-5-2-7-2" />
                                </svg>
                            </a>
                            <a
                                href="#"
                                className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-white transition-all"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            </a>
                        </div>
                    </div>
                    <div className="mt-16 text-center text-slate-700 text-[10px] uppercase tracking-[0.3em] font-bold">
                        &copy; 2026 Hardener Plus // Developed Globally.
                    </div>
                </div>
            </footer>
        </>
    );
}
