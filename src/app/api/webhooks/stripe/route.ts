import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js'; 

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
    apiVersion: '2026-06-24.dahlia',
});

// Need service role key to bypass RLS for webhooks
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req: Request) {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature') as string;

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET || ''
        );
    } catch (err) {
        console.error(`Webhook Error: ${err instanceof Error ? err.message : String(err)}`);
        return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;

        if (userId) {
            // Update billing_events
            await supabaseAdmin.from('billing_events').insert({
                user_id: userId,
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: session.subscription as string,
                event_type: event.type,
                amount: session.amount_total,
                currency: session.currency,
                status: session.payment_status,
            });

            // Update user plan to 'Pro' as placeholder logic (in a real app, map price ID to plan)
            await supabaseAdmin.from('profiles').update({
                plan: 'Pro',
                monthly_scans_used: 0 // Reset on upgrade
            }).eq('id', userId);
        }
    }

    if (event.type === 'customer.subscription.updated') {
        // const subscription = event.data.object as Stripe.Subscription;
        // Handle subscription changes, downgrades, etc.
    }

    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        // Find user by customer ID and downgrade to Free
        const { data: events } = await supabaseAdmin
            .from('billing_events')
            .select('user_id')
            .eq('stripe_customer_id', subscription.customer as string)
            .limit(1);
        
        if (events && events.length > 0) {
            await supabaseAdmin.from('profiles').update({ plan: 'Free' }).eq('id', events[0].user_id);
        }
    }

    return NextResponse.json({ received: true });
}
