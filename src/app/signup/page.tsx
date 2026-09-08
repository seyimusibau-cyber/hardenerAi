"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function SignupPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [acceptTos, setAcceptTos] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!acceptTos) {
            setError("You must accept the Terms of Service, Acceptable Use Policy, and Indemnification Agreement.");
            return;
        }

        // Password complexity validation (minimum 8 characters with standard security criteria)
        if (password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }
        if (!/[A-Z]/.test(password)) {
            setError("Password must contain at least one uppercase letter.");
            return;
        }
        if (!/[a-z]/.test(password)) {
            setError("Password must contain at least one lowercase letter.");
            return;
        }
        if (!/[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
            setError("Password must contain at least one number or special character.");
            return;
        }

        setIsLoading(true);

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                    tos_accepted_at: new Date().toISOString()
                },
                emailRedirectTo: `${location.origin}/auth/callback?next=/dashboard`,
            },
        });

        if (signUpError) {
            setError(signUpError.message);
            setIsLoading(false);
            return;
        }

        // If email confirmation is enabled, user is created but session is null until confirmed
        if (signUpData?.user && !signUpData?.session) {
            setEmailSent(true);
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
                                alt="Vultix Logo"
                                className="w-6 h-6 rounded-md object-contain border border-slate-800"
                            />
                            <span className="text-xl font-bold tracking-tight text-white">
                                Vult<span className="text-emerald-500">ix</span>
                            </span>
                        </Link>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            {emailSent ? "Check Your Inbox" : "Create an Account"}
                        </h1>
                        <p className="text-slate-400 text-sm">
                            {emailSent
                                ? "We've dispatched an account verification link to your email address."
                                : "Join the leading platform for modern app hardening."}
                        </p>
                    </div>

                    {emailSent ? (
                        <div className="space-y-6">
                            <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div className="text-sm font-bold text-white">
                                        Verification sent to <span className="text-emerald-400">{email}</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed pt-2 border-t border-emerald-500/20">
                                    Click the link inside the confirmation email to activate your account and access your dashboard.
                                </p>
                            </div>

                            <Link
                                href="/login"
                                className="w-full block text-center bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-lg transition-all"
                            >
                                Back to Sign In
                            </Link>
                        </div>
                    ) : (
                    <form onSubmit={handleSignup} className="space-y-4">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
                                {error}
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-300 uppercase tracking-widest pl-1" htmlFor="name">
                                Full Name
                            </label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                placeholder="Alice Johnson"
                                required
                            />
                        </div>

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
                                placeholder="name@example.com"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-300 uppercase tracking-widest pl-1" htmlFor="password">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                placeholder="••••••••"
                                required
                                minLength={8}
                            />
                            <p className="text-[10px] text-slate-500 pl-1 mt-1">Must be at least 8 characters with uppercase, lowercase, and a number or symbol.</p>
                        </div>

                        <div className="flex items-start space-x-2 mt-4">
                            <input
                                type="checkbox"
                                id="tos"
                                checked={acceptTos}
                                onChange={(e) => setAcceptTos(e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                            />
                            <label htmlFor="tos" className="text-xs text-slate-400">
                                I accept the <Link href="/tos" className="text-emerald-500 hover:underline">Terms of Service</Link>, <Link href="/aup" className="text-emerald-500 hover:underline">Acceptable Use Policy</Link>, and <Link href="/indemnification" className="text-emerald-500 hover:underline">Indemnification Agreement</Link>. I confirm I will only scan systems I am authorized to test.
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full bg-slate-800 text-white font-bold py-3.5 rounded-lg transition-all mt-6 ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-slate-700'}`}
                        >
                            {isLoading ? "Creating Account..." : "Sign Up"}
                        </button>
                    </form>
                    )}

                    <div className="mt-8 text-center border-t border-slate-800/50 pt-6">
                        <p className="text-sm text-slate-400">
                            Already have an account?{" "}
                            <Link href="/login" className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">
                                Sign In
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
