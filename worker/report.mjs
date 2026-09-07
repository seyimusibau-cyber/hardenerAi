// Scan completeness accounting.
//
// This lives outside scan.mjs on purpose. The rule it encodes -- "a scan that
// could not assess a finding must never report that finding as absent" -- has
// now been broken twice, both times because the check was a bare comparison
// buried in a 200-line script with no way to test it:
//
//   1. `_verify_error` was tracked but never counted, so an unreachable model
//      produced confirmed=0, penalty=0, score 100, grade A.
//   2. The guard added to fix that compared `verifyErrors === total`, where
//      `total` counts findings the scanners raised and `verifyErrors` can only
//      ever reach the MAX_FINDINGS cap. On any repo above the cap the guard
//      could not fire, so the same grade A came back for anything large.
//
// Three counts, and they are not interchangeable:
//   total       -- what the scanners raised
//   assessed    -- what this scan actually looked at (total, capped)
//   verifyErrors-- how many of `assessed` the AI failed to answer for
export function completeness({ total, assessed, verifyErrors }) {
  if (assessed > total) throw new Error("assessed cannot exceed total");
  if (verifyErrors > assessed) throw new Error("verifyErrors cannot exceed assessed");
  return {
    // The cap hid findings. `score` then describes a sample, and a large repo
    // can outscore a small one purely by overflowing the cap.
    truncated: total > assessed,
    // Every finding this scan looked at failed to verify. It learned nothing,
    // and reporting that as a clean result is the worst thing it could do.
    noneVerified: assessed > 0 && verifyErrors === assessed,
    // Either some findings were never assessed, or some were never answered.
    // Either way `score` is an upper bound, not a measurement.
    scoreIsPartial: verifyErrors > 0 || total > assessed,
    verified: assessed - verifyErrors,
  };
}
