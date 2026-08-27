import { handleError } from '@/lib/error-handler';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/findings?scanId=<uuid>
// Returns the per-finding results for a scan the caller owns. RLS on the
// `findings` table enforces ownership; this route adds auth + shaping.
export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const scanId = new URL(request.url).searchParams.get('scanId');
        if (!scanId) return NextResponse.json({ error: 'scanId is required' }, { status: 400 });

        // Confirm the scan belongs to the caller (defense in depth alongside RLS).
        const { data: scan } = await supabase
            .from('scans').select('id').eq('id', scanId).eq('user_id', user.id).single();
        if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const { data: findings, error } = await supabase
            .from('findings')
            .select('*')
            .eq('scan_id', scanId)
            .order('is_vulnerability', { ascending: false })
            .order('patch_validated', { ascending: false })
            .order('severity', { ascending: true });
        if (error) throw error;

        const confirmed = findings?.filter(f => f.is_vulnerability) ?? [];
        return NextResponse.json({
            findings: findings ?? [],
            summary: {
                total: findings?.length ?? 0,
                confirmed: confirmed.length,
                false_positives: (findings?.length ?? 0) - confirmed.length,
                patches_validated: findings?.filter(f => f.patch_validated).length ?? 0,
            },
        });
    } catch (err) {
        console.error('Findings API error:', err);
        return handleError(err);
    }
}
