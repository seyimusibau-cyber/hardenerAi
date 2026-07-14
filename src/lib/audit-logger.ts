import { createClient } from '@/utils/supabase/server';

// ============================================================================
// Audit Event Types
// ============================================================================
export type AuditEventType =
    | 'AUTH_LOGIN_SUCCESS'
    | 'AUTH_LOGIN_FAILED'
    | 'AUTH_LOGOUT'
    | 'AUTH_SIGNUP_SUCCESS'
    | 'AUTH_SIGNUP_FAILED'
    | 'AUTH_PASSWORD_CHANGE'
    | 'AUTH_PASSWORD_RESET_REQUEST'
    | 'AUTH_PASSWORD_RESET_COMPLETE'
    | 'AUTH_2FA_ENABLED'
    | 'AUTH_2FA_DISABLED'
    | 'AUTH_2FA_VERIFIED'
    | 'AUTH_2FA_FAILED'
    | 'SCAN_INITIATED'
    | 'SCAN_COMPLETED'
    | 'SCAN_FAILED'
    | 'PROFILE_UPDATED'
    | 'PROFILE_DELETED'
    | 'ADMIN_ACTION'
    | 'ADMIN_USER_VIEW'
    | 'ADMIN_SCAN_VIEW'
    | 'RATE_LIMIT_EXCEEDED'
    | 'SSRF_BLOCKED'
    | 'AUTHORIZATION_FAILED'
    | 'CSRF_TOKEN_INVALID'
    | 'SESSION_EXPIRED'
    | 'SESSION_CREATED'
    | 'SUSPICIOUS_ACTIVITY'
    | 'DATA_EXPORT_REQUEST'
    | 'DATA_DELETION_REQUEST';

// ============================================================================
// Audit Log Entry Interface
// ============================================================================
export interface AuditLogEntry {
    event_type: AuditEventType;
    user_id?: string;
    ip_address?: string;
    user_agent?: string;
    resource?: string;
    action?: string;
    status: 'success' | 'failure';
    metadata?: Record<string, unknown>;
    severity?: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// Audit Logger Function
// ============================================================================
export async function logAuditEvent(
    entry: AuditLogEntry,
    request?: Request
): Promise<void> {
    try {
        const supabase = await createClient();
        
        const logEntry = {
            ...entry,
            ip_address: entry.ip_address || request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || 'unknown',
            user_agent: entry.user_agent || request?.headers.get('user-agent') || 'unknown',
            timestamp: new Date().toISOString(),
            severity: entry.severity || determineSeverity(entry.event_type, entry.status)
        };
        
        // Log to database
        const { error } = await supabase.from('audit_logs').insert(logEntry);
        
        if (error) {
            console.error('[AUDIT_LOG_ERROR]', error);
        }
        
        // Also log to console for immediate visibility
        console.log('[AUDIT]', JSON.stringify({
            event_type: logEntry.event_type,
            user_id: logEntry.user_id,
            status: logEntry.status,
            severity: logEntry.severity,
            timestamp: logEntry.timestamp,
            resource: logEntry.resource
        }));
        
        // Alert on critical events
        if (logEntry.severity === 'critical') {
            await alertOnCriticalEvent(logEntry);
        }
    } catch (error) {
        // Don't let audit logging failures break the application
        console.error('[AUDIT_LOG_EXCEPTION]', error);
    }
}

// ============================================================================
// Determine Severity Based on Event Type
// ============================================================================
function determineSeverity(
    eventType: AuditEventType,
    status: 'success' | 'failure'
): 'low' | 'medium' | 'high' | 'critical' {
    // Critical events
    const criticalEvents: AuditEventType[] = [
        'SSRF_BLOCKED',
        'AUTHORIZATION_FAILED',
        'DATA_DELETION_REQUEST',
        'ADMIN_ACTION'
    ];
    
    // High severity events
    const highEvents: AuditEventType[] = [
        'AUTH_LOGIN_FAILED',
        'AUTH_2FA_FAILED',
        'RATE_LIMIT_EXCEEDED',
        'CSRF_TOKEN_INVALID',
        'SUSPICIOUS_ACTIVITY',
        'DATA_EXPORT_REQUEST'
    ];
    
    // Medium severity events
    const mediumEvents: AuditEventType[] = [
        'AUTH_PASSWORD_CHANGE',
        'AUTH_2FA_ENABLED',
        'AUTH_2FA_DISABLED',
        'PROFILE_UPDATED',
        'SCAN_FAILED',
        'SESSION_EXPIRED'
    ];
    
    if (criticalEvents.includes(eventType)) return 'critical';
    if (highEvents.includes(eventType)) return 'high';
    if (mediumEvents.includes(eventType)) return 'medium';
    
    // Failed operations are generally more severe
    if (status === 'failure') {
        return 'medium';
    }
    
    return 'low';
}

// ============================================================================
// Alert on Critical Events
// ============================================================================
async function alertOnCriticalEvent(entry: AuditLogEntry): Promise<void> {
    // In production, send alerts via:
    // - Email
    // - Slack/Discord webhook
    // - PagerDuty
    // - SMS
    
    console.error('[CRITICAL_SECURITY_EVENT]', JSON.stringify({
        event_type: entry.event_type,
        user_id: entry.user_id,
        ip_address: entry.ip_address,
        timestamp: new Date().toISOString(),
        metadata: entry.metadata
    }, null, 2));
    
    // TODO: Implement actual alerting mechanism
    // Example: Send to Slack
    // await fetch(process.env.SLACK_WEBHOOK_URL, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //         text: `🚨 Critical Security Event: ${entry.event_type}`,
    //         attachments: [{
    //             color: 'danger',
    //             fields: [
    //                 { title: 'User ID', value: entry.user_id || 'N/A', short: true },
    //                 { title: 'IP Address', value: entry.ip_address || 'N/A', short: true },
    //                 { title: 'Resource', value: entry.resource || 'N/A', short: true },
    //                 { title: 'Status', value: entry.status, short: true }
    //             ]
    //         }]
    //     })
    // });
}

// ============================================================================
// Convenience Functions for Common Events
// ============================================================================

export async function logLoginAttempt(
    email: string,
    success: boolean,
    userId?: string,
    request?: Request
): Promise<void> {
    await logAuditEvent({
        event_type: success ? 'AUTH_LOGIN_SUCCESS' : 'AUTH_LOGIN_FAILED',
        user_id: userId,
        resource: email,
        status: success ? 'success' : 'failure',
        metadata: { email }
    }, request);
}

export async function logSignupAttempt(
    email: string,
    success: boolean,
    userId?: string,
    request?: Request,
    errorReason?: string
): Promise<void> {
    await logAuditEvent({
        event_type: success ? 'AUTH_SIGNUP_SUCCESS' : 'AUTH_SIGNUP_FAILED',
        user_id: userId,
        resource: email,
        status: success ? 'success' : 'failure',
        metadata: { email, errorReason }
    }, request);
}

export async function logScanOperation(
    userId: string,
    targetUrl: string,
    success: boolean,
    request?: Request,
    metadata?: Record<string, unknown>
): Promise<void> {
    await logAuditEvent({
        event_type: success ? 'SCAN_COMPLETED' : 'SCAN_FAILED',
        user_id: userId,
        resource: targetUrl,
        status: success ? 'success' : 'failure',
        metadata: { targetUrl, ...metadata }
    }, request);
}

export async function logRateLimitExceeded(
    identifier: string,
    request?: Request
): Promise<void> {
    await logAuditEvent({
        event_type: 'RATE_LIMIT_EXCEEDED',
        resource: identifier,
        status: 'failure',
        severity: 'high',
        metadata: { identifier }
    }, request);
}

export async function logSSRFBlocked(
    targetUrl: string,
    reason: string,
    userId?: string,
    request?: Request
): Promise<void> {
    await logAuditEvent({
        event_type: 'SSRF_BLOCKED',
        user_id: userId,
        resource: targetUrl,
        status: 'failure',
        severity: 'critical',
        metadata: { targetUrl, reason }
    }, request);
}

export async function logAuthorizationFailure(
    userId: string,
    resource: string,
    action: string,
    request?: Request
): Promise<void> {
    await logAuditEvent({
        event_type: 'AUTHORIZATION_FAILED',
        user_id: userId,
        resource,
        action,
        status: 'failure',
        severity: 'critical',
        metadata: { resource, action }
    }, request);
}

export async function logAdminAction(
    userId: string,
    action: string,
    resource: string,
    request?: Request,
    metadata?: Record<string, unknown>
): Promise<void> {
    await logAuditEvent({
        event_type: 'ADMIN_ACTION',
        user_id: userId,
        resource,
        action,
        status: 'success',
        severity: 'critical',
        metadata: { action, resource, ...metadata }
    }, request);
}

export async function log2FAEvent(
    userId: string,
    eventType: 'AUTH_2FA_ENABLED' | 'AUTH_2FA_DISABLED' | 'AUTH_2FA_VERIFIED' | 'AUTH_2FA_FAILED',
    success: boolean,
    request?: Request
): Promise<void> {
    await logAuditEvent({
        event_type: eventType,
        user_id: userId,
        status: success ? 'success' : 'failure',
        severity: success ? 'medium' : 'high'
    }, request);
}

// ============================================================================
// Query Audit Logs (for admin dashboard)
// ============================================================================
export interface AuditLogQuery {
    userId?: string;
    eventType?: AuditEventType;
    status?: 'success' | 'failure';
    severity?: 'low' | 'medium' | 'high' | 'critical';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queryAuditLogs(query: AuditLogQuery = {}): Promise<any[]> {
    const supabase = await createClient();
    
    let queryBuilder = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (query.userId) {
        queryBuilder = queryBuilder.eq('user_id', query.userId);
    }
    
    if (query.eventType) {
        queryBuilder = queryBuilder.eq('event_type', query.eventType);
    }
    
    if (query.status) {
        queryBuilder = queryBuilder.eq('status', query.status);
    }
    
    if (query.severity) {
        queryBuilder = queryBuilder.eq('severity', query.severity);
    }
    
    if (query.startDate) {
        queryBuilder = queryBuilder.gte('created_at', query.startDate.toISOString());
    }
    
    if (query.endDate) {
        queryBuilder = queryBuilder.lte('created_at', query.endDate.toISOString());
    }
    
    queryBuilder = queryBuilder.limit(query.limit || 100);
    
    const { data, error } = await queryBuilder;
    
    if (error) {
        console.error('[AUDIT_LOG_QUERY_ERROR]', error);
        return [];
    }
    
    return data || [];
}

// ============================================================================
// Get Audit Statistics
// ============================================================================
export interface AuditStatistics {
    totalEvents: number;
    failedEvents: number;
    criticalEvents: number;
    eventsByType: Record<string, number>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentEvents: any[];
}

export async function getAuditStatistics(
    userId?: string,
    days: number = 7
): Promise<AuditStatistics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const logs = await queryAuditLogs({
        userId,
        startDate,
        limit: 1000
    });
    
    const stats: AuditStatistics = {
        totalEvents: logs.length,
        failedEvents: logs.filter(log => log.status === 'failure').length,
        criticalEvents: logs.filter(log => log.severity === 'critical').length,
        eventsByType: {},
        recentEvents: logs.slice(0, 10)
    };
    
    // Count events by type
    logs.forEach(log => {
        const type = log.event_type;
        stats.eventsByType[type] = (stats.eventsByType[type] || 0) + 1;
    });
    
    return stats;
}
