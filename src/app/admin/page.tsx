"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

interface AlertItem {
    id: number;
    type: 'critical' | 'billing' | 'system';
    message: string;
    time: string;
}

export default function AdminDashboard() {
    const [metrics, setMetrics] = useState({
        totalUsers: 0,
        activeScans: 0,
        vulnerabilitiesFoundToday: 0,
        mrr: 0,
    });

    const [recentAlerts, setRecentAlerts] = useState<AlertItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadAdminData() {
            try {
                setLoading(true);
                const supabase = createClient();

                // 1. Fetch live aggregated metrics via Database RPC
                const { data: metricsData, error: metricsError } = await supabase.rpc('get_admin_dashboard_metrics');

                if (!metricsError && metricsData) {
                    setMetrics({
                        totalUsers: metricsData.totalUsers || 0,
                        activeScans: metricsData.activeScans || 0,
                        vulnerabilitiesFoundToday: metricsData.vulnerabilitiesFoundToday || 0,
                        mrr: metricsData.mrr || 0,
                    });
                }

                // 2. Fetch real-time recent alerts from scans and profiles
                const [scansRes, usersRes] = await Promise.all([
                    supabase
                        .from('scans')
                        .select('id, target_url, vulns_found, status, score, created_at')
                        .order('created_at', { ascending: false })
                        .limit(5),
                    supabase
                        .from('profiles')
                        .select('email, plan, created_at')
                        .order('created_at', { ascending: false })
                        .limit(3)
                ]);

                const alertsList: AlertItem[] = [];
                let counter = 1;

                if (scansRes.data) {
                    scansRes.data.forEach(scan => {
                        const timeText = new Date(scan.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        if (scan.status === 'Failed') {
                            alertsList.push({
                                id: counter++,
                                type: 'critical',
                                message: `Scan process failed for target: ${scan.target_url}`,
                                time: timeText
                            });
                        } else if (scan.vulns_found && scan.vulns_found > 0) {
                            alertsList.push({
                                id: counter++,
                                type: 'critical',
                                message: `${scan.vulns_found} security gaps exposed on ${scan.target_url} (Score: ${scan.score})`,
                                time: timeText
                            });
                        } else {
                            alertsList.push({
                                id: counter++,
                                type: 'system',
                                message: `Scan passed successfully for domain: ${scan.target_url}`,
                                time: timeText
                            });
                        }
                    });
                }

                if (usersRes.data) {
                    usersRes.data.forEach(user => {
                        const timeText = new Date(user.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        alertsList.push({
                            id: counter++,
                            type: 'billing',
                            message: `New account registered: ${user.email} (${user.plan} tier)`,
                            time: timeText
                        });
                    });
                }

                setRecentAlerts(alertsList.slice(0, 5));
            } catch (err) {
                console.error("Failed to load admin stats", err);
            } finally {
                setLoading(false);
            }
        }

        loadAdminData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                    <p className="text-sm text-slate-500 font-mono">Aggregating platform metrics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Executive Overview</h1>
                <p className="text-sm text-slate-500 mt-1">Platform performance and activity metrics for today.</p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Users */}
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
                        Real-time account registrations
                    </div>
                </div>

                {/* Active Scans */}
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
                        <div className="bg-blue-500 h-1.5 rounded-full w-[25%]"></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 relative z-10">Running scanner threads</p>
                </div>

                {/* Vulns Found Today */}
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
                        Audit gap aggregates for today
                    </div>
                </div>

                {/* Monthly Revenue */}
                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Monthly Revenue</p>
                            <h3 className="text-3xl font-bold text-white mt-1">${metrics.mrr.toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-500 font-medium relative z-10">
                        Calculated from active plan counts
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Visual Graph placeholder */}
                <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col">
                    <h3 className="text-lg font-bold text-white mb-6">Scan Volume & Activity Index</h3>
                    <div className="flex-1 min-h-[300px] flex items-center justify-center border border-slate-800 bg-slate-950/20 rounded-lg relative overflow-hidden">
                        <div className="absolute inset-0 p-4 flex items-end justify-between gap-2 opacity-30">
                            {[40, 60, 45, 80, 50, 90, 70, 85, 55, 75, 60, 100].map((height, i) => (
                                <div key={i} className="w-full bg-slate-800 rounded-t-sm relative group cursor-pointer" style={{ height: `${height}%` }}>
                                    <div className="absolute bottom-0 w-full bg-emerald-500 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-400" style={{ height: `${Math.max(10, height - 30)}%` }}></div>
                                </div>
                            ))}
                        </div>
                        <div className="relative z-10 flex flex-col items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 animate-pulse"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                            <span className="text-slate-400 font-mono text-xs uppercase tracking-wider">Dynamic Activity Stream Online</span>
                        </div>
                    </div>
                </div>

                {/* System Alerts Feed */}
                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-white">System Alerts</h3>
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">Live</span>
                    </div>

                    <div className="space-y-4 overflow-y-auto pr-2 flex-grow">
                        {recentAlerts.length === 0 ? (
                            <div className="text-center py-12 text-slate-500 text-sm">
                                No active alerts or scan registers today.
                            </div>
                        ) : (
                            recentAlerts.map((alert) => (
                                <div key={alert.id} className="flex gap-4 p-4 rounded-lg bg-slate-950/50 border border-slate-800/50 hover:border-slate-800 transition-colors">
                                    <div className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${alert.type === 'critical' ? 'bg-red-500' :
                                            alert.type === 'billing' ? 'bg-indigo-500' : 'bg-emerald-500'
                                        }`} />
                                    <div>
                                        <p className="text-sm font-medium text-slate-200 leading-snug">{alert.message}</p>
                                        <p className="text-xs text-slate-500 mt-1">{alert.time}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
