-- ============================================================================
-- Security Enhancement Migration
-- Creates tables for audit logging, session management, and 2FA
-- ============================================================================

-- ============================================================================
-- 1. Audit Logs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ip_address TEXT,
    user_agent TEXT,
    resource TEXT,
    action TEXT,
    status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for audit logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX idx_audit_logs_status ON audit_logs(status);

-- RLS Policies for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admins can view all audit logs"
    ON audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs"
    ON audit_logs
    FOR SELECT
    USING (user_id = auth.uid());

-- Service role can insert audit logs (for API)
CREATE POLICY "Service can insert audit logs"
    ON audit_logs
    FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- 2. User Sessions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user_sessions
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_active ON user_sessions(active);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- RLS Policies for user_sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view their own sessions"
    ON user_sessions
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can update their own sessions
CREATE POLICY "Users can update their own sessions"
    ON user_sessions
    FOR UPDATE
    USING (user_id = auth.uid());

-- Service role can manage sessions
CREATE POLICY "Service can manage sessions"
    ON user_sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 3. Update Profiles Table for 2FA
-- ============================================================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS monthly_scans_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_scan_reset TIMESTAMPTZ DEFAULT NOW();

-- Index for 2FA lookups
CREATE INDEX IF NOT EXISTS idx_profiles_two_factor_enabled ON profiles(two_factor_enabled);

-- ============================================================================
-- 4. Function to Clean Expired Sessions
-- ============================================================================
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE user_sessions
    SET active = false
    WHERE expires_at < NOW()
    AND active = true;
END;
$$;

-- ============================================================================
-- 5. Function to Reset Monthly Scan Counts
-- ============================================================================
CREATE OR REPLACE FUNCTION reset_monthly_scans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE profiles
    SET 
        monthly_scans_used = 0,
        last_scan_reset = NOW()
    WHERE last_scan_reset < DATE_TRUNC('month', NOW());
END;
$$;

-- ============================================================================
-- 6. Trigger to Update user_sessions.updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_sessions_updated_at
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. Create Scheduled Jobs (requires pg_cron extension)
-- ============================================================================
-- Note: These require the pg_cron extension to be enabled
-- Run these manually if pg_cron is available:
--
-- SELECT cron.schedule(
--     'clean-expired-sessions',
--     '*/15 * * * *', -- Every 15 minutes
--     'SELECT clean_expired_sessions();'
-- );
--
-- SELECT cron.schedule(
--     'reset-monthly-scans',
--     '0 0 1 * *', -- First day of each month at midnight
--     'SELECT reset_monthly_scans();'
-- );

-- ============================================================================
-- 8. Grant Permissions
-- ============================================================================
-- Grant necessary permissions to authenticated users
GRANT SELECT ON audit_logs TO authenticated;
GRANT SELECT, UPDATE ON user_sessions TO authenticated;
GRANT SELECT, UPDATE ON profiles TO authenticated;

-- Grant service role full access
GRANT ALL ON audit_logs TO service_role;
GRANT ALL ON user_sessions TO service_role;
GRANT ALL ON profiles TO service_role;

-- ============================================================================
-- 9. Comments for Documentation
-- ============================================================================
COMMENT ON TABLE audit_logs IS 'Stores security audit events for compliance and monitoring';
COMMENT ON TABLE user_sessions IS 'Tracks active user sessions for security and concurrent session management';
COMMENT ON COLUMN profiles.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN profiles.two_factor_secret IS 'Encrypted TOTP secret for 2FA (should be encrypted at application level)';
COMMENT ON COLUMN profiles.two_factor_backup_codes IS 'Hashed backup codes for 2FA recovery';
COMMENT ON COLUMN profiles.monthly_scans_used IS 'Number of scans used in current billing period';
COMMENT ON COLUMN profiles.last_scan_reset IS 'Last time the monthly scan counter was reset';
