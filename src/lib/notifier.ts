// Alert sinks (Phase 3). Slack via incoming webhook; email via Resend if a key
// is configured. Both are best-effort and never throw into the caller.

export async function sendSlack(webhookUrl: string, text: string): Promise<boolean> {
    if (!webhookUrl) return false;
    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        return res.ok;
    } catch (e) {
        console.error('[notifier] slack failed:', e);
        return false;
    }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.ALERT_FROM_EMAIL || 'alerts@vultix.co.uk';
    if (!key || !to) return false;
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to, subject, html }),
        });
        return res.ok;
    } catch (e) {
        console.error('[notifier] email failed:', e);
        return false;
    }
}

// Format a scan result into a short alert body.
export function scanAlert(target: string, grade: string | null, vulns: number, appUrl: string, scanId: string): string {
    const link = `${appUrl}/dashboard`;
    return `🛡️ Vultix scan complete for *${target}*\n` +
        `Grade: *${grade ?? 'n/a'}*  ·  Confirmed vulnerabilities: *${vulns}*\n` +
        `View findings: ${link} (scan ${scanId})`;
}
