/**
 * High-deliverability transactional email service for Vultix.
 * Handles password resets, security notifications, and account alerts.
 */

interface SendPasswordResetEmailParams {
    email: string;
    resetLink: string;
    ipAddress?: string;
    userAgent?: string;
}

interface EmailResult {
    success: boolean;
    id?: string;
    error?: string;
    provider: 'resend' | 'fallback';
}

/**
 * Builds a clean, responsive, dark-mode transactional HTML email.
 * Designed to maximize inbox placement across Gmail, Outlook, and Apple Mail.
 */
function buildPasswordResetHtml(params: {
    email: string;
    resetLink: string;
    expiresInMinutes?: number;
    ipAddress?: string;
}): string {
    const { email, resetLink, expiresInMinutes = 60, ipAddress } = params;
    const year = new Date().getFullYear();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Vultix Password</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #030712;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #030712;
      padding-bottom: 40px;
    }
    .main {
      background-color: #0f172a;
      margin: 0 auto;
      width: 100%;
      max-width: 580px;
      border-spacing: 0;
      border-radius: 12px;
      border: 1px solid #1e293b;
      overflow: hidden;
    }
    .header {
      padding: 32px 40px 24px;
      text-align: left;
      border-bottom: 1px solid #1e293b;
      background: linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(15, 23, 42, 0) 100%);
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      text-decoration: none;
      letter-spacing: -0.5px;
    }
    .brand-accent {
      color: #10b981;
    }
    .content {
      padding: 36px 40px;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 16px;
      letter-spacing: -0.3px;
    }
    .text {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 24px;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      background-color: #10b981;
      color: #022c22 !important;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      display: inline-block;
      letter-spacing: 0.2px;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
    }
    .security-notice {
      background-color: #020617;
      border: 1px solid #1e293b;
      border-left: 3px solid #10b981;
      border-radius: 6px;
      padding: 16px;
      margin: 28px 0;
    }
    .security-title {
      font-size: 12px;
      font-weight: 700;
      color: #f1f5f9;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 6px;
    }
    .security-text {
      font-size: 12px;
      line-height: 1.5;
      color: #64748b;
      margin: 0;
    }
    .fallback-link {
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
      margin-top: 24px;
      line-height: 1.5;
    }
    .fallback-link a {
      color: #10b981;
      text-decoration: none;
    }
    .footer {
      padding: 24px 40px;
      text-align: center;
      font-size: 11px;
      color: #475569;
      border-top: 1px solid #1e293b;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 32px;">
      <tr>
        <td align="center">
          <table class="main" role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td class="header">
                <span class="brand">Vult<span class="brand-accent">ix</span></span>
                <span style="font-size: 11px; color: #64748b; margin-left: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Security</span>
              </td>
            </tr>
            <tr>
              <td class="content">
                <h1 class="title">Password Reset Request</h1>
                <p class="text">
                  We received a request to reset the password for your Vultix account (<strong>${esc(email)}</strong>).
                </p>
                <p class="text">
                  To securely update your credentials, click the confirmation button below.
                </p>
                <div class="button-container">
                  <a href="${esc(resetLink)}" target="_blank" class="button">Reset Password</a>
                </div>
                <div class="security-notice">
                  <div class="security-title">Security Information</div>
                  <p class="security-text">
                    &bull; This link expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.<br>
                    &bull; If you did not make this request, you can safely disregard this email. Your current password remains secure.<br>
                    ${ipAddress ? `&bull; Request origin IP: <code>${esc(ipAddress)}</code>` : ''}
                  </p>
                </div>
                <div class="fallback-link">
                  If the button above does not work, copy and paste this link into your browser:<br>
                  <a href="${esc(resetLink)}" target="_blank">${esc(resetLink)}</a>
                </div>
              </td>
            </tr>
            <tr>
              <td class="footer">
                &copy; ${year} Vultix Automated Security Platform. All rights reserved.<br>
                This automated message was sent to ${esc(email)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/**
 * Builds the plain text version of the password reset email.
 */
function buildPasswordResetText(params: {
    email: string;
    resetLink: string;
    expiresInMinutes?: number;
}): string {
    const { email, resetLink, expiresInMinutes = 60 } = params;
    return `Vultix Security - Password Reset Request

We received a request to reset the password for your Vultix account (${email}).

To choose a new password, open this link in your browser:
${resetLink}

Security Information:
- This link expires in ${expiresInMinutes} minutes and can only be used once.
- If you did not request this, you can safely ignore this email. Your credentials remain secure.

© ${new Date().getFullYear()} Vultix Security Platform.
`;
}

/**
 * Sends a password reset email via Resend if RESEND_API_KEY is configured.
 * Configured with RFC 8058 compliant headers to ensure high inbox deliverability.
 */

/**
 * Escape a value before it goes into an HTML email.
 *
 * `ipAddress` reaches here from the X-Forwarded-For header, which a client can
 * set. Interpolated raw, a crafted header injects arbitrary markup into an
 * email that is sent to a NAMED recipient and passes SPF, DKIM and DMARC —
 * a phishing message that is genuinely from vultix.co.uk. `email` is
 * attacker-chosen too, and only weakly validated upstream.
 *
 * Whether the platform lets XFF through varies by host, so this is defence in
 * depth rather than a patch for a confirmed path — and it costs one call.
 */
function esc(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export async function sendPasswordResetEmail(
    params: SendPasswordResetEmailParams
): Promise<EmailResult> {
    const { email, resetLink, ipAddress } = params;
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        return {
            success: false,
            error: 'RESEND_API_KEY is not configured',
            provider: 'fallback',
        };
    }

    const fromAddress =
        process.env.ALERT_FROM_EMAIL ||
        process.env.EMAIL_FROM ||
        'Vultix Security <security@vultix.co.uk>';

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromAddress,
                to: [email],
                subject: 'Reset your Vultix password',
                html: buildPasswordResetHtml({ email, resetLink, ipAddress }),
                text: buildPasswordResetText({ email, resetLink }),
                headers: {
                    'X-Entity-Ref-ID': `vultix-pwd-reset-${Date.now()}`,
                },
            }),
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            const errorMessage =
                errorData?.message || `Resend API returned status ${res.status}`;
            console.error('[Email Engine] Resend delivery failed:', errorMessage);
            return {
                success: false,
                error: errorMessage,
                provider: 'resend',
            };
        }

        const data = await res.json();
        return {
            success: true,
            id: data.id,
            provider: 'resend',
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown network error';
        console.error('[Email Engine] Network error sending email:', message);
        return {
            success: false,
            error: message,
            provider: 'resend',
        };
    }
}

interface SendSignupConfirmationEmailParams {
    email: string;
    confirmLink: string;
}

/**
 * Builds the HTML template for account registration / email verification.
 */
export function buildSignupConfirmationHtml(params: {
    email: string;
    confirmLink: string;
}): string {
    const { email, confirmLink } = params;
    const year = new Date().getFullYear();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Vultix Account</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #030712;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #030712;
      padding-bottom: 40px;
    }
    .main {
      background-color: #0f172a;
      margin: 0 auto;
      width: 100%;
      max-width: 580px;
      border-spacing: 0;
      border-radius: 12px;
      border: 1px solid #1e293b;
      overflow: hidden;
    }
    .header {
      padding: 32px 40px 24px;
      text-align: left;
      border-bottom: 1px solid #1e293b;
      background: linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(15, 23, 42, 0) 100%);
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      text-decoration: none;
      letter-spacing: -0.5px;
    }
    .brand-accent {
      color: #10b981;
    }
    .content {
      padding: 36px 40px;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 16px;
      letter-spacing: -0.3px;
    }
    .text {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 24px;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      background-color: #10b981;
      color: #022c22 !important;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      display: inline-block;
      letter-spacing: 0.2px;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
    }
    .security-notice {
      background-color: #020617;
      border: 1px solid #1e293b;
      border-left: 3px solid #10b981;
      border-radius: 6px;
      padding: 16px;
      margin: 28px 0;
    }
    .security-title {
      font-size: 12px;
      font-weight: 700;
      color: #f1f5f9;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 6px;
    }
    .security-text {
      font-size: 12px;
      line-height: 1.5;
      color: #64748b;
      margin: 0;
    }
    .fallback-link {
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
      margin-top: 24px;
      line-height: 1.5;
    }
    .fallback-link a {
      color: #10b981;
      text-decoration: none;
    }
    .footer {
      padding: 24px 40px;
      text-align: center;
      font-size: 11px;
      color: #475569;
      border-top: 1px solid #1e293b;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 32px;">
      <tr>
        <td align="center">
          <table class="main" role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td class="header">
                <span class="brand">Vult<span class="brand-accent">ix</span></span>
                <span style="font-size: 11px; color: #64748b; margin-left: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Security</span>
              </td>
            </tr>
            <tr>
              <td class="content">
                <h1 class="title">Verify Your Email Address</h1>
                <p class="text">
                  Welcome to Vultix. To finalize your account setup (<strong>${esc(email)}</strong>) and unlock automated repository security scanning, verify your email address below:
                </p>
                <div class="button-container">
                  <a href="${esc(confirmLink)}" target="_blank" class="button">Confirm My Account</a>
                </div>
                <div class="security-notice">
                  <div class="security-title">Security Information</div>
                  <p class="security-text">
                    &bull; This verification link expires in <strong>24 hours</strong>.<br>
                    &bull; If you did not sign up for a Vultix account, no further action is required and you can safely ignore this message.
                  </p>
                </div>
                <div class="fallback-link">
                  If the button above does not work, copy and paste this link into your browser:<br>
                  <a href="${esc(confirmLink)}" target="_blank">${esc(confirmLink)}</a>
                </div>
              </td>
            </tr>
            <tr>
              <td class="footer">
                &copy; ${year} Vultix Automated Security Platform. All rights reserved.<br>
                This confirmation was dispatched to ${esc(email)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/**
 * Sends a signup confirmation email via Resend if configured.
 */
export async function sendSignupConfirmationEmail(
    params: SendSignupConfirmationEmailParams
): Promise<EmailResult> {
    const { email, confirmLink } = params;
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        return {
            success: false,
            error: 'RESEND_API_KEY is not configured',
            provider: 'fallback',
        };
    }

    const fromAddress =
        process.env.ALERT_FROM_EMAIL ||
        process.env.EMAIL_FROM ||
        'Vultix Security <security@vultix.co.uk>';

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromAddress,
                to: [email],
                subject: 'Confirm your Vultix account',
                html: buildSignupConfirmationHtml({ email, confirmLink }),
                text: `Welcome to Vultix! Confirm your account here: ${confirmLink}`,
                headers: {
                    'X-Entity-Ref-ID': `vultix-signup-confirm-${Date.now()}`,
                },
            }),
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            return {
                success: false,
                error: errorData?.message || `Resend returned status ${res.status}`,
                provider: 'resend',
            };
        }

        const data = await res.json();
        return {
            success: true,
            id: data.id,
            provider: 'resend',
        };
    } catch (err: unknown) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown network error',
            provider: 'resend',
        };
    }
}

