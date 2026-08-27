"use client";

export const dynamic = 'force-dynamic';

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

interface ScanRecord {
    id: string;
    target_url: string;
    status: 'Running' | 'Completed' | 'Failed';
    progress: number;
    vulns_found: number;
    time_taken: string | null;
    error_message: string | null;
    score: number | null;
    grade: string | null;
    checks: ScanCheck[] | null;
    created_at: string;
}

interface UserProfile {
    full_name: string | null;
    email: string | null;
    plan: 'Free' | 'Pro' | 'Enterprise';
    role: 'user' | 'admin';
    monthly_scans_used: number;
    quota_reset_date: string | null;
}

function CheckCard({ check }: { check: ScanCheck }) {
    const [isOpen, setIsOpen] = useState(check.status === 'Failed');

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
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-[200px] sm:max-w-md">{check.value}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-slate-500 shrink-0 ml-2">
                    <span className="text-xs hover:text-slate-300 font-medium hidden sm:inline">
                        {isOpen ? "Hide Fix" : "Show Fix"}
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
                </div>
            )}
        </div>
    );
}

export default function UserDashboard() {
    const [isLoading, setIsLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [scans, setScans] = useState<ScanRecord[]>([]);
    const [selectedHistoryScan, setSelectedHistoryScan] = useState<ScanRecord | null>(null);
    
    // Scanner State
    const [url, setUrl] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStatus, setScanStatus] = useState("");
    const [scanError, setScanError] = useState<string | null>(null);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);

    // Domain TXT Verification State
    const [verifyingDomain, setVerifyingDomain] = useState("");
    const [verificationToken, setVerificationToken] = useState<string | null>(null);
    const [isGeneratingToken, setIsGeneratingToken] = useState(false);
    const [isCheckingDns, setIsCheckingDns] = useState(false);
    const [dnsStatusMessage, setDnsStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const domainParam = params.get("domain");
            if (domainParam) {
                setVerifyingDomain(domainParam);
                setUrl(domainParam);
            }
        }
    }, []);

    const handleGenerateTxtToken = async (targetDomain?: string) => {
        const domainToVerify = targetDomain || verifyingDomain || url;
        if (!domainToVerify) return;
        setIsGeneratingToken(true);
        setDnsStatusMessage(null);

        try {
            const res = await fetch("/api/verify-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "generate", domain: domainToVerify }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate verification token.");
            setVerificationToken(data.token);
            setVerifyingDomain(domainToVerify);
        } catch (err) {
            setDnsStatusMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsGeneratingToken(false);
        }
    };

    const handleVerifyDnsRecord = async () => {
        if (!verifyingDomain) return;
        setIsCheckingDns(true);
        setDnsStatusMessage(null);

        try {
            const res = await fetch("/api/verify-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "verify", domain: verifyingDomain }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "TXT record not detected in DNS yet. Please allow 1-2 minutes for DNS propagation.");
            }
            setDnsStatusMessage({ type: 'success', text: `Domain '${verifyingDomain}' successfully verified! Full automated DAST scans & remediation unlocked.` });
        } catch (err) {
            setDnsStatusMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsCheckingDns(false);
        }
    };

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // 1. Verify User Session
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    router.push("/login");
                    return;
                }

                // 2. Fetch User Profile
                const { data: profileData, error: profileErr } = await supabase
                    .from("profiles")
                    .select("full_name, email, plan, role, monthly_scans_used, quota_reset_date")
                    .eq("id", user.id)
                    .single();

                if (profileErr) throw profileErr;
                setProfile(profileData as UserProfile);

                // 3. Fetch User Scans
                const { data: scansData, error: scansErr } = await supabase
                    .from("scans")
                    .select("*")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false });

                if (scansErr) throw scansErr;
                setScans(scansData as ScanRecord[]);

            } catch (err) {
                console.error("Dashboard load failed:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, [router, supabase]);

    const handleSignOut = async () => {
        try {
            await supabase.auth.signOut();
            router.push("/");
        } catch (err) {
            console.error("Signout failed:", err);
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
            "Resolving domain and connecting to GitHub repository tree...",
            "Indexing AST syntax trees for .ts, .py, .go, and .js source files...",
            "Searching codebase for hardcoded API keys & environment secrets...",
            "Checking HTTP security headers and SSL diagnostics...",
            "Running static security analysis against logic bypasses...",
            "Analyzing Content-Security-Policy rules...",
            "Evaluating Strict-Transport-Security...",
            "Compiling codebase safety score..."
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

            // Log successfully completed scan to database & refresh feed
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const failedCount = data.checks.filter((c: ScanCheck) => c.status === "Failed").length;
                const { data: insertData, error: dbErr } = await supabase
                    .from("scans")
                    .insert({
                        user_id: user.id,
                        target_url: trimmed,
                        status: "Completed",
                        progress: 100,
                        vulns_found: failedCount,
                        time_taken: "2.5s",
                        score: data.score,
                        grade: data.grade,
                        checks: data.checks
                    })
                    .select()
                    .single();

                if (!dbErr && insertData) {
                    setScans((prev) => [insertData as ScanRecord, ...prev]);
                    
                    const newScansUsed = (profile?.monthly_scans_used || 0) + 1;
                    await supabase
                        .from("profiles")
                        .update({ monthly_scans_used: newScansUsed })
                        .eq("id", user.id);

                    setProfile((prev) => prev ? { ...prev, monthly_scans_used: newScansUsed } : null);
                }
            }

            setTimeout(() => {
                setScanResult(data);
                setIsScanning(false);
            }, 500);

        } catch (err) {
            clearInterval(progressInterval);
            clearInterval(statusInterval);
            const msg = err instanceof Error ? err.message : "Failed to establish connection to target server.";
            setScanError(msg);
            setIsScanning(false);

            // Log failed scan to database & refresh feed
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: insertData, error: dbErr } = await supabase
                        .from("scans")
                        .insert({
                            user_id: user.id,
                            target_url: trimmed,
                            status: "Failed",
                            progress: 100,
                            vulns_found: 0,
                            error_message: msg
                        })
                        .select()
                        .single();

                    if (!dbErr && insertData) {
                        setScans((prev) => [insertData as ScanRecord, ...prev]);
                    }
                }
            } catch {
                // silent database insert failure
            }
        }
    };

    const getQuotaLimit = (plan: 'Free' | 'Pro' | 'Enterprise') => {
        if (plan === 'Enterprise') return 9999;
        if (plan === 'Pro') return 100;
        return 10;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#01040f] flex items-center justify-center p-4">
                <div className="space-y-4 text-center">
                    <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin mx-auto"></div>
                    <p className="text-xs text-slate-500 font-mono tracking-widest uppercase">Loading Secure Session...</p>
                </div>
            </div>
        );
    }

    const quotaLimit = profile ? getQuotaLimit(profile.plan) : 10;
    const quotaPercentage = profile ? Math.min(100, (profile.monthly_scans_used / quotaLimit) * 100) : 0;

    return (
        <div className="min-h-screen bg-[#01040f] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-white pb-16">
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
                            <Link href="/docs" className="text-slate-400 hover:text-white transition-colors">
                                Docs
                            </Link>
                            {profile?.role === 'admin' && (
                                <Link href="/admin" className="text-slate-400 hover:text-white font-bold transition-colors">
                                    Admin Dashboard
                                </Link>
                            )}
                            <button
                                onClick={handleSignOut}
                                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-350 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer text-xs"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Dashboard Content */}
            <main className="pt-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
                {/* Header Welcome */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800/80 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 blur-[120px] rounded-full"></div>
                    <div className="relative z-10 space-y-1">
                        <h1 className="text-xl font-bold text-white tracking-tight">
                            Welcome back, {profile?.full_name || "Developer"}!
                        </h1>
                        <p className="text-xs text-slate-400">
                            Perform security header scans and copy remediation templates directly from your dashboard.
                        </p>
                    </div>
                </div>

                {/* Domain TXT Verification Card */}
                <div className="p-4 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <h2 className="text-xs font-bold text-slate-450 uppercase tracking-widest font-mono">Domain Verification Center</h2>
                            </div>
                            <h3 className="text-lg font-bold text-white mt-1">Verify Domain Ownership via DNS TXT Record</h3>
                            <p className="text-xs text-slate-400 mt-1 max-w-xl">
                                Prove ownership of your web application domain to unlock full DAST vulnerability scanning, automated PR patches, and complete remediation profiles.
                            </p>
                        </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row gap-3 max-w-3xl">
                        <input
                            type="text"
                            value={verifyingDomain}
                            onChange={(e) => setVerifyingDomain(e.target.value)}
                            placeholder="Enter domain to verify (e.g. example.com)"
                            className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono flex-grow"
                        />
                        <button
                            type="button"
                            onClick={() => handleGenerateTxtToken()}
                            disabled={isGeneratingToken}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-md shadow-emerald-500/10"
                        >
                            {isGeneratingToken ? "Generating TXT..." : "Generate TXT Record"}
                        </button>
                    </div>

                    {/* Generated Token Display Box */}
                    {verificationToken && (
                        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 animate-in fade-in duration-300">
                            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                                <span className="font-bold text-emerald-400 uppercase text-[10px] tracking-wider">DNS Record Details</span>
                                <span>Record Type: <strong className="text-white">TXT</strong></span>
                            </div>
                            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between font-mono text-xs text-white">
                                <div className="truncate mr-2">
                                    <span className="text-slate-500 select-none">Value: </span>
                                    <span className="text-emerald-300 font-bold">{verificationToken}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(verificationToken);
                                        alert("TXT record copied to clipboard!");
                                    }}
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-bold transition-all shrink-0"
                                >
                                    Copy Token
                                </button>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                                <p className="text-[11px] text-slate-500">
                                    Add this TXT record to your DNS provider (Cloudflare, Vercel, Route53, Namecheap), then click verify below.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleVerifyDnsRecord}
                                    disabled={isCheckingDns}
                                    className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer shadow-md shadow-emerald-500/10"
                                >
                                    {isCheckingDns ? "Querying DNS..." : "Verify DNS Record"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Status Alert */}
                    {dnsStatusMessage && (
                        <div className={`p-4 rounded-xl text-xs flex items-center gap-3 animate-in fade-in ${
                            dnsStatusMessage.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                        }`}>
                            <span className="font-bold">{dnsStatusMessage.text}</span>
                        </div>
                    )}
                </div>

                {/* Codebase & GitHub Repository Audit Section */}
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800/80 space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/[0.02] blur-[100px] rounded-full pointer-events-none"></div>
                    <div>
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
                            <h2 className="text-xs font-bold text-slate-450 uppercase tracking-widest font-mono">Codebase & GitHub Scanner</h2>
                        </div>
                        <h3 className="text-lg font-bold text-white mt-1">Scan Web Domain or GitHub Repository</h3>
                        <p className="text-xs text-slate-400 mt-1 max-w-xl">
                            Search source code files across your GitHub repository or test live HTTP endpoints for vulnerability patterns, AST logical flaws, and exposed credentials.
                        </p>
                    </div>

                    <form onSubmit={handleScan} className="max-w-3xl flex flex-col sm:flex-row gap-3 relative z-10">
                        <div className="relative flex-grow">
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all font-mono placeholder:text-slate-650"
                                placeholder="Enter your app URL (e.g., example.com)"
                                required
                                disabled={isScanning}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isScanning}
                            className={`px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shrink-0 cursor-pointer shadow-lg shadow-emerald-500/10 ${isScanning ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isScanning ? "Running Audit..." : "Start Free Scan"}
                        </button>
                    </form>

                    {/* Scanning Progress */}
                    {isScanning && (
                        <div className="space-y-3 max-w-3xl border border-slate-850 p-4 rounded-xl bg-slate-950/45 animate-in fade-in duration-300">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400 font-medium font-mono">{scanStatus}</span>
                                <span className="text-slate-350 font-bold font-mono">{scanProgress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-900 border border-slate-850 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                    style={{ width: `${scanProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {/* Scan Error Alert */}
                    {scanError && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex gap-3 max-w-3xl animate-in fade-in duration-300">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            <div className="space-y-1">
                                <p className="font-bold text-white">Scan Audit Interrupted</p>
                                <p className="leading-relaxed">{scanError}</p>
                            </div>
                        </div>
                    )}

                    {/* Active Scan Report Section */}
                    {scanResult && (
                        <div id="scan-report-results" className="pt-6 border-t border-slate-800/60 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 relative z-10">
                            {/* Summary Card Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-950/40 border border-slate-850 rounded-2xl p-6">
                                {/* SVG Radial Gauge */}
                                <div className="flex flex-col items-center justify-center py-4 border-b md:border-b-0 md:border-r border-slate-850">
                                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-3">Audited Score</span>
                                    <div className="relative w-28 h-28">
                                        <svg className="w-full h-full transform -rotate-95" viewBox="0 0 36 36">
                                            <path
                                                className="text-slate-850"
                                                strokeWidth="2.5"
                                                stroke="currentColor"
                                                fill="none"
                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            />
                                            <path
                                                className={scanResult.score >= 80 ? 'text-emerald-500' : scanResult.score >= 50 ? 'text-amber-500' : 'text-rose-500'}
                                                strokeDasharray={`${scanResult.score}, 100`}
                                                strokeWidth="2.5"
                                                strokeLinecap="round"
                                                stroke="currentColor"
                                                fill="none"
                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-3xl font-bold text-white tracking-tighter">{scanResult.score}</span>
                                            <span className="text-[7px] font-bold text-slate-550 uppercase tracking-widest mt-0.5">Safety Index</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Grade Display */}
                                <div className="flex flex-col items-center justify-center py-4 border-b md:border-b-0 md:border-r border-slate-855">
                                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-2">Security Grade</span>
                                    <div className={`text-5xl font-black font-sans leading-none ${
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

                                {/* Summary details */}
                                <div className="flex flex-col justify-center py-4 px-2 space-y-3">
                                    <div>
                                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Audited Server Banner</span>
                                        <span className="text-xs text-slate-300 font-mono font-bold mt-1 block truncate">{scanResult.server}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Runtime Powered-By</span>
                                        <span className="text-xs text-slate-300 font-mono font-bold mt-1 block truncate">{scanResult.poweredBy}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Audit Cards List */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Detailed Security Audits</h3>
                                {scanResult.checks.map((check, idx) => (
                                    <CheckCard key={idx} check={check} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Scan History */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800/80">
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 font-mono">Scan History</h2>

                            {scans.length === 0 ? (
                                <div className="text-center py-16 space-y-4 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                                    <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 mx-auto">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="font-bold text-white text-sm">No scans run yet</h3>
                                        <p className="text-xs text-slate-500 max-w-xs mx-auto">
                                            Run an audit above to identify security vulnerabilities and retrieve automated configurations.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-widest font-mono text-[10px]">
                                                <th className="pb-3 pl-1">Target URL</th>
                                                <th className="pb-3 text-center">Grade</th>
                                                <th className="pb-3 text-center">Score</th>
                                                <th className="pb-3 text-center">Vulnerabilities</th>
                                                <th className="pb-3 text-right">Date Audited</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60">
                                            {scans.map((scan) => (
                                                <tr key={scan.id} className="hover:bg-slate-950/50 transition-colors">
                                                    <td className="py-4 pl-1 font-mono font-bold text-slate-350 truncate max-w-[200px]">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedHistoryScan(scan);
                                                            }}
                                                            className="text-left font-bold text-slate-350 hover:text-emerald-400 transition-colors cursor-pointer"
                                                        >
                                                            {scan.target_url}
                                                        </button>
                                                    </td>
                                                    <td className="py-4 text-center">
                                                        {scan.status === 'Completed' && scan.grade ? (
                                                            <span className={`px-2 py-0.5 rounded font-black ${
                                                                scan.grade.startsWith('A') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                                scan.grade.startsWith('B') || scan.grade.startsWith('C') ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                                                'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                                            }`}>
                                                                {scan.grade}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-650">—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-4 text-center font-bold">
                                                        {scan.status === 'Completed' && scan.score !== null ? (
                                                            <span className={scan.score >= 80 ? 'text-emerald-400' : scan.score >= 50 ? 'text-amber-400' : 'text-rose-400'}>
                                                                {scan.score}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-600">—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-4 text-center">
                                                        {scan.status === 'Completed' ? (
                                                            <span className={`font-mono px-1.5 py-0.5 rounded text-[10px] ${scan.vulns_found > 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                                                {scan.vulns_found} issues
                                                            </span>
                                                        ) : (
                                                            <span className="text-rose-500 font-mono text-[10px] bg-rose-500/10 px-1.5 py-0.5 rounded">Failed</span>
                                                        )}
                                                    </td>
                                                    <td className="py-4 text-right text-slate-500 font-mono">
                                                        {new Date(scan.created_at).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Profile & Quota */}
                    <div className="space-y-6">
                        {/* Profile Summary Card */}
                        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800/80 space-y-6">
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Profile & Usage</h2>
                            
                            {/* Plan Badge */}
                            <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800/60">
                                <div>
                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Current Plan</div>
                                    <div className="text-md font-bold text-white font-mono mt-0.5">{profile?.plan} Tier</div>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                    profile?.plan === 'Enterprise' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/25' :
                                    profile?.plan === 'Pro' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/25' :
                                    'bg-slate-800 text-slate-350 border border-slate-700'
                                }`}>
                                    {profile?.plan}
                                </span>
                            </div>

                            {/* Quota Progress */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-medium">
                                    <span className="text-slate-400">Scan Credits Used</span>
                                    <span className="text-slate-300 font-mono">{profile?.monthly_scans_used} / {quotaLimit === 9999 ? '∞' : quotaLimit}</span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-805 overflow-hidden">
                                    <div 
                                        className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                                        style={{ width: `${quotaPercentage}%` }}
                                    ></div>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                                    {quotaLimit === 9999 ? 'Unlimited scans active.' : `Resets automatically on ${profile?.quota_reset_date ? new Date(profile.quota_reset_date).toLocaleDateString() : 'N/A'}.`}
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-2">
                                <Link 
                                    href="/pricing"
                                    className="w-full block text-center py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-emerald-500 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                >
                                    Upgrade Plan Tier
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {selectedHistoryScan && (
                <ScanDetailModal 
                    scan={selectedHistoryScan} 
                    onClose={() => setSelectedHistoryScan(null)} 
                />
            )}
        </div>
    );
}

function ScanDetailModal({ scan, onClose }: { scan: ScanRecord; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-850 flex items-center justify-between shrink-0 bg-slate-950/40">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
                                scan.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                                {scan.status}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                                Date Audited: {new Date(scan.created_at).toLocaleString()}
                            </span>
                        </div>
                        <h2 className="text-lg font-bold text-white truncate max-w-md">{scan.target_url}</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                        title="Close Modal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {scan.status === 'Completed' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                                <span className={`text-3xl font-black ${
                                    scan.grade?.startsWith('A') ? 'text-emerald-400' :
                                    scan.grade?.startsWith('B') || scan.grade?.startsWith('C') ? 'text-amber-400' :
                                    'text-rose-500'
                                }`}>
                                    {scan.grade}
                                </span>
                                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">Security Grade</span>
                            </div>
                            <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                                <span className={`text-3xl font-black ${
                                    scan.score && scan.score >= 80 ? 'text-emerald-400' :
                                    scan.score && scan.score >= 55 ? 'text-amber-400' :
                                    'text-rose-500'
                                }`}>
                                    {scan.score}%
                                </span>
                                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">Safety Index</span>
                            </div>
                            <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                                <span className={`text-3xl font-black ${scan.vulns_found > 0 ? 'text-rose-450' : 'text-emerald-400'}`}>
                                    {scan.vulns_found}
                                </span>
                                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">Vulnerabilities</span>
                            </div>
                        </div>
                    ) : (
                        <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                            <p className="text-red-400 font-bold text-sm">Scan Execution Failure</p>
                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{scan.error_message || 'A network connection or handshake timeout occurred.'}</p>
                        </div>
                    )}

                    {/* Detailed audits list */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Detailed Checks Analysis</h3>
                        {scan.checks && scan.checks.length > 0 ? (
                            scan.checks.map((check, idx) => (
                                <CheckCard key={idx} check={check} />
                            ))
                        ) : scan.status === 'Completed' ? (
                            <div className="text-slate-500 text-xs text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-950/20 font-mono">
                                No raw audit check details were saved for this scan.
                            </div>
                        ) : (
                            <div className="text-slate-500 text-xs text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-950/20 font-mono">
                                Scanner execution failed. No check logs compiled.
                            </div>
                        )}
                    </div>

                    {/* AI-verified findings (per-finding, from the scanner worker) */}
                    {scan.status === 'Completed' && <FindingsPanel scanId={scan.id} />}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 flex justify-end shrink-0 bg-slate-950/40">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 text-white rounded-xl text-xs font-bold transition-all"
                    >
                        Close Details
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- AI-verified findings panel (Phase 1 UI) -------------------------------
interface FindingRow {
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
}

function FindingsPanel({ scanId }: { scanId: string }) {
    const [findings, setFindings] = useState<FindingRow[] | null>(null);
    const [summary, setSummary] = useState<{ confirmed: number; false_positives: number; patches_validated: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`/api/findings?scanId=${encodeURIComponent(scanId)}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to load findings");
                if (alive) { setFindings(data.findings); setSummary(data.summary); }
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : String(e));
            }
        })();
        return () => { alive = false; };
    }, [scanId]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">AI-Verified Findings</h3>
                {summary && (
                    <div className="flex gap-2 text-[10px] font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">{summary.confirmed} confirmed</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{summary.false_positives} false-positive</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{summary.patches_validated} patch verified</span>
                    </div>
                )}
            </div>

            {error && <div className="text-rose-400 text-xs font-mono py-4">{error}</div>}
            {!findings && !error && <div className="text-slate-500 text-xs font-mono py-8 text-center animate-pulse">Loading findings…</div>}
            {findings && findings.length === 0 && (
                <div className="text-slate-500 text-xs text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-950/20 font-mono">
                    No findings recorded for this scan.
                </div>
            )}
            {findings?.map((f) => <FindingCard key={f.id} f={f} />)}
        </div>
    );
}

function FindingCard({ f }: { f: FindingRow }) {
    const [open, setOpen] = useState(false);
    const sev = (f.severity || "note").toLowerCase();
    const sevColor = sev === "error" ? "text-rose-400 border-rose-500/20 bg-rose-500/10"
        : sev === "warning" ? "text-amber-400 border-amber-500/20 bg-amber-500/10"
        : "text-slate-400 border-slate-700 bg-slate-800";
    return (
        <div className={`border rounded-xl overflow-hidden ${f.is_vulnerability ? "border-slate-800" : "border-slate-850 opacity-70"}`}>
            <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-950/40 transition-colors">
                <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${sevColor}`}>{sev}</span>
                <span className="flex-1 min-w-0">
                    <span className="text-xs text-white font-mono truncate block">{f.rule_id || "finding"}</span>
                    <span className="text-[10px] text-slate-500 font-mono truncate block">{f.file_path}{f.start_line ? `:${f.start_line}` : ""}</span>
                </span>
                {f.is_vulnerability
                    ? <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">CONFIRMED</span>
                    : <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700">FALSE POSITIVE</span>}
                {f.patch_validated && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PATCH VERIFIED</span>}
                {f.patch_applies && !f.patch_validated && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">PATCH APPLIES</span>}
            </button>
            {open && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-850 bg-slate-950/30">
                    {f.reasoning && <p className="text-[11px] text-slate-400 leading-relaxed pt-3">{f.reasoning}</p>}
                    {f.unified_diff && (
                        <div>
                            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold font-mono">Remediation diff</span>
                            <pre className="mt-1 text-[10px] leading-relaxed bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto font-mono">
                                {f.unified_diff.split("\n").map((ln, i) => (
                                    <div key={i} className={ln.startsWith("+") && !ln.startsWith("+++") ? "text-emerald-400" : ln.startsWith("-") && !ln.startsWith("---") ? "text-rose-400" : "text-slate-400"}>{ln}</div>
                                ))}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
