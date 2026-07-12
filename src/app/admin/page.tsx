"use client";

import { useState } from "react";

export default function AdminDashboard() {
    // Mock data for the dashboard
    const [metrics] = useState({
        totalUsers: 1432,
        activeScans: 87,
        vulnerabilitiesFoundToday: 412,
        mrr: "$42,500",
    });

    const [recentAlerts] = useState([
        { id: 1, type: "critical", message: "Critical vulnerability detected in pathfinder.io scan", time: "10 mins ago" },
        { id: 2, type: "billing", message: "Payment failed for Enterprise customer ACME Corp", time: "1 hour ago" },
        { id: 3, type: "system", message: "Node.js Scanner Engine latency increased by 15%", time: "3 hours ago" },
    ]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Executive Overview</h1>
                <p className="text-sm text-slate-500 mt-1">Platform performance and activity metrics for today.</p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Total Users</p>
                            <h3 className="text-3xl font-bold text-white mt-1">{metrics.totalUsers}</h3>
                        </div>
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-500 font-medium relative z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                        +12% from last month
                    </div>
                    {/* Decorative background graph line */}
                    <div className="absolute inset-0 z-0 opacity-10 flex items-end">
                        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-1/2 stroke-emerald-500 fill-emerald-500/20">
                            <path d="M0,30 L0,20 C10,15 20,25 30,10 C40,-5 50,15 60,10 C70,5 80,15 90,5 C95,0 100,5 100,5 L100,30 Z" />
                        </svg>
                    </div>
                </div>

                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Active Scans</p>
                            <h3 className="text-3xl font-bold text-white mt-1">{metrics.activeScans}</h3>
                        </div>
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 relative z-10 w-full bg-slate-950 rounded-full h-1.5 mt-4">
                        <div className="bg-blue-500 h-1.5 rounded-full w-[65%]"></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 relative z-10 mt-2">65% engine capacity</p>
                </div>

                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Vulns Found Today</p>
                            <h3 className="text-3xl font-bold text-amber-500 mt-1">{metrics.vulnerabilitiesFoundToday}</h3>
                        </div>
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-amber-500 font-medium relative z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                        +24% from yesterday
                    </div>
                </div>

                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Monthly Revenue</p>
                            <h3 className="text-3xl font-bold text-white mt-1">{metrics.mrr}</h3>
                        </div>
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-500 font-medium relative z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                        +$4,100 this month
                    </div>
                </div>
            </div>

            {/* Main Content Area: Charts & Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Placeholder (Takes up 2 columns) */}
                <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col">
                    <h3 className="text-lg font-bold text-white mb-6">Scan Volume vs Threats detected</h3>
                    <div className="flex-1 min-h-[300px] flex items-center justify-center border-2 border-dashed border-slate-800 rounded-lg relative overflow-hidden bg-slate-950/50">
                        {/* Mock Chart Visualization */}
                        <div className="absolute inset-0 p-4 flex items-end justify-between gap-2 opacity-50">
                            {[40, 60, 45, 80, 50, 90, 70, 85, 55, 75, 60, 100].map((height, i) => (
                                <div key={i} className="w-full bg-slate-800 rounded-t-sm relative group cursor-pointer" style={{ height: `${height}%` }}>
                                    <div className="absolute bottom-0 w-full bg-emerald-500 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-400" style={{ height: `${Math.max(10, height - 30)}%` }}></div>
                                </div>
                            ))}
                        </div>
                        <div className="relative z-10 flex flex-col items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
                            <span className="text-slate-500 font-medium text-sm">Interactive Chart Component (Recharts)</span>
                        </div>
                    </div>
                </div>

                {/* Recent Alerts Feed */}
                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-white">System Alerts</h3>
                        <button className="text-xs text-emerald-500 font-medium hover:text-emerald-400">View All</button>
                    </div>

                    <div className="space-y-4 overflow-y-auto pr-2">
                        {recentAlerts.map((alert) => (
                            <div key={alert.id} className="flex gap-4 p-4 rounded-lg bg-slate-950/50 border border-slate-800/50 hover:border-slate-700 transition-colors">
                                <div className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${alert.type === 'critical' ? 'bg-red-500' :
                                        alert.type === 'billing' ? 'bg-indigo-500' : 'bg-amber-500'
                                    }`} />
                                <div>
                                    <p className="text-sm font-medium text-slate-200 leading-snug">{alert.message}</p>
                                    <p className="text-xs text-slate-500 mt-1">{alert.time}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
