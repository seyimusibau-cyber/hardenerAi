"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

function ResetPasswordContent() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [hasValidSession, setHasValidSession] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    // Verify authenticated recovery session
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setHasValidSession(true);
            } else {
                setHasValidSession(false);
            }
            setCheckingSession(false);
        };
        checkSession();
    }, [supabase]);

    // Password criteria checks
    const hasMinLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumberOrSymbol = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
    const isMatching = password.length > 0 && password === confirmPassword;
    const isStrong = hasMinLength && hasUpper && hasLower && hasNumberOrSymbol;

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!isStrong) {
            setError("Please fulfill all password security requirements before proceeding.");
            return;
        }

        if (!isMatching) {
            setError("Passwords do not match.");
            return;
        }

        setIsLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
            });

            if (updateError) {
                setError(updateError.message);
                setIsLoading(false);
                return;
            }

            setSuccess(true);
            setTimeout(() => {
                router.push("/dashboard");
            }, 2500);
        } catch {
            setError("An unexpected error occurred while updating your credentials.");
        } finally {
            setIsLoading(false);
        }
    };

    if (checkingSession) {
        return (
            <div className="min-h-screen bg-[#01040f] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-slate-500 uppercase tracking-widest font-mono">Verifying Recovery Token...</span>
                </div>
            </div>
        );
    }

    if (!hasValidSession && !success) {
        return (
            <div className="min-h-screen bg-[#01040f] flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Expired or Invalid Link</h2>
                    <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                        This recovery link is invalid, has expired, or has already been consumed.
                    </p>
                    <Link
                        href="/forgot-password"
                        className="inline-block w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                    >
                        Request a New Link
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#01040f] flex items-center justify-center p-4 selection:bg-emerald-500/30">
            <div className="w-full max-w-md relative">
                {/* Background glow */}
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
                        <h1 className="text-2xl font-bold text-white mb-2">Choose New Password</h1>
                        <p className="text-slate-400 text-sm">
                            Enter and confirm your new secure credentials below.
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

                    {success ? (
                        <div className="text-center space-y-4 py-4">
                            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-white">Password Updated!</h3>
                            <p className="text-sm text-slate-400">
                                Your credentials have been securely updated. Redirecting you to your dashboard...
                            </p>
                            <div className="pt-2">
                                <Link
                                    href="/dashboard"
                                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold uppercase tracking-wider"
                                >
                                    Go to Dashboard Now &rarr;
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest pl-1" htmlFor="password">
                                    New Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                    placeholder="••••••••••••"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest pl-1" htmlFor="confirmPassword">
                                    Confirm New Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                    placeholder="••••••••••••"
                                    required
                                />
                            </div>

                            {/* Live Strength Criteria */}
                            <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 text-xs">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Security Criteria
                                </span>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        <span>{hasMinLength ? '✓' : '○'}</span> 8+ characters
                                    </div>
                                    <div className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        <span>{hasUpper ? '✓' : '○'}</span> 1 uppercase
                                    </div>
                                    <div className={`flex items-center gap-1.5 ${hasLower ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        <span>{hasLower ? '✓' : '○'}</span> 1 lowercase
                                    </div>
                                    <div className={`flex items-center gap-1.5 ${hasNumberOrSymbol ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        <span>{hasNumberOrSymbol ? '✓' : '○'}</span> 1 number / symbol
                                    </div>
                                </div>
                                {confirmPassword.length > 0 && (
                                    <div className={`pt-1.5 border-t border-slate-800/50 flex items-center gap-1.5 ${isMatching ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        <span>{isMatching ? '✓' : '✗'}</span>
                                        {isMatching ? 'Passwords match' : 'Passwords do not match yet'}
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !isStrong || !isMatching}
                                className={`w-full bg-emerald-600 text-white font-bold py-3.5 rounded-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] ${
                                    isLoading || !isStrong || !isMatching
                                        ? 'opacity-60 cursor-not-allowed bg-slate-800 text-slate-400'
                                        : 'hover:bg-emerald-500 hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]'
                                }`}
                            >
                                {isLoading ? "Updating Credentials..." : "Update Password"}
                            </button>
                        </form>
                    )}

                    <div className="mt-8 text-center border-t border-slate-800/50 pt-6">
                        <Link href="/login" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
                            Return to Login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#01040f] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <ResetPasswordContent />
        </Suspense>
    );
}
