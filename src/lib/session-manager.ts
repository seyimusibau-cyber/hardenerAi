import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

// ============================================================================
// Session Configuration
// ============================================================================
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CONCURRENT_SESSIONS = 3;
const LAST_ACTIVITY_COOKIE = 'last_activity';

// ============================================================================
// Session Validation Result
// ============================================================================
export interface SessionValidationResult {
    valid: boolean;
    reason?: string;
    userId?: string;
}

// ============================================================================
// Validate Session
// ============================================================================
export async function validateSession(): Promise<SessionValidationResult> {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
            return { valid: false, reason: 'No active session' };
        }
        
        // Check session timeout
        const cookieStore = await cookies();
        const lastActivity = cookieStore.get(LAST_ACTIVITY_COOKIE)?.value;
        
        if (lastActivity) {
            const lastActivityTime = parseInt(lastActivity);
            const now = Date.now();
            
            if (now - lastActivityTime > SESSION_TIMEOUT_MS) {
                await supabase.auth.signOut();
                return { valid: false, reason: 'Session expired due to inactivity' };
            }
        }
        
        // Update last activity
        await updateLastActivity();
        
        // Check concurrent sessions (if session tracking is implemented)
        const concurrentCheck = await checkConcurrentSessions(user.id);
        if (!concurrentCheck.valid) {
            return concurrentCheck;
        }
        
        return { valid: true, userId: user.id };
    } catch (error) {
        console.error('[SESSION_VALIDATION_ERROR]', error);
        return { valid: false, reason: 'Session validation failed' };
    }
}

// ============================================================================
// Update Last Activity
// ============================================================================
export async function updateLastActivity(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(LAST_ACTIVITY_COOKIE, Date.now().toString(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: SESSION_TIMEOUT_MS / 1000,
        path: '/'
    });
}

// ============================================================================
// Check Concurrent Sessions
// ============================================================================
async function checkConcurrentSessions(userId: string): Promise<SessionValidationResult> {
    try {
        const supabase = await createClient();
        
        // Query active sessions from database
        const { data: sessions, error } = await supabase
            .from('user_sessions')
            .select('id')
            .eq('user_id', userId)
            .eq('active', true)
            .gt('expires_at', new Date().toISOString());
        
        if (error) {
            // If table doesn't exist yet, skip this check
            if (error.code === '42P01') {
                return { valid: true, userId };
            }
            console.error('[CONCURRENT_SESSION_CHECK_ERROR]', error);
            return { valid: true, userId }; // Don't block on error
        }
        
        if (sessions && sessions.length > MAX_CONCURRENT_SESSIONS) {
            return { 
                valid: false, 
                reason: 'Maximum concurrent sessions exceeded. Please sign out from other devices.' 
            };
        }
        
        return { valid: true, userId };
    } catch (error) {
        console.error('[CONCURRENT_SESSION_CHECK_EXCEPTION]', error);
        return { valid: true, userId }; // Don't block on error
    }
}

// ============================================================================
// Create Session Record
// ============================================================================
export async function createSessionRecord(
    userId: string,
    request?: Request
): Promise<void> {
    try {
        const supabase = await createClient();
        
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MS);
        
        await supabase.from('user_sessions').insert({
            user_id: userId,
            session_token: sessionToken,
            ip_address: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || null,
            user_agent: request?.headers.get('user-agent') || null,
            active: true,
            expires_at: expiresAt.toISOString()
        });
    } catch (error) {
        // Don't fail if session tracking isn't set up yet
        console.error('[CREATE_SESSION_RECORD_ERROR]', error);
    }
}

// ============================================================================
// Invalidate Session
// ============================================================================
export async function invalidateSession(userId: string, sessionToken?: string): Promise<void> {
    try {
        const supabase = await createClient();
        
        let query = supabase
            .from('user_sessions')
            .update({ active: false })
            .eq('user_id', userId);
        
        if (sessionToken) {
            query = query.eq('session_token', sessionToken);
        }
        
        await query;
        
        // Clear last activity cookie
        const cookieStore = await cookies();
        cookieStore.delete(LAST_ACTIVITY_COOKIE);
    } catch (error) {
        console.error('[INVALIDATE_SESSION_ERROR]', error);
    }
}

// ============================================================================
// Invalidate All User Sessions
// ============================================================================
export async function invalidateAllUserSessions(userId: string): Promise<void> {
    try {
        const supabase = await createClient();
        
        await supabase
            .from('user_sessions')
            .update({ active: false })
            .eq('user_id', userId);
        
        // Sign out from Supabase
        await supabase.auth.signOut();
        
        // Clear cookies
        const cookieStore = await cookies();
        cookieStore.delete(LAST_ACTIVITY_COOKIE);
    } catch (error) {
        console.error('[INVALIDATE_ALL_SESSIONS_ERROR]', error);
    }
}

// ============================================================================
// Get Active Sessions
// ============================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActiveSessions(userId: string): Promise<any[]> {
    try {
        const supabase = await createClient();
        
        const { data: sessions, error } = await supabase
            .from('user_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('active', true)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('[GET_ACTIVE_SESSIONS_ERROR]', error);
            return [];
        }
        
        return sessions || [];
    } catch (error) {
        console.error('[GET_ACTIVE_SESSIONS_EXCEPTION]', error);
        return [];
    }
}

// ============================================================================
// Clean Expired Sessions (run periodically)
// ============================================================================
export async function cleanExpiredSessions(): Promise<void> {
    try {
        const supabase = await createClient();
        
        await supabase
            .from('user_sessions')
            .update({ active: false })
            .lt('expires_at', new Date().toISOString())
            .eq('active', true);
    } catch (error) {
        console.error('[CLEAN_EXPIRED_SESSIONS_ERROR]', error);
    }
}

// ============================================================================
// Session Info
// ============================================================================
export interface SessionInfo {
    userId: string;
    email: string;
    lastActivity: Date;
    expiresAt: Date;
    activeSessions: number;
}

export async function getSessionInfo(): Promise<SessionInfo | null> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) return null;
        
        const cookieStore = await cookies();
        const lastActivity = cookieStore.get(LAST_ACTIVITY_COOKIE)?.value;
        const lastActivityTime = lastActivity ? parseInt(lastActivity) : Date.now();
        
        const activeSessions = await getActiveSessions(user.id);
        
        return {
            userId: user.id,
            email: user.email || '',
            lastActivity: new Date(lastActivityTime),
            expiresAt: new Date(lastActivityTime + SESSION_TIMEOUT_MS),
            activeSessions: activeSessions.length
        };
    } catch (error) {
        console.error('[GET_SESSION_INFO_ERROR]', error);
        return null;
    }
}

// ============================================================================
// Require Valid Session (Middleware Helper)
// ============================================================================
export async function requireValidSession(): Promise<SessionValidationResult> {
    const validation = await validateSession();
    
    if (!validation.valid) {
        // Clear any remaining cookies
        const cookieStore = await cookies();
        cookieStore.delete(LAST_ACTIVITY_COOKIE);
    }
    
    return validation;
}
