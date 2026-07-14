import { NextResponse } from 'next/server';
import crypto from 'crypto';

// ============================================================================
// Custom Application Error Class
// ============================================================================
export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public isOperational: boolean = true,
        public details?: unknown
    ) {
        super(message);
        this.name = 'AppError';
        Object.setPrototypeOf(this, AppError.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

// ============================================================================
// Specific Error Types
// ============================================================================
export class ValidationError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 400, true, details);
        this.name = 'ValidationError';
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
        super(message, 401, true);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Insufficient permissions') {
        super(message, 403, true);
        this.name = 'AuthorizationError';
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
        super(message, 404, true);
        this.name = 'NotFoundError';
    }
}

export class RateLimitError extends AppError {
    constructor(message: string = 'Rate limit exceeded', public retryAfter?: number) {
        super(message, 429, true, { retryAfter });
        this.name = 'RateLimitError';
    }
}

export class SSRFError extends AppError {
    constructor(message: string = 'Request blocked for security reasons') {
        super(message, 400, true);
        this.name = 'SSRFError';
    }
}

// ============================================================================
// Error Logger
// ============================================================================
interface ErrorLogEntry {
    errorId: string;
    timestamp: string;
    name: string;
    message: string;
    statusCode: number;
    stack?: string;
    details?: unknown;
    url?: string;
    method?: string;
    userAgent?: string;
    ip?: string;
}

export function logError(error: Error | AppError, request?: Request): string {
    const errorId = crypto.randomUUID();
    
    const logEntry: ErrorLogEntry = {
        errorId,
        timestamp: new Date().toISOString(),
        name: error.name,
        message: error.message,
        statusCode: error instanceof AppError ? error.statusCode : 500,
        stack: error.stack,
        details: error instanceof AppError ? error.details : undefined,
        url: request?.url,
        method: request?.method,
        userAgent: request?.headers.get('user-agent') || undefined,
        ip: request?.headers.get('x-forwarded-for') || undefined
    };
    
    // Log to console (in production, send to logging service like Sentry, DataDog, etc.)
    if (process.env.NODE_ENV === 'production') {
        // Only log essential info in production
        console.error('[ERROR]', JSON.stringify({
            errorId: logEntry.errorId,
            timestamp: logEntry.timestamp,
            name: logEntry.name,
            message: logEntry.message,
            statusCode: logEntry.statusCode,
            url: logEntry.url,
            method: logEntry.method
        }));
    } else {
        // Full details in development
        console.error('[ERROR]', JSON.stringify(logEntry, null, 2));
    }
    
    return errorId;
}

// ============================================================================
// Main Error Handler
// ============================================================================
export function handleError(error: unknown, request?: Request): NextResponse {
    // Log the error and get error ID
    const errorId = logError(
        error instanceof Error ? error : new Error(String(error)),
        request
    );
    
    // Handle known application errors
    if (error instanceof AppError) {
        const response: {
            error: string;
            errorId: string;
            details?: unknown;
            retryAfter?: number;
        } = {
            error: error.message,
            errorId
        };
        
        // Only include details in development
        if (process.env.NODE_ENV === 'development' && error.details) {
            response.details = error.details;
        }
        
        // Add retry-after for rate limit errors
        if (error instanceof RateLimitError && error.retryAfter) {
            response.retryAfter = error.retryAfter;
        }
        
        const headers: Record<string, string> = {};
        if (error instanceof RateLimitError && error.retryAfter) {
            headers['Retry-After'] = error.retryAfter.toString();
        }
        
        return NextResponse.json(response, { 
            status: error.statusCode,
            headers
        });
    }
    
    // Handle unknown errors - don't expose internal details
    return NextResponse.json(
        {
            error: 'An unexpected error occurred. Please try again later.',
            errorId,
            // Only in development
            ...(process.env.NODE_ENV === 'development' && {
                details: error instanceof Error ? error.message : String(error)
            })
        },
        { status: 500 }
    );
}

// ============================================================================
// Async Error Wrapper for API Routes
// ============================================================================
export function asyncHandler(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (request: Request, context?: any) => Promise<NextResponse>
) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (request: Request, context?: any): Promise<NextResponse> => {
        try {
            return await handler(request, context);
        } catch (error) {
            return handleError(error, request);
        }
    };
}

// ============================================================================
// Error Response Helpers
// ============================================================================
export function errorResponse(
    message: string,
    statusCode: number = 400,
    details?: unknown
): NextResponse {
    return NextResponse.json(
        {
            error: message,
            ...(process.env.NODE_ENV === 'development' && details ? { details } : {})
        },
        { status: statusCode }
    );
}

export function successResponse<T>(data: T, statusCode: number = 200): NextResponse {
    return NextResponse.json(data, { status: statusCode });
}

// ============================================================================
// Validation Error Formatter
// ============================================================================
export function formatValidationErrors(errors: Array<{ message: string; path?: string[] }>): string {
    if (errors.length === 1) {
        return errors[0].message;
    }
    
    return errors
        .map(err => {
            const path = err.path?.join('.') || 'field';
            return `${path}: ${err.message}`;
        })
        .join('; ');
}
