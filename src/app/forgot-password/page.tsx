"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ForgotPasswordContent() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);
    const searchParams = useSearchParams();

    useEffect(() => {
        const errorParam = searchParams.get('error');
        if (errorParam === 'expired') {
            setError('Your recovery link has expired or was already used. Please enter your email to request a fresh link.');
        }
    }, [searchParams]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => {
            setCooldown((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || 'Failed to dispatch recovery email. Please try again.');
                setIsLoading(false);
                return;
            }

            setIsSuccess(true);
            setCooldown(60); // 60-second cooldown
        } catch {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#01040f] flex items-center justify-center p-4 selection:bg-emerald-500/30">
            <div className="w-full max-w-md relative">
                {/* Background decorative glow */}
                <div className="absolute inset-0 bg-emerald-500/15 blur-[120px] rounded-full z-0 pointer-events-none"></div>

                <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                            {isSuccess ? "Check Your Inbox" : "Reset Password"}
                        </h1>
                        <p className="text-slate-400 text-sm">
                            {isSuccess
                                ? "We've dispatched password recovery instructions to your email."
                                : "Enter your account email and we'll send a secure one-time reset link."}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start gap-2.5">
                            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    {isSuccess ? (
                        <div className="space-y-6">
                            <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div className="text-sm font-bold text-white">
                                        Dispatched to <span className="text-emerald-400">{email}</span>
                                    </div>
                                </div>
                                <ul className="text-xs text-slate-400 space-y-1.5 pl-2 pt-2 border-t border-emerald-500/20">
                                    <li>&bull; Link expires automatically in <strong>60 minutes</strong>.</li>
                                    <li>&bull; Check your <strong>Spam or Junk folder</strong> if not in your primary inbox.</li>
                                    <li>&bull; Single-use cryptographic token for account security.</li>
                                </ul>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={cooldown > 0 || isLoading}
                                    className={`w-full py-3 rounded-lg text-sm font-semibold transition-all border ${
                                        cooldown > 0 || isLoading
                                            ? 'bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed'
                                            : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-white'
                                    }`}
                                >
                                    {isLoading
                                        ? "Resending..."
                                        : cooldown > 0
                                        ? `Resend link in ${cooldown}s`
                                        : "Resend recovery email"}
                                </button>

                                <Link
                                    href="/login"
                                    className="w-full text-center py-3 rounded-lg text-sm font-medium text-slate-400 hover:text-white transition-colors"
                                >
                                    Return to Sign In
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest pl-1" htmlFor="email">
                                    Account Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                    placeholder="name@company.com"
                                    required
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full bg-emerald-600 text-white font-bold py-3.5 rounded-lg transition-all mt-6 shadow-[0_0_20px_rgba(16,185,129,0.2)] ${
                                    isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-emerald-500 hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]'
                                }`}
                            >
                                {isLoading ? "Dispatching..." : "Send Recovery Link"}
                            </button>

                            <div className="text-center pt-4">
                                <Link href="/login" className="text-xs font-medium text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    Back to Sign In
                                </Link>
                            </div>
                        </form>
                    )}

                    <div className="mt-8 text-center border-t border-slate-800/50 pt-6">
                        <p className="text-xs text-slate-500">
                            Protected by Vultix Cryptographic Auth &amp; Adaptive Rate Limiting.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#01040f] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <ForgotPasswordContent />
        </Suspense>
    );
}
