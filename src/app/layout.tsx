import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Hardener Plus | Advanced Security for Modern Developers",
    description: "Clean architecture for the modern era. We use advanced static analysis and dynamic profiling to audit, verify, and harden your codebase against production-grade threats.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="scroll-smooth" suppressHydrationWarning>
            <body className="bg-[#020617] text-slate-200 selection:bg-emerald-500/30" style={{ fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                {children}
            </body>
        </html>
    );
}
