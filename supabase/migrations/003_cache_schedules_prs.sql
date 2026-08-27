-- Phase 2/3 support tables.

-- Cross-scan verifier cache: same code fingerprint -> reuse the AI verdict,
-- so re-scanning unchanged code costs zero Gemini calls (cross-cutting: cost).
CREATE TABLE IF NOT EXISTS public.finding_cache (
    fingerprint TEXT PRIMARY KEY,          -- sha256(rule_id | file | normalized snippet)
    verdict JSONB NOT NULL,                -- { is_vulnerability, reasoning, unified_diff, unit_test, estimated_patch_hours }
    hits INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Worker-only (service role). No public RLS policy = no anon/user access.
ALTER TABLE public.finding_cache ENABLE ROW LEVEL SECURITY;

-- Scheduled re-scans (Phase 3). A row here = "re-scan this target every N hours".
CREATE TABLE IF NOT EXISTS public.scheduled_scans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE NOT NULL,
    target_url TEXT NOT NULL,
    interval_hours INTEGER DEFAULT 24 CHECK (interval_hours >= 1),
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active BOOLEAN DEFAULT true,
    notify_slack_webhook TEXT,             -- optional per-schedule alert sink
    notify_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.scheduled_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduled_scans_owner ON public.scheduled_scans;
CREATE POLICY scheduled_scans_owner ON public.scheduled_scans
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Track opened remediation PRs (Phase 3).
CREATE TABLE IF NOT EXISTS public.remediation_prs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    finding_id UUID REFERENCES public.findings (id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE NOT NULL,
    pr_url TEXT,
    pr_number INTEGER,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.remediation_prs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS remediation_prs_owner ON public.remediation_prs;
CREATE POLICY remediation_prs_owner ON public.remediation_prs
    FOR SELECT USING (user_id = auth.uid());

-- Cheap hit counter for the verifier cache (called by the worker; best-effort).
CREATE OR REPLACE FUNCTION public.increment_cache_hit(fp TEXT)
RETURNS void AS $$
  UPDATE public.finding_cache SET hits = hits + 1 WHERE fingerprint = fp;
$$ LANGUAGE sql;
