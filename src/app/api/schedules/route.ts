import { handleError } from '@/lib/error-handler';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data } = await supabase.from('scheduled_scans').select('*')
        .eq('user_id', user.id).order('created_at', { ascending: false });
    return NextResponse.json({ schedules: data ?? [] });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { targetUrl, intervalHours, notifySlackWebhook, notifyEmail } = await request.json();
    if (!targetUrl) return NextResponse.json({ error: 'targetUrl required' }, { status: 400 });

    const { data, error } = await supabase.from('scheduled_scans').insert({
        user_id: user.id,
        target_url: targetUrl,
        interval_hours: Math.max(1, Number(intervalHours) || 24),
        notify_slack_webhook: notifySlackWebhook || null,
        notify_email: notifyEmail || null,
    }).select().single();
    if (error) return handleError(error);
    return NextResponse.json({ schedule: data }, { status: 201 });
}

export async function DELETE(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await supabase.from('scheduled_scans').delete().eq('id', id).eq('user_id', user.id);
    return NextResponse.json({ success: true });
}
