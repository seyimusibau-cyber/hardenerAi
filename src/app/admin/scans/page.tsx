"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

interface ScanRecord {
    scan_id: string;
    target_url: string;
    status: 'Running' | 'Completed' | 'Failed';
    progress: number;
    vulns_found: number;
    time_taken: string | null;
    error_message: string | null;
    score: number | null;
    grade: string | null;
    created_at: string;
    user_name: string | null;
    user_email: string | null;
}

export default function AdminScansList() {
    const [scans, setScans] = useState<ScanRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadScans() {
            try {
                setLoading(true);
                const supabase = createClient();
                
                // Fetch the live join view of scans and profile metadata
                const { data, error } = await supabase
                    .from('admin_scans_view')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (!error && data) {
                    setScans(data as ScanRecord[]);
                } else if (error) {
                    console.error("Supabase error fetching scans:", error);
                }
            } catch (err) {
                console.error("Failed to load scans feed", err);
            } finally {
                setLoading(false);
            }
        }

        loadScans();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                    <p className="text-sm text-slate-500 font-mono">Loading global activity logs...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Global Scan Activity</h1>
                    <p className="text-sm text-slate-500 mt-1">Real-time feed of all vulnerability scans running on the platform.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-mono text-emerald-500 uppercase tracking-widest">Live Feed</span>
                </div>
            </div>

            {/* Scans Feed */}
            <div className="space-y-3">
                {scans.length === 0 ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-500 text-sm">
                        No scan requests logged in the system.
                    </div>
                ) : (
                    scans.map((scan) => (
                        <div key={scan.scan_id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors group flex flex-col md:flex-row gap-6 md:items-center justify-between">
                            
                            {/* Target Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                    <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
                                        scan.status === 'Running' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        scan.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        'bg-red-500/10 text-red-400 border-red-500/20'
                                    }`}>
                                        {scan.status}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono">
                                        ID: {scan.scan_id.substring(0, 8)}
                                    </span>
                                    {scan.score !== null && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                            scan.score >= 80 ? 'bg-emerald-500/10 text-emerald-400' :
                                            scan.score >= 50 ? 'bg-amber-500/10 text-amber-400' :
                                            'bg-red-500/10 text-red-400'
                                        }`}>
                                            Score: {scan.score}% ({scan.grade})
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-lg font-bold text-white truncate max-w-sm">{scan.target_url}</h3>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Requested by <span className="text-slate-200">{scan.user_name || 'User'}</span> 
                                    <span className="text-xs text-slate-500 font-mono ml-1">({scan.user_email})</span>
                                </p>
                            </div>

                            {/* Status / Progress area */}
                            <div className="flex-1 md:px-8 w-full md:max-w-xs">
                                {scan.status === 'Running' ? (
                                    <div>
                                        <div className="flex justify-between text-xs mb-2">
                                            <span className="text-blue-400 font-medium tracking-wide">Scanning ...</span>
                                            <span className="text-slate-500 font-mono">{scan.progress}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                            <div className="h-full bg-blue-500 text-transparent" style={{ width: `${scan.progress}%` }}></div>
                                        </div>
                                    </div>
                                ) : scan.status === 'Failed' ? (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>
                                        Failed: {scan.error_message || 'Socket timeout'}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-slate-950 border border-slate-800 flex flex-col items-center justify-center rounded-lg">
                                            <span className={`text-xl font-bold ${scan.vulns_found && scan.vulns_found > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                {scan.vulns_found}
                                            </span>
                                            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">Vulns</span>
                                        </div>
                                        <div className="p-3 bg-slate-950 border border-slate-800 flex flex-col items-center justify-center rounded-lg">
                                            <span className="text-xl font-bold text-slate-300 font-mono">
                                                {scan.time_taken || '1s'}
                                            </span>
                                            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">Duration</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="shrink-0 flex items-center gap-2 justify-end">
                                <Link 
                                    href={`/dashboard?scan=${scan.scan_id}`}
                                    className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                                >
                                    Inspect Audit
                                </Link>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
