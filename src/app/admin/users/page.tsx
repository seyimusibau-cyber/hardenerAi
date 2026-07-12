"use client";

import { useState } from "react";

// Mock User Data
const initialUsers = [
    { id: "usr_1", name: "Alex Chen", email: "alex@pathfinder.io", plan: "Enterprise", status: "Active", joined: "2026-01-15", scans: 142 },
    { id: "usr_2", name: "Sarah Jenkins", email: "s.jenkins@vibe-coders.net", plan: "Pro", status: "Active", joined: "2026-02-01", scans: 45 },
    { id: "usr_3", name: "Marc Doucet", email: "marc@startup.co", plan: "Free", status: "Inactive", joined: "2026-02-18", scans: 2 },
    { id: "usr_4", name: "Emily Wang", email: "emily.w@fintech.dev", plan: "Enterprise", status: "Active", joined: "2025-11-05", scans: 890 },
    { id: "usr_5", name: "Tom Hollanders", email: "tom@personal-blog.dev", plan: "Free", status: "Suspended", joined: "2026-03-01", scans: 12 },
];

export default function AdminUsersList() {
    const [searchTerm, setSearchTerm] = useState("");
    const [users] = useState(initialUsers);

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">User Management</h1>
                    <p className="text-sm text-slate-500 mt-1">Manage platform users, subscriptions, and access.</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                        Export CSV
                    </button>
                    <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" /></svg>
                        Invite User
                    </button>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Search users by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-2">
                    <select className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 appearance-none pr-8 relative">
                        <option value="">All Plans</option>
                        <option value="Enterprise">Enterprise</option>
                        <option value="Pro">Pro</option>
                        <option value="Free">Free</option>
                    </select>
                    <select className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 appearance-none pr-8">
                        <option value="">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Suspended">Suspended</option>
                    </select>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-medium uppercase tracking-wider text-[10px]">
                            <tr>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Plan</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Scans</th>
                                <th className="px-6 py-4">Joined</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {filteredUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs uppercase border border-emerald-500/20">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">{user.name}</div>
                                                <div className="text-slate-500 text-xs">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${user.plan === 'Enterprise' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                user.plan === 'Pro' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                    'bg-slate-800 text-slate-400 border-slate-700'
                                            }`}>
                                            {user.plan}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-1.5 text-xs font-medium">
                                            <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-emerald-500' :
                                                    user.status === 'Suspended' ? 'bg-red-500' : 'bg-slate-500'
                                                }`}></span>
                                            <span className={
                                                user.status === 'Active' ? 'text-slate-300' :
                                                    user.status === 'Suspended' ? 'text-red-400' : 'text-slate-500'
                                            }>{user.status}</span>
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-300 font-mono">
                                        {user.scans.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-slate-400">
                                        {new Date(user.joined).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-slate-500 hover:text-white p-2 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-slate-700"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                                            No users found matching &quot;{searchTerm}&quot;
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Showing <span className="font-medium text-slate-300">{filteredUsers.length}</span> of <span className="font-medium text-slate-300">{initialUsers.length}</span> results</p>
                    <div className="flex gap-1">
                        <button className="px-3 py-1 rounded bg-slate-900 border border-slate-800 text-slate-500 text-xs cursor-not-allowed">Previous</button>
                        <button className="px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-medium">1</button>
                        <button className="px-3 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400 text-xs hover:bg-slate-800">Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
