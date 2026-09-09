import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logAuditEvent } from '@/lib/audit-logger';
import { handleError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * Admin edits to a user's plan, status or role.
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * The admin page used to write these columns straight from the browser. That
 * only worked because `profiles` had a blanket `GRANT UPDATE ... TO
 * authenticated` — which also let any ordinary user set their own `role` to
 * 'admin' and read the whole table. Migration 005 revoked that grant down to
 * `full_name`.
 *
 * Postgres column privileges are granted to a ROLE, and Supabase's
 * `authenticated` role covers every signed-in user alike. There is no GRANT
 * that says "this column, but only for admins" — so privileged columns cannot
 * be written from a browser session at all. They move here, behind a check that
 * runs on the server with a key the browser never sees.
 *
 * The admin check reads the CALLER's own row through their session. It cannot
 * be spoofed by the request body, and after migration 005 the caller cannot
 * have written their own `role` to reach it.
 */

const FIELDS = {
    plan: ['Free', 'Pro', 'Enterprise'],
    status: ['Active', 'Suspended'],
    role: ['user', 'admin'],
} as const;

type Field = keyof typeof FIELDS;

export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        }

        // Is the CALLER an admin? Read their own row under their own session.
        const { data: me } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (me?.role !== 'admin') {
            // Logged at high severity: a non-admin reaching this route is
            // either a bug or someone probing, and both are worth seeing.
            await logAuditEvent({
                event_type: 'AUTHORIZATION_FAILED',
                status: 'failure',
                severity: 'high',
                resource: 'admin/users',
                user_id: user.id,
            }, request).catch(() => {});
            return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const targetId: unknown = body?.userId;
        const field: unknown = body?.field;
        const value: unknown = body?.value;

        if (typeof targetId !== 'string' || !targetId) {
            return NextResponse.json({ error: 'A userId is required.' }, { status: 400 });
        }
        if (typeof field !== 'string' || !(field in FIELDS)) {
            return NextResponse.json(
                { error: `field must be one of: ${Object.keys(FIELDS).join(', ')}` },
                { status: 400 },
            );
        }
        // Allow-list the value as well as the column. The database CHECK
        // constraints would catch a bad value, but a 400 here says which field
        // was wrong instead of surfacing a constraint error.
        const allowed: readonly string[] = FIELDS[field as Field];
        if (typeof value !== 'string' || !allowed.includes(value)) {
            return NextResponse.json(
                { error: `${field} must be one of: ${allowed.join(', ')}` },
                { status: 400 },
            );
        }

        // An admin removing their own admin rights locks everyone out if they
        // are the last one. Refuse rather than let the product become
        // unadministrable by a single misclick.
        if (field === 'role' && targetId === user.id && value !== 'admin') {
            return NextResponse.json(
                { error: 'You cannot remove your own admin role. Ask another admin.' },
                { status: 409 },
            );
        }

        const admin = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } },
        );

        const { data: before } = await admin
            .from('profiles')
            .select('plan, status, role, email')
            .eq('id', targetId)
            .single();

        if (!before) {
            return NextResponse.json({ error: 'No such user.' }, { status: 404 });
        }

        const { error } = await admin
            .from('profiles')
            .update({ [field]: value })
            .eq('id', targetId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Granting admin is the one change worth finding later without knowing
        // to look for it, so it is recorded as critical rather than medium.
        await logAuditEvent({
            event_type: 'ADMIN_ACTION',
            status: 'success',
            severity: field === 'role' && value === 'admin' ? 'critical' : 'medium',
            resource: `profiles/${targetId}`,
            action: `${field}: ${before[field as Field]} -> ${value}`,
            user_id: user.id,
            metadata: { target_email: before.email, field, from: before[field as Field], to: value },
        }, request).catch(() => {});

        return NextResponse.json({ success: true, field, value });
    } catch (err) {
        return handleError(err);
    }
}
