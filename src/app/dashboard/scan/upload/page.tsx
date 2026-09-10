export const dynamic = "force-dynamic";

import Link from "next/link";

/**
 * Upload a file — not built yet.
 *
 * Listed in the sidebar on purpose. A disabled item a user can see reads as a
 * roadmap; a missing one reads as something you have not thought of. What it
 * must not do is present a form that cannot submit.
 */
export default function ScanUpload() {
    return (
        <div className="w-full max-w-2xl px-6 py-9 sm:px-9">
            <div className="flex items-baseline gap-3">
                <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-white">Upload a file</h1>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-amber-500">coming soon</span>
            </div>
            <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-slate-400">
                Scan code that does not live on GitHub — an archive, a directory, a single file.
                Same pipeline: find, patch, and prove the patch with a test.
            </p>

            <div className="mt-8 max-w-2xl border border-dashed border-slate-800 bg-slate-900/20 px-6 py-14 text-center">
                <p className="text-[13.5px] text-slate-400">Not available yet.</p>
                <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-slate-600">
                    An uploaded archive has no remote to open a pull request against, so it will
                    end at a proven patch you can download.
                </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
                <Link href="/dashboard/scan/github" className="rounded bg-emerald-600 px-4 py-2 text-[13px] font-medium text-emerald-950 hover:bg-emerald-500">
                    Scan a GitHub repo instead
                </Link>
                <Link href="/dashboard" className="rounded border border-slate-700 px-4 py-2 text-[13px] text-slate-300 hover:bg-slate-800">
                    Back to dashboard
                </Link>
            </div>
        </div>
    );
}
