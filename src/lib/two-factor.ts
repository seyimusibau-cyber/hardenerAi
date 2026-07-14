import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';

// ============================================================================
// 2FA Configuration
// ============================================================================
const APP_NAME = process.env.TWO_FACTOR_APP_NAME || 'Hardener+';
const BACKUP_CODES_COUNT = parseInt(process.env.TWO_FACTOR_BACKUP_CODES_COUNT || '10');

// ============================================================================
// Generate 2FA Secret
// ============================================================================
export function generate2FASecret(email: string): {
    secret: string;
    uri: string;
} {
    const secret = new OTPAuth.Secret().base32;
    const totp = new OTPAuth.TOTP({
        issuer: APP_NAME,
        label: email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret)
    });
    
    return {
        secret,
        uri: totp.toString()
    };
}

// ============================================================================
// Generate QR Code
// ============================================================================
export async function generateQRCode(uri: string): Promise<string> {
    try {
        return await QRCode.toDataURL(uri);
    } catch (error) {
        console.error('[2FA_QR_ERROR]', error);
        throw new Error('Failed to generate QR code');
    }
}

// ============================================================================
// Verify 2FA Token
// ============================================================================
export function verify2FAToken(secret: string, token: string): boolean {
    try {
        const totp = new OTPAuth.TOTP({
            issuer: APP_NAME,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(secret)
        });
        
        // Allow 1 period before and after for clock skew
        const delta = totp.validate({ token, window: 1 });
        return delta !== null;
    } catch (error) {
        console.error('[2FA_VERIFY_ERROR]', error);
        return false;
    }
}

// ============================================================================
// Generate Backup Codes
// ============================================================================
export function generateBackupCodes(count: number = BACKUP_CODES_COUNT): {
    codes: string[];
    hashedCodes: string[];
} {
    const codes: string[] = [];
    const hashedCodes: string[] = [];
    
    for (let i = 0; i < count; i++) {
        // Generate 8-character alphanumeric code
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        codes.push(code);
        
        // Hash the code for storage
        const hash = crypto
            .createHash('sha256')
            .update(code)
            .digest('hex');
        hashedCodes.push(hash);
    }
    
    return { codes, hashedCodes };
}

// ============================================================================
// Verify Backup Code
// ============================================================================
export function verifyBackupCode(code: string, hashedCodes: string[]): boolean {
    const hash = crypto
        .createHash('sha256')
        .update(code.toUpperCase())
        .digest('hex');
    
    return hashedCodes.includes(hash);
}

// ============================================================================
// Remove Used Backup Code
// ============================================================================
export function removeBackupCode(code: string, hashedCodes: string[]): string[] {
    const hash = crypto
        .createHash('sha256')
        .update(code.toUpperCase())
        .digest('hex');
    
    return hashedCodes.filter(h => h !== hash);
}

// ============================================================================
// Enable 2FA for User
// ============================================================================
export async function enable2FA(userId: string, secret: string): Promise<{
    success: boolean;
    backupCodes?: string[];
    error?: string;
}> {
    try {
        const supabase = await createClient();
        
        // Generate backup codes
        const { codes, hashedCodes } = generateBackupCodes();
        
        // Update user profile
        const { error } = await supabase
            .from('profiles')
            .update({
                two_factor_enabled: true,
                two_factor_secret: secret,
                two_factor_backup_codes: hashedCodes
            })
            .eq('id', userId);
        
        if (error) {
            console.error('[2FA_ENABLE_ERROR]', error);
            return { success: false, error: 'Failed to enable 2FA' };
        }
        
        return { success: true, backupCodes: codes };
    } catch (error) {
        console.error('[2FA_ENABLE_EXCEPTION]', error);
        return { success: false, error: 'An error occurred while enabling 2FA' };
    }
}

// ============================================================================
// Disable 2FA for User
// ============================================================================
export async function disable2FA(userId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const supabase = await createClient();
        
        const { error } = await supabase
            .from('profiles')
            .update({
                two_factor_enabled: false,
                two_factor_secret: null,
                two_factor_backup_codes: null
            })
            .eq('id', userId);
        
        if (error) {
            console.error('[2FA_DISABLE_ERROR]', error);
            return { success: false, error: 'Failed to disable 2FA' };
        }
        
        return { success: true };
    } catch (error) {
        console.error('[2FA_DISABLE_EXCEPTION]', error);
        return { success: false, error: 'An error occurred while disabling 2FA' };
    }
}

// ============================================================================
// Get User 2FA Status
// ============================================================================
export async function get2FAStatus(userId: string): Promise<{
    enabled: boolean;
    hasBackupCodes: boolean;
    backupCodesRemaining?: number;
}> {
    try {
        const supabase = await createClient();
        
        const { data, error } = await supabase
            .from('profiles')
            .select('two_factor_enabled, two_factor_backup_codes')
            .eq('id', userId)
            .single();
        
        if (error || !data) {
            return { enabled: false, hasBackupCodes: false };
        }
        
        return {
            enabled: data.two_factor_enabled || false,
            hasBackupCodes: Array.isArray(data.two_factor_backup_codes) && data.two_factor_backup_codes.length > 0,
            backupCodesRemaining: Array.isArray(data.two_factor_backup_codes) ? data.two_factor_backup_codes.length : 0
        };
    } catch (error) {
        console.error('[2FA_STATUS_ERROR]', error);
        return { enabled: false, hasBackupCodes: false };
    }
}

// ============================================================================
// Verify 2FA for Login
// ============================================================================
export async function verify2FAForLogin(
    userId: string,
    token: string,
    isBackupCode: boolean = false
): Promise<{
    valid: boolean;
    error?: string;
}> {
    try {
        const supabase = await createClient();
        
        const { data, error } = await supabase
            .from('profiles')
            .select('two_factor_secret, two_factor_backup_codes')
            .eq('id', userId)
            .single();
        
        if (error || !data) {
            return { valid: false, error: 'User not found' };
        }
        
        if (isBackupCode) {
            // Verify backup code
            const backupCodes = data.two_factor_backup_codes || [];
            const isValid = verifyBackupCode(token, backupCodes);
            
            if (isValid) {
                // Remove used backup code
                const updatedCodes = removeBackupCode(token, backupCodes);
                await supabase
                    .from('profiles')
                    .update({ two_factor_backup_codes: updatedCodes })
                    .eq('id', userId);
            }
            
            return { valid: isValid };
        } else {
            // Verify TOTP token
            const secret = data.two_factor_secret;
            if (!secret) {
                return { valid: false, error: '2FA not configured' };
            }
            
            const isValid = verify2FAToken(secret, token);
            return { valid: isValid };
        }
    } catch (error) {
        console.error('[2FA_LOGIN_VERIFY_ERROR]', error);
        return { valid: false, error: 'Verification failed' };
    }
}

// ============================================================================
// Regenerate Backup Codes
// ============================================================================
export async function regenerateBackupCodes(userId: string): Promise<{
    success: boolean;
    backupCodes?: string[];
    error?: string;
}> {
    try {
        const supabase = await createClient();
        
        // Generate new backup codes
        const { codes, hashedCodes } = generateBackupCodes();
        
        // Update user profile
        const { error } = await supabase
            .from('profiles')
            .update({ two_factor_backup_codes: hashedCodes })
            .eq('id', userId);
        
        if (error) {
            console.error('[2FA_REGENERATE_ERROR]', error);
            return { success: false, error: 'Failed to regenerate backup codes' };
        }
        
        return { success: true, backupCodes: codes };
    } catch (error) {
        console.error('[2FA_REGENERATE_EXCEPTION]', error);
        return { success: false, error: 'An error occurred while regenerating backup codes' };
    }
}
