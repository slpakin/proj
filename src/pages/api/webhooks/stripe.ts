import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const POST: APIRoute = async ({ request }) => {
  const stripeKey    = import.meta.env.STRIPE_SECRET_KEY;
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return new Response('Stripe not configured', { status: 503 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  const body      = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) return new Response('No signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  const serviceClient = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Mark order as paid
    await serviceClient
      .from('orders')
      .update({
        status:                'paid',
        stripe_payment_intent: session.payment_intent as string,
        updated_at:            new Date().toISOString(),
      })
      .eq('stripe_session_id', session.id);

    // Decrement stock for each item ordered
    const { data: items } = await serviceClient
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', session.metadata?.order_id || '');

    if (items) {
      for (const item of items) {
        await serviceClient.rpc('decrement_stock', {
          product_id: item.product_id,
          amount:     item.quantity,
        });
      }
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    await serviceClient
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('stripe_session_id', session.id);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
