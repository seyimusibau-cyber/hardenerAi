"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function AdminSignOutButton({ variant }: { variant: "icon" | "text" }) {
    const router = useRouter();
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/");
    };

    if (variant === "icon") {
        return (
            <button
                onClick={handleSignOut}
                className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
                title="Sign Out"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
            </button>
        );
    }

    return (
        <button
            onClick={handleSignOut}
            className="px-3 py-1.5 text-xs text-slate-400 border border-slate-800 rounded-lg hover:text-red-400 hover:border-red-500/25 transition-colors cursor-pointer"
        >
            Sign Out
        </button>
    );
}
