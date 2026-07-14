import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';
import crypto from 'crypto';

// ============================================================================
// URL Validation Schema
// ============================================================================
export const UrlSchema = z.string()
    .trim()
    .min(1, 'URL is required')
    .max(2048, 'URL too long')
    .refine((url) => {
        try {
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            // Block javascript:, data:, file: protocols
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }, 'Invalid URL format')
    .refine((url) => {
        // Block URLs with credentials
        try {
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            return !parsed.username && !parsed.password;
        } catch {
            return false;
        }
    }, 'URLs with credentials are not allowed');

// ============================================================================
// Email Validation
// ============================================================================
export const EmailSchema = z.string()
    .trim()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .toLowerCase();

// ============================================================================
// Password Validation (server-side enforcement)
// ============================================================================
export const PasswordSchema = z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password too long')
    .refine((pwd) => /[A-Z]/.test(pwd), 'Must contain uppercase letter')
    .refine((pwd) => /[a-z]/.test(pwd), 'Must contain lowercase letter')
    .refine((pwd) => /[0-9]/.test(pwd), 'Must contain number')
    .refine((pwd) => /[^A-Za-z0-9]/.test(pwd), 'Must contain special character');

// ============================================================================
// Name Validation
// ============================================================================
export const NameSchema = z.string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name too long')
    .refine((name) => {
        // Allow letters, spaces, hyphens, apostrophes
        return /^[a-zA-Z\s\-']+$/.test(name);
    }, 'Name contains invalid characters');

// ============================================================================
// UUID Validation
// ============================================================================
export const UuidSchema = z.string().uuid('Invalid UUID format');

// ============================================================================
// Scan Status Validation
// ============================================================================
export const ScanStatusSchema = z.enum(['Running', 'Completed', 'Failed']);

// ============================================================================
// HTML Sanitization for Display
// ============================================================================
export function sanitizeHtml(dirty: string, allowedTags: string[] = []): string {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: allowedTags.length > 0 ? allowedTags : ['b', 'i', 'em', 'strong', 'code', 'pre'],
        ALLOWED_ATTR: []
    });
}

// ============================================================================
// Strip All HTML Tags
// ============================================================================
export function stripHtml(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
    });
}

// ============================================================================
// SQL Parameter Sanitization (use with parameterized queries)
// ============================================================================
export function sanitizeSqlParam(value: unknown): string {
    if (typeof value === 'string') {
        // Remove null bytes and control characters
        return value.replace(/[\x00-\x1F\x7F]/g, '');
    }
    return String(value);
}

// ============================================================================
// File Path Sanitization
// ============================================================================
export function sanitizePath(path: string): string {
    // Remove path traversal attempts and dangerous characters
    return path
        .replace(/\.\./g, '')
        .replace(/[^a-zA-Z0-9_\-./]/g, '')
        .replace(/\/+/g, '/'); // Normalize multiple slashes
}

// ============================================================================
// URL Display Sanitization
// ============================================================================
export function sanitizeUrlForDisplay(url: string): string {
    try {
        const parsed = new URL(url);
        // Only show hostname and path, strip query params and fragments
        return `${parsed.hostname}${parsed.pathname}`;
    } catch {
        return 'Invalid URL';
    }
}

// ============================================================================
// JSON Sanitization
// ============================================================================
export function sanitizeJson(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
        return stripHtml(obj);
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeJson(item));
    }
    
    if (typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeJson(value);
        }
        return sanitized;
    }
    
    return obj;
}

// ============================================================================
// Validate and Sanitize Scan Request
// ============================================================================
export interface ScanRequest {
    url: string;
}

export function validateScanRequest(data: unknown): { 
    success: boolean; 
    data?: ScanRequest; 
    error?: string;
} {
    const schema = z.object({
        url: UrlSchema
    });
    
    const result = schema.safeParse(data);
    
    if (!result.success) {
        return {
            success: false,
            error: result.error.issues[0]?.message || 'Invalid request data'
        };
    }
    
    return {
        success: true,
        data: result.data
    };
}

// ============================================================================
// Validate and Sanitize Login Request
// ============================================================================
export interface LoginRequest {
    email: string;
    password: string;
}

export function validateLoginRequest(data: unknown): {
    success: boolean;
    data?: LoginRequest;
    error?: string;
} {
    const schema = z.object({
        email: EmailSchema,
        password: z.string().min(1, 'Password is required')
    });
    
    const result = schema.safeParse(data);
    
    if (!result.success) {
        return {
            success: false,
            error: result.error.issues[0]?.message || 'Invalid credentials'
        };
    }
    
    return {
        success: true,
        data: result.data
    };
}

// ============================================================================
// Validate and Sanitize Signup Request
// ============================================================================
export interface SignupRequest {
    email: string;
    password: string;
    name: string;
}

export function validateSignupRequest(data: unknown): {
    success: boolean;
    data?: SignupRequest;
    error?: string;
} {
    const schema = z.object({
        email: EmailSchema,
        password: PasswordSchema,
        name: NameSchema
    });
    
    const result = schema.safeParse(data);
    
    if (!result.success) {
        return {
            success: false,
            error: result.error.issues[0]?.message || 'Invalid signup data'
        };
    }
    
    return {
        success: true,
        data: result.data
    };
}

// ============================================================================
// Content Security Policy Nonce Generator
// ============================================================================
export function generateNonce(): string {
    return crypto.randomBytes(16).toString('base64');
}

// ============================================================================
// Safe JSON Parse
// ============================================================================
export function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        return fallback;
    }
}
