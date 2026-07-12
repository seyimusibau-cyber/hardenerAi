"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

interface UserProfile {
    id: string;
    full_name: string | null;
    email: string | null;
    plan: 'Free' | 'Pro' | 'Enterprise';
    role: 'user' | 'admin';
    status: 'Active' | 'Suspended';
    monthly_scans_used: number;
    created_at: string;
}

export default function AdminUsersList() {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedPlan, setSelectedPlan] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("");
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadUsers() {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setUsers(data as UserProfile[]);
            }
        } catch (err) {
            console.error("Failed to load profiles", err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadUsers();
    }, []);

    // Action: Change plan
    async function handleUpdatePlan(userId: string, newPlan: 'Free' | 'Pro' | 'Enterprise') {
        const supabase = createClient();
        const { error } = await supabase
            .from('profiles')
            .update({ plan: newPlan })
            .eq('id', userId);

        if (!error) {
            loadUsers();
        } else {
            alert(`Failed to update plan: ${error.message}`);
        }
    }

    // Action: Toggle Status
    async function handleToggleStatus(userId: string, currentStatus: 'Active' | 'Suspended') {
        const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
        const supabase = createClient();
        const { error } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .eq('id', userId);

        if (!error) {
            loadUsers();
        } else {
            alert(`Failed to update status: ${error.message}`);
        }
    }

    // Action: Toggle Role
    async function handleToggleRole(userId: string, currentRole: 'user' | 'admin') {
        const newRole = currentRole === 'user' ? 'admin' : 'user';
        const supabase = createClient();
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);

        if (!error) {
            loadUsers();
        } else {
            alert(`Failed to update role: ${error.message}`);
        }
    }

    const filteredUsers = users.filter(user => {
        const matchesSearch = 
            (user.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.email || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPlan = selectedPlan === "" || user.plan === selectedPlan;
        const matchesStatus = selectedStatus === "" || user.status === selectedStatus;
        return matchesSearch && matchesPlan && matchesStatus;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                    <p className="text-sm text-slate-500 font-mono">Loading user list...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">User Management</h1>
                    <p className="text-sm text-slate-500 mt-1">Manage platform users, subscriptions, and access.</p>
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
                    <select 
                        value={selectedPlan}
                        onChange={(e) => setSelectedPlan(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500"
                    >
                        <option value="">All Plans</option>
                        <option value="Enterprise">Enterprise</option>
                        <option value="Pro">Pro</option>
                        <option value="Free">Free</option>
                    </select>
                    <select 
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500"
                    >
                        <option value="">All Statuses</option>
                        <option value="Active">Active</option>
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
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">Plan</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Scans Used</th>
                                <th className="px-6 py-4">Joined</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 text-sm">
                                        No matches found for search criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs uppercase border border-emerald-500/20">
                                                    {(user.full_name || user.email || 'U').charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-white">{user.full_name || 'User'}</div>
                                                    <div className="text-slate-500 text-xs">{user.email || 'N/A'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs">
                                            <span className={`px-2 py-0.5 rounded border ${
                                                user.role === 'admin' 
                                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                            }`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${
                                                user.plan === 'Enterprise' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                user.plan === 'Pro' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                'bg-slate-800 text-slate-400 border-slate-700'
                                            }`}>
                                                {user.plan}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
                                                user.status === 'Active' ? 'text-emerald-400' : 'text-red-400'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                    user.status === 'Active' ? 'bg-emerald-500' : 'bg-red-500'
                                                }`}></span>
                                                {user.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-300 font-mono">
                                            {user.monthly_scans_used}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                                            {new Date(user.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            {/* Role Toggle */}
                                            <button 
                                                onClick={() => handleToggleRole(user.id, user.role)}
                                                className="text-xs text-slate-400 hover:text-white transition-colors"
                                            >
                                                Make {user.role === 'user' ? 'Admin' : 'User'}
                                            </button>
                                            <span className="text-slate-700">|</span>
                                            {/* Plan Upgrades */}
                                            <button 
                                                onClick={() => handleUpdatePlan(user.id, user.plan === 'Free' ? 'Pro' : user.plan === 'Pro' ? 'Enterprise' : 'Free')}
                                                className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
                                            >
                                                Cycle Plan
                                            </button>
                                            <span className="text-slate-700">|</span>
                                            {/* Status Toggle */}
                                            <button 
                                                onClick={() => handleToggleStatus(user.id, user.status)}
                                                className={`text-xs transition-colors ${
                                                    user.status === 'Active' ? 'text-red-500 hover:text-red-400' : 'text-emerald-500 hover:text-emerald-400'
                                                }`}
                                            >
                                                {user.status === 'Active' ? 'Suspend' : 'Activate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
