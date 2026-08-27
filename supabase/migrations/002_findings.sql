-- Phase 1: per-finding storage. The scans row holds only ONE diff/test; a real
-- scan produces many findings. This table is the source of truth; scans keeps a
-- headline patch + aggregate for the existing dashboard view.

CREATE TABLE IF NOT EXISTS public.findings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    scan_id UUID REFERENCES public.scans (id) ON DELETE CASCADE NOT NULL,
    rule_id TEXT,
    severity TEXT,                    -- semgrep level: error | warning | note
    file_path TEXT,
    start_line INTEGER,
    message TEXT,
    code_snippet TEXT,
    is_vulnerability BOOLEAN DEFAULT false,   -- AI verdict (false = false positive)
    reasoning TEXT,
    unified_diff TEXT,
    unit_test TEXT,
    estimated_patch_hours INTEGER DEFAULT 0,
    patch_applies BOOLEAN DEFAULT false,      -- diff applies cleanly (git apply --check)
    patch_validated BOOLEAN DEFAULT false,    -- generated test passed after applying
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS findings_scan_id_idx ON public.findings (scan_id);

ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

-- Owners can read findings for their own scans. The worker writes with the
-- service role, which bypasses RLS, so no insert policy is needed here.
DROP POLICY IF EXISTS findings_owner_select ON public.findings;
CREATE POLICY findings_owner_select ON public.findings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.scans s
            WHERE s.id = findings.scan_id AND s.user_id = auth.uid()
        )
    );
