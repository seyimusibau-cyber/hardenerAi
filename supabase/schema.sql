-- Hardener Plus Comprehensive Supabase Schema
-- This script contains all tables, views, functions, and RLS policies
-- required for both the public app and the secure Admin Dashboard.

-- 1. Profiles Table (Extended Auth)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users (id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    email TEXT,
    plan TEXT DEFAULT 'Free' CHECK (
        plan IN ('Free', 'Pro', 'Enterprise')
    ),
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status TEXT DEFAULT 'Active' CHECK (
        status IN ('Active', 'Suspended')
    ),
    monthly_scans_used INTEGER DEFAULT 0,
    quota_reset_date DATE DEFAULT CURRENT_DATE + INTERVAL '6 months',
    deep_scan_credits INTEGER DEFAULT 0,
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Recursion-free helper function to check admin roles without triggering infinite loop in policies
CREATE OR REPLACE FUNCTION public.check_user_is_admin(user_id uuid)
RETURNS boolean SECURITY DEFINER AS $$
DECLARE
  is_admin_flag boolean;
BEGIN
  SELECT (role = 'admin') INTO is_admin_flag FROM public.profiles WHERE id = user_id;
  RETURN COALESCE(is_admin_flag, false);
END;
$$ LANGUAGE plpgsql;

CREATE POLICY "Users view own profile or admins view all" ON public.profiles FOR
SELECT USING (auth.uid () = id OR public.check_user_is_admin(auth.uid()));

CREATE POLICY "Users update own profile or admins update all" ON public.profiles FOR
UPDATE USING (auth.uid () = id OR public.check_user_is_admin(auth.uid()));

-- 2. Scans Table
CREATE TABLE public.scans (
    id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
    user_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE NOT NULL,
    target_url TEXT NOT NULL,
    status TEXT DEFAULT 'Running' CHECK (
        status IN (
            'Running',
            'Completed',
            'Failed'
        )
    ),
    progress INTEGER DEFAULT 0,
    vulns_found INTEGER DEFAULT 0,
    time_taken TEXT,
    error_message TEXT,
    score INTEGER,
    grade TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own scans or admins view all" ON public.scans FOR
SELECT USING (auth.uid () = user_id OR public.check_user_is_admin(auth.uid()));

CREATE POLICY "Users insert own scans" ON public.scans FOR
INSERT
WITH
    CHECK (auth.uid () = user_id);

-- 3. Billing Events Table (Stripe Webhook Sync)
CREATE TABLE public.billing_events (
    id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
    user_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    event_type TEXT NOT NULL,
    amount INTEGER, -- stored in cents
    currency TEXT DEFAULT 'usd',
    status TEXT,
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW()
);

-- Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view billing events" ON public.billing_events
FOR SELECT USING (public.is_admin());

-- 4. Admin Audit Logs (Tracks who did what)
CREATE TABLE public.admin_audit_logs (
    id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
    admin_id UUID REFERENCES public.profiles (id) NOT NULL,
    action TEXT NOT NULL,
    target_user_id UUID REFERENCES public.profiles (id),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON public.admin_audit_logs
FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can insert audit logs" ON public.admin_audit_logs
FOR INSERT WITH CHECK (public.is_admin());

-- 5. Admin Scans View (Joins scan with user info for global feed)
CREATE OR REPLACE VIEW public.admin_scans_view AS
SELECT
    s.id AS scan_id,
    s.target_url,
    s.status,
    s.progress,
    s.vulns_found,
    s.time_taken,
    s.error_message,
    s.score,
    s.grade,
    s.created_at,
    p.id AS user_id,
    p.full_name AS user_name,
    p.email AS user_email
FROM public.scans s
    JOIN public.profiles p ON s.user_id = p.id;

-- 6. Executive Dashboard Metrics RPC (Fast Aggregation)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_users INT;
    active_scans INT;
    vulns_today INT;
    mrr_cents INT;
BEGIN
    SELECT COUNT(*) INTO total_users FROM public.profiles;
    
    SELECT COUNT(*) INTO active_scans FROM public.scans WHERE status = 'Running';
    
    SELECT COALESCE(SUM(vulns_found), 0) INTO vulns_today 
    FROM public.scans 
    WHERE created_at >= CURRENT_DATE;

    -- Calculate MRR (simple mock logic: Enterprise = $999/mo, Pro = $49/mo)
    SELECT COALESCE(SUM(
        CASE 
            WHEN plan = 'Enterprise' THEN 99900
            WHEN plan = 'Pro' THEN 4900
            ELSE 0 
        END
    ), 0) INTO mrr_cents 
    FROM public.profiles 
    WHERE status = 'Active';

    RETURN json_build_object(
        'totalUsers', total_users,
        'activeScans', active_scans,
        'vulnerabilitiesFoundToday', vulns_today,
        'mrr', mrr_cents / 100 -- Convert to dollars for UI
    );
END;
$$;

-- 7. Auth Trigger for New User Registrations
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists (for safe re-running)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();