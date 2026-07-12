"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            setError(signInError.message);
            setIsLoading(false);
            return;
        }

        // Check role to route appropriately
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single();

            if (profile?.role === "admin") {
                router.push("/admin");
            } else {
                router.push("/dashboard");
            }
        } else {
            router.push("/dashboard");
        }
    };

    return (
        <div className="min-h-screen bg-[#01040f] flex items-center justify-center p-4 selection:bg-emerald-500/30">
            <div className="w-full max-w-md relative">
                {/* Decorative background glow */}
                <div className="absolute inset-0 bg-emerald-500/20 blur-[100px] rounded-full z-0"></div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="text-center mb-8">
                        <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
                            <img
                                src="/logo.png"
                                alt="HardenerPlus Logo"
                                className="w-6 h-6 rounded-md object-contain border border-slate-800"
                            />
                            <span className="text-xl font-bold tracking-tight text-white">
                                Hardener<span className="text-emerald-500">Plus</span>
                            </span>
                        </Link>
                        <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
                        <p className="text-slate-400 text-sm">Sign in to your account to continue protecting your applications.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
                                {error}
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-300 uppercase tracking-widest pl-1" htmlFor="email">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                placeholder="name@company.com"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center pl-1">
                                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest" htmlFor="password">
                                    Password
                                </label>
                                <Link href="#" className="text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors">
                                    Forgot password?
                                </Link>
                            </div>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full bg-emerald-600 text-white font-bold py-3.5 rounded-lg transition-all mt-6 shadow-[0_0_20px_rgba(16,185,129,0.2)] ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-emerald-500 hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]'}`}
                        >
                            {isLoading ? "Signing In..." : "Sign In"}
                        </button>
                    </form>

                    <div className="mt-8 text-center border-t border-slate-800/50 pt-6">
                        <p className="text-sm text-slate-400">
                            Don&apos;t have an account yet?{" "}
                            <Link href="/signup" className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">
                                Create an account
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
