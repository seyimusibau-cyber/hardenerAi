import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * The body previously asked for "Inter" in an inline style, but nothing ever
 * loaded it — so every screen rendered in the platform's default sans and the
 * type looked untuned. next/font self-hosts the files and gives us the two
 * variables globals.css binds to.
 */
const sans = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
});

const mono = JetBrains_Mono({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-jetbrains",
});

export const metadata: Metadata = {
    title: "Vultix | Advanced Security for Modern Developers",
    description: "Clean architecture for the modern era. We use advanced static analysis and dynamic profiling to audit, verify, and harden your codebase against production-grade threats.",
    icons: {
        icon: "/logo.png",
        shortcut: "/logo.png",
        apple: "/logo.png",
    }
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={`scroll-smooth ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
            <body className="bg-[#020617] font-sans text-slate-200 selection:bg-emerald-500/30">
                {children}
            </body>
        </html>
    );
}
