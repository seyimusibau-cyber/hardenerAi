"use client";

/**
 * The before/after test run.
 *
 * This is the only screen in Vultix that shows something no other security tool
 * can: a test that FAILED before the patch and PASSED after it. `patch_applies`
 * and `patch_validated` are separate columns because they are separate claims —
 * a patch that merely applies proves nothing about whether it fixes anything.
 *
 * It rendered as a nine-pixel chip. It is now the subject of the page: full
 * width, its own ground, and the diff sits underneath it deliberately small.
 * The diff is the claim; the test is the evidence.
 *
 * Three states, and they must not look alike:
 *
 *   validated   the test failed then passed. Emerald. Ship it.
 *   applied     the diff applies but nothing proved it. Amber, and it SAYS so.
 *   neither     a patch exists and could not be run. Explained, not hidden —
 *               `patch_validation_note` carries the reason (from migration 004,
 *               which exists precisely so "we could not run a test for this
 *               language" and "the patch does not fix it" stop collapsing into
 *               the same false flag).
 */

export interface ProofProps {
    unitTest: string | null;
    unifiedDiff: string | null;
    patchApplies: boolean;
    patchValidated: boolean;
    validationNote?: string | null;
    estimatedHours?: number | null;
}

function DiffLine({ line }: { line: string }) {
    const add = line.startsWith("+") && !line.startsWith("+++");
    const del = line.startsWith("-") && !line.startsWith("---");
    return (
        <div className={add ? "text-emerald-400" : del ? "text-rose-400" : "text-slate-500"}>
            {line || " "}
        </div>
    );
}

export function ProofPanel({
    unitTest,
    unifiedDiff,
    patchApplies,
    patchValidated,
    validationNote,
    estimatedHours,
}: ProofProps) {
    if (!unifiedDiff) return null;

    // The test node id is the first line of the stored test when it looks like
    // one; otherwise the whole test is the evidence and there is nothing to
    // pull out as a heading.
    const testName = unitTest?.split("\n").find((l) => l.includes("::") || l.trim().startsWith("def test"))?.trim();

    return (
        <div className="border-t border-slate-800">
            {patchValidated ? (
                <div className="bg-[#0A1017] px-5 py-7 sm:px-7">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-500">
                        Proven by execution
                    </div>
                    {testName && (
                        <div className="mt-1.5 break-all font-mono text-[11px] text-slate-500">{testName}</div>
                    )}

                    <div className="mt-5 grid gap-px border border-slate-800 bg-slate-800 sm:grid-cols-2">
                        <div className="bg-slate-900/60 p-5">
                            <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-slate-500">
                                Before the patch
                            </div>
                            <div className="mt-3 font-mono text-[15px] font-medium tracking-wide text-rose-400">
                                FAILED
                            </div>
                            <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-slate-500">
                                The test could not pass against the vulnerable code.
                            </p>
                        </div>
                        <div className="bg-emerald-950/40 p-5">
                            <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-slate-500">
                                After the patch
                            </div>
                            <div className="mt-3 font-mono text-[15px] font-medium tracking-wide text-emerald-400">
                                PASSED
                            </div>
                            <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-slate-500">
                                Same test, same fixtures. The only change is the diff below.
                            </p>
                        </div>
                    </div>

                    <p className="mt-5 max-w-[62ch] text-[13.5px] leading-relaxed text-slate-400">
                        <span className="font-medium text-slate-200">
                            The test failed before and passed after.
                        </span>{" "}
                        That is the only sequence showing the patch changed the outcome — a patch
                        that merely applies cleanly proves nothing.
                        {typeof estimatedHours === "number" && estimatedHours > 0 && (
                            <> Roughly {estimatedHours}h of engineering.</>
                        )}
                    </p>
                </div>
            ) : (
                <div className="bg-[#0A1017] px-5 py-6 sm:px-7">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-500">
                        {patchApplies ? "Applies cleanly — not proven" : "Patch proposed — not proven"}
                    </div>
                    <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-slate-400">
                        {patchApplies
                            ? "The diff applies to your code without conflict, but no test confirmed it fixes the defect. Review it before merging."
                            : "A patch was written but could not be applied and tested here."}
                        {validationNote && (
                            <span className="mt-2 block font-mono text-[11px] text-slate-500">
                                {validationNote}
                            </span>
                        )}
                    </p>
                </div>
            )}

            {/* The test itself. It is the evidence, so it is shown rather than
                summarised — and shown even when unproven, because a reader can
                judge a test we could not run. */}
            {unitTest && (
                <div className="border-t border-slate-800 px-5 py-5 sm:px-7">
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-slate-500">
                        {patchValidated ? "The test that proves it" : "Generated test — not run"}
                    </div>
                    <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-slate-400">
                        {unitTest}
                    </pre>
                </div>
            )}

            <div className="border-t border-slate-800 px-5 py-5 sm:px-7">
                <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-slate-500">
                    The change · {unifiedDiff.split("\n").filter((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length} lines
                </div>
                <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed">
                    {unifiedDiff.split("\n").map((ln, i) => <DiffLine key={i} line={ln} />)}
                </pre>
            </div>
        </div>
    );
}
