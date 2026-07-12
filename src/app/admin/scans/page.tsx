"use client";

import { useState } from "react";

// Mock Scan Data
const initialScans = [
    { id: "scan_11029", target: "api.vibe-app.dev", user: "Alex Chen", status: "Running", progress: 68, timeRemaining: "2m 14s", vulnsFound: 2 },
    { id: "scan_11028", target: "staging.startup.co", user: "Marc Doucet", status: "Completed", progress: 100, timeTaken: "4m 52s", vulnsFound: 0 },
    { id: "scan_11027", target: "fintech.dev/payments", user: "Emily Wang", status: "Failed", error: "Connection Timeout", timeTaken: "30s" },
    { id: "scan_11026", target: "personal-blog.dev", user: "Tom Hollanders", status: "Completed", progress: 100, timeTaken: "1m 12s", vulnsFound: 14 },
    { id: "scan_11025", target: "admin.vibe-app.dev", user: "Alex Chen", status: "Completed", progress: 100, timeTaken: "5m 20s", vulnsFound: 1 },
];

export default function AdminScansList() {
    const [scans] = useState(initialScans);

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
                {scans.map((scan) => (
                    <div key={scan.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors group flex flex-col md:flex-row gap-6 md:items-center justify-between">

                        {/* Target Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                                <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${scan.status === 'Running' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        scan.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            'bg-red-500/10 text-red-400 border-red-500/20'
                                    }`}>
                                    {scan.status}
                                </span>
                                <span className="text-xs text-slate-500 font-mono">{scan.id}</span>
                            </div>
                            <h3 className="text-lg font-bold text-white truncate max-w-sm">{scan.target}</h3>
                            <p className="text-sm text-slate-400 mt-0.5">Requested by <span className="text-slate-300">{scan.user}</span></p>
                        </div>

                        {/* Status / Progress area */}
                        <div className="flex-1 md:px-8 w-full md:max-w-xs">
                            {scan.status === 'Running' ? (
                                <div>
                                    <div className="flex justify-between text-xs mb-2">
                                        <span className="text-blue-400 font-medium tracking-wide">Scanning Architecture...</span>
                                        <span className="text-slate-500 font-mono">{scan.progress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                        <div className="h-full bg-blue-500 text-transparent" style={{ width: `${scan.progress}%` }}></div>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-2 text-right">Est. {scan.timeRemaining} remaining</div>
                                </div>
                            ) : scan.status === 'Failed' ? (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>
                                    Error: {scan.error}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-slate-950 border border-slate-800 flex flex-col items-center justify-center rounded-lg">
                                        <span className={`text-xl font-bold ${scan.vulnsFound && scan.vulnsFound > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                            {scan.vulnsFound}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">Vulns</span>
                                    </div>
                                    <div className="p-3 bg-slate-950 border border-slate-800 flex flex-col items-center justify-center rounded-lg">
                                        <span className="text-xl font-bold text-slate-300 font-mono">{scan.timeTaken}</span>
                                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">Duration</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="shrink-0 flex items-center gap-2 justify-end">
                            {scan.status === 'Completed' ? (
                                <button className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors">
                                    View Report
                                </button>
                            ) : scan.status === 'Running' ? (
                                <button className="px-4 py-2 border border-slate-700 text-slate-400 rounded-lg text-sm font-medium hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 transition-colors">
                                    Cancel
                                </button>
                            ) : (
                                <button className="px-4 py-2 border border-slate-700 text-slate-400 rounded-lg text-sm font-medium hover:bg-slate-800 hover:text-white transition-colors">
                                    View Logs
                                </button>
                            )}

                            <button className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                            </button>
                        </div>

                    </div>
                ))}
            </div>

            <div className="flex justify-center pt-4">
                <button className="text-sm font-medium text-emerald-500 hover:text-emerald-400 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                    Load Historical Scans
                </button>
            </div>
        </div>
    );
}
