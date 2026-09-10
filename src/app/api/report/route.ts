import { createClient } from '@/utils/supabase/server';

// GET /api/report?scanId=<uuid> -> self-contained HTML report for a scan the
// caller owns (Stakeholder + Developer views in one printable page).
export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    const scanId = new URL(request.url).searchParams.get('scanId');
    if (!scanId) return new Response('scanId required', { status: 400 });

    const { data: scan } = await supabase.from('scans').select('*')
        .eq('id', scanId).eq('user_id', user.id).single();
    if (!scan) return new Response('Not found', { status: 404 });

    const { data: findings } = await supabase.from('findings').select('*')
        .eq('scan_id', scanId).order('is_vulnerability', { ascending: false });

    // Escapes the FIVE characters that matter, not three. The previous version
    // handled & < > only, which is enough for text but not for an attribute:
    // `class="sev ${esc(severity)}"` with a quote in `severity` closes the
    // attribute and opens an event handler. No tag is needed, and the app's CSP
    // allows 'unsafe-inline', so a handler would run — same-origin, next to a
    // deliberately readable CSRF cookie.
    const esc = (s: unknown) =>
        String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c] as string));

    // Defence in depth for the one value that lands in an attribute: a class
    // name comes from a fixed set or it does not get used at all.
    const sevClass = (v: unknown) => {
        const k = String(v ?? '').toLowerCase();
        return k === 'error' || k === 'warning' || k === 'note' ? k : 'note';
    };
    const confirmed = (findings ?? []).filter(f => f.is_vulnerability);
    const rows = (findings ?? []).map(f => `
        <div class="finding ${f.is_vulnerability ? 'vuln' : 'fp'}">
          <div class="fhead">
            <span class="sev ${sevClass(f.severity)}">${esc(f.severity)}</span>
            <code>${esc(f.rule_id)}</code>
            <span class="loc">${esc(f.file_path)}${f.start_line ? ':' + f.start_line : ''}</span>
            ${f.patch_validated ? '<span class="badge ok">patch verified</span>' : f.patch_applies ? '<span class="badge warn">patch applies</span>' : ''}
            <span class="verdict">${f.is_vulnerability ? 'CONFIRMED' : 'false positive'}</span>
          </div>
          ${f.reasoning ? `<p>${esc(f.reasoning)}</p>` : ''}
          ${f.unified_diff ? `<pre>${esc(f.unified_diff)}</pre>` : ''}
        </div>`).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>Vultix report — ${esc(scan.target_url)}</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#0f172a}
        h1{font-size:1.4rem} .grade{font-size:3rem;font-weight:800}
        .kpis{display:flex;gap:2rem;margin:1rem 0}
        .finding{border:1px solid #e2e8f0;border-radius:.5rem;padding:.75rem 1rem;margin:.75rem 0}
        .finding.fp{opacity:.6} .fhead{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;font-size:.8rem}
        .sev{text-transform:uppercase;font-size:.65rem;padding:.1rem .4rem;border-radius:.25rem;background:#fee2e2;color:#b91c1c}
        .sev.warning{background:#fef3c7;color:#b45309} .sev.note{background:#f1f5f9;color:#475569}
        .badge{font-size:.65rem;padding:.1rem .4rem;border-radius:.25rem} .badge.ok{background:#dcfce7;color:#166534} .badge.warn{background:#fef3c7;color:#b45309}
        .verdict{margin-left:auto;font-weight:700;font-size:.7rem} .loc{color:#64748b;font-family:ui-monospace,monospace}
        pre{background:#0f172a;color:#e2e8f0;padding:.75rem;border-radius:.4rem;overflow-x:auto;font-size:.75rem}
      </style></head><body>
      <h1>Security Report — ${esc(scan.target_url)}</h1>
      <p style="color:#64748b">Generated ${new Date().toLocaleString()} · scan ${esc(scan.id)}</p>
      <div class="kpis">
        <div><div class="grade">${esc(scan.grade ?? 'n/a')}</div><small>Grade</small></div>
        <div><div class="grade">${esc(scan.score ?? 0)}%</div><small>Safety index</small></div>
        <div><div class="grade">${confirmed.length}</div><small>Confirmed vulns</small></div>
        <div><div class="grade">${esc(scan.estimated_patch_hours ?? 0)}h</div><small>Est. patch effort</small></div>
      </div>
      <h2>Findings</h2>
      ${rows || '<p>No findings recorded.</p>'}
    </body></html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
