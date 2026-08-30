-- Why a patch is unproven, in words.
--
-- `patch_validated` used to mean "the generated test passed after applying the
-- patch", which credited a test that would have passed anyway. It now means the
-- test FAILED before the patch and PASSED after it — the only sequence that
-- shows the patch changed the outcome. Under the old rule a vacuous generated
-- test marked a non-fix as validated; on real published defects, patches applied
-- cleanly 8 times out of 12 and repaired the defect zero times.
--
-- The stricter rule makes `false` much more common, and `false` alone does not
-- distinguish "we could not run a test for this language" from "the patch does
-- not fix it". This column carries that distinction so the dashboard can tell a
-- user which one they are looking at.
ALTER TABLE public.findings
    ADD COLUMN IF NOT EXISTS patch_validation_note TEXT;

COMMENT ON COLUMN public.findings.patch_validated IS
    'Test failed before the patch and passed after it. Proof the defect was repaired.';
COMMENT ON COLUMN public.findings.patch_applies IS
    'Diff applies cleanly. NOT evidence of a fix on its own.';
COMMENT ON COLUMN public.findings.patch_validation_note IS
    'Why the patch is unproven, when patch_validated is false.';
