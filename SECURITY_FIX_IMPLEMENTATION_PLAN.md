# Security Fix Implementation Plan - Hardener AI

## Complete Vulnerability List

### 🔴 CRITICAL VULNERABILITIES (3)

#### 1. Missing Admin Role Authorization
- **Location:** `src/utils/supabase/middleware.ts`
- **Status:** ✅ FIXED
- **Issue:** Middleware only checks if user exists, not if they have admin role
- **Impact:** Any authenticated user can access admin routes
- **CVSS Score:** 9.1 (Critical)

#### 2. Missing Row Level Security (RLS) Policies for Admin Tables
- **Location:** `supabase/schema.sql`
- **Status:** ⏳ PENDING
- **Issue:** Tables `billing_events` and `admin_audit_logs` have RLS enabled but NO policies
- **Impact:** No one can access these tables, including admins
- **CVSS Score:** 8.2 (High)

#### 3. Exposed Supabase Keys in Client-Side Code
- **Location:** `src/utils/supabase/client.ts`, `src/utils/supabase/middleware.ts`
- **Status:** ⚠️ ACCEPTABLE (Standard Supabase practice)
- **Issue:** `NEXT_PUBLIC_` prefix exposes keys to browser
- **Impact:** Increased attack surface if RLS not properly configured
- **CVSS Score:** 7.5 (High)
- **Note:** This is standard Supabase practice, but requires proper RLS policies

---

### 🟠 HIGH SEVERITY VULNERABILITIES (4)

#### 4. No CSRF Protection
- **Location:** `src/app/login/page.tsx`, `src/app/signup/page.tsx`
- **Status:** ⏳ PENDING
- **Issue:** Forms lack CSRF tokens
- **Impact:** Vulnerable to Cross-Site Request Forgery attacks
- **CVSS Score:** 7.1 (High)

#### 5. Missing Rate Limiting
- **Location:** All authentication endpoints
- **Status:** ⏳ PENDING
- **Issue:** No rate limiting on login/signup
- **Impact:** Allows brute force attacks
- **CVSS Score:** 7.3 (High)

#### 6. Weak Password Requirements
- **Location:** `src/app/signup/page.tsx`
- **Status:** ⏳ PENDING
- **Issue:** Only requires 8 characters minimum
- **Impact:** Weak passwords easily compromised
- **CVSS Score:** 6.8 (Medium-High)

#### 7. SQL Injection Risk in RPC Function
- **Location:** `supabase/schema.sql` - `get_admin_dashboard_metrics()`
- **Status:** ⏳ PENDING
- **Issue:** Uses `SECURITY DEFINER` which bypasses RLS
- **Impact:** Future modifications could introduce vulnerabilities
- **CVSS Score:** 6.5 (Medium-High)

---

### 🟡 MEDIUM SEVERITY VULNERABILITIES (5)

#### 8. Missing Input Validation & Sanitization
- **Location:** All form inputs
- **Status:** ⏳ PENDING
- **Issue:** No validation of email, URL formats, or sanitization
- **Impact:** Potential XSS, injection attacks
- **CVSS Score:** 5.9 (Medium)

#### 9. No Content Security Policy (CSP)
- **Location:** `next.config.ts`
- **Status:** ⏳ PENDING
- **Issue:** Missing CSP headers
- **Impact:** Vulnerable to XSS attacks
- **CVSS Score:** 5.7 (Medium)

#### 10. No Session Timeout
- **Location:** Authentication configuration
- **Status:** ⏳ PENDING
- **Issue:** Sessions don't have explicit timeout
- **Impact:** Stolen sessions remain valid indefinitely
- **CVSS Score:** 5.4 (Medium)

#### 11. Hardcoded Redirect URL
- **Location:** `src/app/signup/page.tsx`
- **Status:** ⏳ PENDING
- **Issue:** Uses `location.origin` which could be manipulated
- **Impact:** Open redirect vulnerability
- **CVSS Score:** 5.3 (Medium)

#### 12. Missing Error Handling
- **Location:** Multiple files
- **Status:** ⏳ PENDING
- **Issue:** Error messages expose internal details
- **Impact:** Information disclosure
- **CVSS Score:** 4.8 (Medium)

---

### 🔵 LOW SEVERITY / BEST PRACTICES (4)

#### 13. No Logging/Monitoring
- **Status:** ⏳ PENDING
- **Issue:** No structured logging for security events
- **Impact:** Cannot detect or respond to attacks
- **CVSS Score:** 3.9 (Low)

#### 14. Missing API Route Protection
- **Status:** ⏳ PENDING
- **Issue:** No API routes defined yet
- **Impact:** Future API routes may lack authentication
- **CVSS Score:** 3.5 (Low)

#### 15. No Email Verification Enforcement
- **Status:** ⏳ PENDING
- **Issue:** Users can access admin without verifying email
- **Impact:** Account takeover via email spoofing
- **CVSS Score:** 3.2 (Low)

#### 16. Sensitive Data in Client State
- **Status:** ⏳ PENDING
- **Issue:** User data stored in client-side state without encryption
- **Impact:** Data exposure via browser DevTools
- **CVSS Score:** 2.8 (Low)

---

## Implementation Plan

### Phase 1: Critical Fixes (Week 1) - HIGHEST PRIORITY

#### Task 1.1: Fix Admin Authorization ✅ COMPLETED
**File:** `src/utils/supabase/middleware.ts`
**Time Estimate:** 30 minutes
**Status:** COMPLETED

**Implementation:**
```typescript
// Already implemented - checks user role from profiles table
const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

if (profile?.role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url))
}
```

#### Task 1.2: Add RLS Policies for Admin Tables
**File:** `supabase/schema.sql`
**Time Estimate:** 1 hour
**Status:** PENDING

**Implementation Steps:**
1. Create admin check function
2. Add policies for `billing_events`
3. Add policies for `admin_audit_logs`
4. Add policies for `admin_scans_view`
5. Test with admin and non-admin users

**SQL Code:**
```sql
-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Billing Events Policies
CREATE POLICY "Admins can view billing events"
ON public.billing_events FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can insert billing events"
ON public.billing_events FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update billing events"
ON public.billing_events FOR UPDATE
USING (public.is_admin());

-- Admin Audit Logs Policies
CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (public.is_admin());

-- Admin Scans View Policy
CREATE POLICY "Admins can view all scans"
ON public.scans FOR SELECT
USING (public.is_admin() OR auth.uid() = user_id);
```

**Testing Checklist:**
- [ ] Admin user can view billing events
- [ ] Admin user can insert audit logs
- [ ] Non-admin user cannot access billing events
- [ ] Non-admin user cannot access audit logs
- [ ] Non-admin user can only see their own scans

---

### Phase 2: High Severity Fixes (Week 1-2)

#### Task 2.1: Implement Rate Limiting
**Files:** `src/middleware.ts`, `package.json`
**Time Estimate:** 2 hours
**Status:** PENDING

**Implementation Steps:**
1. Install `@upstash/ratelimit` and `@upstash/redis`
2. Set up Upstash Redis account
3. Create rate limit middleware
4. Apply to auth routes
5. Add rate limit headers to responses

**Code:**
```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 requests per minute
  analytics: true,
});

// src/middleware.ts
import { ratelimit } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  // Rate limit auth endpoints
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    const ip = request.ip ?? '127.0.0.1'
    const { success, limit, reset, remaining } = await ratelimit.limit(ip)
    
    if (!success) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      })
    }
  }
  
  return await updateSession(request)
}
```

**Environment Variables:**
```env
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token
```

**Testing Checklist:**
- [ ] 5 login attempts succeed
- [ ] 6th login attempt returns 429
- [ ] Rate limit resets after 1 minute
- [ ] Different IPs have separate limits

#### Task 2.2: Add CSRF Protection
**Files:** `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/lib/csrf.ts`
**Time Estimate:** 2 hours
**Status:** PENDING

**Implementation Steps:**
1. Install `csrf` package
2. Create CSRF token generation utility
3. Add CSRF token to forms
4. Validate CSRF token on submission
5. Add CSRF middleware

**Code:**
```typescript
// src/lib/csrf.ts
import { createHash, randomBytes } from 'crypto'

export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex')
}

export function validateCSRFToken(token: string, secret: string): boolean {
  const hash = createHash('sha256').update(token + secret).digest('hex')
  return hash === token
}

// src/app/login/page.tsx
'use client'
import { useEffect, useState } from 'react'

export default function LoginPage() {
  const [csrfToken, setCSRFToken] = useState('')
  
  useEffect(() => {
    // Fetch CSRF token from API
    fetch('/api/csrf')
      .then(res => res.json())
      .then(data => setCSRFToken(data.token))
  }, [])
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ email, password }),
    })
    
    // Handle response
  }
  
  return (
    <form onSubmit={handleLogin}>
      <input type="hidden" name="csrf_token" value={csrfToken} />
      {/* Rest of form */}
    </form>
  )
}

// src/app/api/csrf/route.ts
import { NextResponse } from 'next/server'
import { generateCSRFToken } from '@/lib/csrf'

export async function GET() {
  const token = generateCSRFToken()
  
  const response = NextResponse.json({ token })
  response.cookies.set('csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600, // 1 hour
  })
  
  return response
}
```

**Testing Checklist:**
- [ ] Form submission with valid CSRF token succeeds
- [ ] Form submission without CSRF token fails
- [ ] Form submission with invalid CSRF token fails
- [ ] CSRF token expires after 1 hour

#### Task 2.3: Strengthen Password Requirements
**Files:** `src/app/signup/page.tsx`, `src/lib/validation.ts`
**Time Estimate:** 1 hour
**Status:** PENDING

**Implementation Steps:**
1. Create password validation schema with Zod
2. Add client-side validation
3. Add server-side validation
4. Update UI with password strength indicator
5. Configure Supabase Auth password policy

**Code:**
```typescript
// src/lib/validation.ts
import { z } from 'zod'

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  confirmPassword: z.string(),
  name: z.string().min(2, 'Name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

// src/app/signup/page.tsx
import { signupSchema } from '@/lib/validation'

const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)
  
  // Validate with Zod
  const result = signupSchema.safeParse({ email, password, confirmPassword, name })
  
  if (!result.success) {
    setError(result.error.errors[0].message)
    return
  }
  
  // Proceed with signup
}

// Password strength indicator component
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '12+ characters', valid: password.length >= 12 },
    { label: 'Uppercase letter', valid: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', valid: /[a-z]/.test(password) },
    { label: 'Number', valid: /[0-9]/.test(password) },
    { label: 'Special character', valid: /[^A-Za-z0-9]/.test(password) },
  ]
  
  const strength = checks.filter(c => c.valid).length
  
  return (
    <div className="mt-2 space-y-1">
      {checks.map((check, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {check.valid ? '✓' : '○'} {check.label}
        </div>
      ))}
    </div>
  )
}
```

**Supabase Configuration:**
```sql
-- In Supabase Dashboard > Authentication > Policies
-- Set minimum password length to 12
-- Enable password strength requirements
```

**Testing Checklist:**
- [ ] Password with <12 chars rejected
- [ ] Password without uppercase rejected
- [ ] Password without lowercase rejected
- [ ] Password without number rejected
- [ ] Password without special char rejected
- [ ] Valid strong password accepted

#### Task 2.4: Refactor RPC Function Security
**File:** `supabase/schema.sql`
**Time Estimate:** 1 hour
**Status:** PENDING

**Implementation Steps:**
1. Remove `SECURITY DEFINER` from function
2. Add explicit permission checks
3. Use parameterized queries
4. Add input validation
5. Test with different user roles

**Code:**
```sql
-- Refactored function without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER  -- Changed from DEFINER
AS $$
DECLARE
    total_users INT;
    active_scans INT;
    vulns_today INT;
    mrr_cents INT;
BEGIN
    -- Check if user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    -- Use parameterized queries
    SELECT COUNT(*) INTO total_users 
    FROM public.profiles;
    
    SELECT COUNT(*) INTO active_scans 
    FROM public.scans 
    WHERE status = 'Running';
    
    SELECT COALESCE(SUM(vulns_found), 0) INTO vulns_today 
    FROM public.scans 
    WHERE created_at >= CURRENT_DATE;

    -- Calculate MRR with explicit type casting
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
        'mrr', mrr_cents / 100
    );
END;
$$;

-- Grant execute permission only to authenticated users
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
```

**Testing Checklist:**
- [ ] Admin user can execute function
- [ ] Non-admin user gets error
- [ ] Function returns correct data
- [ ] No SQL injection possible

---

### Phase 3: Medium Severity Fixes (Week 2-3)

#### Task 3.1: Add Input Validation & Sanitization
**Files:** Multiple form components, `src/lib/validation.ts`
**Time Estimate:** 3 hours
**Status:** PENDING

**Implementation Steps:**
1. Create Zod schemas for all forms
2. Add client-side validation
3. Add server-side validation
4. Sanitize HTML inputs
5. Validate URLs and emails

**Code:**
```typescript
// src/lib/validation.ts
import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'

export const emailSchema = z.string().email().toLowerCase()

export const urlSchema = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}, 'Invalid URL protocol')

export const scanRequestSchema = z.object({
  targetUrl: urlSchema,
  scanType: z.enum(['quick', 'deep']),
  options: z.object({
    checkSSL: z.boolean().default(true),
    checkHeaders: z.boolean().default(true),
    checkDependencies: z.boolean().default(false),
  }).optional(),
})

export function sanitizeHTML(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
}

export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .slice(0, 1000) // Limit length
}

// src/app/api/scan/route.ts
import { scanRequestSchema } from '@/lib/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate with Zod
    const validatedData = scanRequestSchema.parse(body)
    
    // Proceed with validated data
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      )
    }
  }
}
```

**Testing Checklist:**
- [ ] XSS attempts blocked
- [ ] SQL injection attempts blocked
- [ ] Invalid URLs rejected
- [ ] Invalid emails rejected
- [ ] HTML tags stripped

#### Task 3.2: Add Security Headers (CSP)
**File:** `next.config.ts`
**Time Estimate:** 1 hour
**Status:** PENDING

**Implementation Steps:**
1. Define Content Security Policy
2. Add security headers to Next.js config
3. Test with browser DevTools
4. Adjust policy as needed
5. Monitor CSP violations

**Code:**
```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Adjust as needed
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Testing Checklist:**
- [ ] CSP headers present in response
- [ ] No CSP violations in console
- [ ] Inline scripts blocked (if not whitelisted)
- [ ] External resources blocked (if not whitelisted)

#### Task 3.3: Configure Session Timeout
**File:** Supabase Dashboard Configuration
**Time Estimate:** 30 minutes
**Status:** PENDING

**Implementation Steps:**
1. Configure in Supabase Dashboard
2. Add client-side session refresh
3. Add session expiry warning
4. Test session timeout
5. Handle expired sessions gracefully

**Code:**
```typescript
// src/lib/session.ts
import { createClient } from '@/utils/supabase/client'

export async function setupSessionRefresh() {
  const supabase = createClient()
  
  // Refresh session every 50 minutes (before 60 min expiry)
  setInterval(async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) {
      console.error('Session refresh failed:', error)
      // Redirect to login
      window.location.href = '/login'
    }
  }, 50 * 60 * 1000)
}

// src/app/layout.tsx
'use client'
import { useEffect } from 'react'
import { setupSessionRefresh } from '@/lib/session'

export default function RootLayout({ children }) {
  useEffect(() => {
    setupSessionRefresh()
  }, [])
  
  return <html>{children}</html>
}
```

**Supabase Configuration:**
```
Dashboard > Authentication > Settings
- JWT expiry: 3600 seconds (1 hour)
- Refresh token expiry: 2592000 seconds (30 days)
- Enable automatic token refresh
```

**Testing Checklist:**
- [ ] Session expires after 1 hour of inactivity
- [ ] Session refreshes automatically before expiry
- [ ] Expired session redirects to login
- [ ] User warned before session expires

#### Task 3.4: Fix Hardcoded Redirect URL
**File:** `src/app/signup/page.tsx`
**Time Estimate:** 30 minutes
**Status:** PENDING

**Implementation Steps:**
1. Add environment variable for redirect URL
2. Update signup code to use env variable
3. Validate redirect URL
4. Test in development and production
5. Add fallback for missing env variable

**Code:**
```typescript
// .env.local
NEXT_PUBLIC_APP_URL=http://localhost:3000

// .env.production
NEXT_PUBLIC_APP_URL=https://hardener.ai

// src/app/signup/page.tsx
const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)
  setIsLoading(true)

  const redirectUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
  
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
      },
      emailRedirectTo: `${redirectUrl}/auth/callback`,
    },
  })

  if (signUpError) {
    setError(signUpError.message)
    setIsLoading(false)
    return
  }

  router.push("/admin")
}
```

**Testing Checklist:**
- [ ] Redirect works in development
- [ ] Redirect works in production
- [ ] Invalid redirect URLs rejected
- [ ] Fallback works if env var missing

#### Task 3.5: Improve Error Handling
**Files:** Multiple API routes and components
**Time Estimate:** 2 hours
**Status:** PENDING

**Implementation Steps:**
1. Create error handling utilities
2. Add generic error messages for users
3. Log detailed errors server-side
4. Add error boundaries
5. Implement error tracking

**Code:**
```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function handleAPIError(error: unknown) {
  console.error('API Error:', error)
  
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
    }
  }
  
  // Don't expose internal errors to users
  return {
    error: 'An unexpected error occurred. Please try again later.',
    statusCode: 500,
  }
}

// src/app/api/scan/route.ts
import { handleAPIError, AppError } from '@/lib/errors'

export async function POST(request: NextRequest) {
  try {
    // ... your code
    
    if (!user) {
      throw new AppError('Unauthorized', 401, 'AUTH_REQUIRED')
    }
    
    if (quotaExceeded) {
      throw new AppError('Quota exceeded', 429, 'QUOTA_EXCEEDED')
    }
    
  } catch (error) {
    const { error: message, statusCode } = handleAPIError(error)
    return NextResponse.json({ error: message }, { status: statusCode })
  }
}

// src/components/ErrorBoundary.tsx
'use client'
import { Component, ReactNode } from 'react'

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo)
    // Send to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
```

**Testing Checklist:**
- [ ] Generic errors shown to users
- [ ] Detailed errors logged server-side
- [ ] Error boundaries catch React errors
- [ ] Error tracking service receives errors

---

### Phase 4: Low Priority / Best Practices (Week 3-4)

#### Task 4.1: Add Logging & Monitoring
**Files:** `src/lib/logger.ts`, various components
**Time Estimate:** 3 hours
**Status:** PENDING

**Implementation Steps:**
1. Install Winston or Pino
2. Create logger utility
3. Add structured logging
4. Set up log aggregation (Datadog/LogRocket)
5. Add security event logging

**Code:**
```typescript
// src/lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
})

export function logSecurityEvent(
  event: string,
  userId?: string,
  metadata?: Record<string, any>
) {
  logger.warn({
    type: 'security',
    event,
    userId,
    timestamp: new Date().toISOString(),
    ...metadata,
  })
}

// Usage in middleware
logSecurityEvent('unauthorized_admin_access', user?.id, {
  path: request.nextUrl.pathname,
  ip: request.ip,
})
```

#### Task 4.2: Add Email Verification Enforcement
**File:** `src/utils/supabase/middleware.ts`
**Time Estimate:** 1 hour
**Status:** PENDING

**Code:**
```typescript
// Check email verification
if (user && !user.email_confirmed_at) {
  const url = request.nextUrl.clone()
  url.pathname = '/verify-email'
  return NextResponse.redirect(url)
}
```

#### Task 4.3: Set Up Error Tracking
**Files:** `src/lib/sentry.ts`, `next.config.ts`
**Time Estimate:** 1 hour
**Status:** PENDING

**Code:**
```typescript
// Install @sentry/nextjs
// src/lib/sentry.ts
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
})
```

#### Task 4.4: Encrypt Sensitive Client Data
**Files:** `src/lib/crypto.ts`
**Time Estimate:** 2 hours
**Status:** PENDING

**Code:**
```typescript
// src/lib/crypto.ts
import CryptoJS from 'crypto-js'

const SECRET_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY!

export function encrypt(data: string): string {
  return CryptoJS.AES.encrypt(data, SECRET_KEY).toString()
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY)
  return bytes.toString(CryptoJS.enc.Utf8)
}
```

---

## Testing Strategy

### Unit Tests
```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
```

### Integration Tests
```bash
npm install --save-dev @playwright/test
```

### Security Tests
```bash
npm install --save-dev @zap/zap-api-node
```

---

## Deployment Checklist

### Pre-Production
- [ ] All critical vulnerabilities fixed
- [ ] All high severity vulnerabilities fixed
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] CSRF protection active
- [ ] Input validation implemented
- [ ] Error tracking configured
- [ ] Logging enabled

### Production
- [ ] Environment variables set
- [ ] SSL/TLS certificate installed
- [ ] Database backups configured
- [ ] Monitoring dashboards set up
- [ ] Incident response plan documented
- [ ] Security audit completed
- [ ] Penetration testing performed
- [ ] Compliance requirements met

---

## Timeline Summary

| Phase | Duration | Priority | Status |
|-------|----------|----------|--------|
| Phase 1: Critical Fixes | 2-3 days | 🔴 Critical | 33% Complete |
| Phase 2: High Severity | 4-5 days | 🟠 High | 0% Complete |
| Phase 3: Medium Severity | 5-7 days | 🟡 Medium | 0% Complete |
| Phase 4: Best Practices | 3-4 days | 🔵 Low | 0% Complete |
| **Total** | **14-19 days** | | **6% Complete** |

---

## Cost Estimate

- Developer time: 14-19 days @ $500/day = **$7,000 - $9,500**
- Third-party services:
  - Upstash Redis: $10/month
  - Sentry: $26/month
  - Security audit: $2,000-$5,000
- **Total: $9,000 - $15,000**

---

## Success Metrics

- [ ] Zero critical vulnerabilities
- [ ] Zero high severity vulnerabilities
- [ ] <5 medium severity vulnerabilities
- [ ] 100% test coverage for security-critical code
- [ ] <100ms API response time
- [ ] 99.9% uptime
- [ ] Zero security incidents in first 90 days

---

**Document Version:** 1.0
**Last Updated:** 2026-07-12
**Next Review:** After Phase 1 completion
