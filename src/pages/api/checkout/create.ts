import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getSessionFromCookies } from '../../../lib/supabase';

interface CartItem {
  id:    string;
  name:  string;
  price: number;
  qty:   number;
  image: string;
  slug:  string;
}

interface Customer {
  name:    string;
  email:   string;
  address: string;
  city:    string;
  state:   string;
  zip:     string;
}

export const POST: APIRoute = async ({ request, cookies, url }) => {
  const stripeKey = import.meta.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(
      JSON.stringify({ error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to your .env file.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { cart: CartItem[]; customer: Customer };
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 }); }

  const { cart, customer } = body;

  if (!cart || cart.length === 0) {
    return new Response(JSON.stringify({ error: 'Your cart is empty.' }), { status: 400 });
  }

  if (!customer?.email) {
    return new Response(JSON.stringify({ error: 'Customer email is required.' }), { status: 400 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  const origin = url.origin;

  try {
    // Build Stripe line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = cart.map(item => ({
      price_data: {
        currency:     'usd',
        unit_amount:  Math.round(item.price * 100),
        product_data: {
          name:   item.name,
          images: item.image?.startsWith('http') ? [item.image] : [],
        },
      },
      quantity: item.qty,
    }));

    // Calculate totals for order record
    const subtotalCents = cart.reduce((s, i) => s + Math.round(i.price * 100) * i.qty, 0);
    const shippingCents = subtotalCents >= 7500 ? 0 : 799;

    // Create pending order in Supabase
    const serviceClient = createClient(
      import.meta.env.SUPABASE_URL,
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get authenticated user if logged in
    const { user } = await getSessionFromCookies(cookies);

    const { data: order } = await serviceClient
      .from('orders')
      .insert({
        user_id:        user?.id || null,
        status:         'pending',
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        total_cents:    subtotalCents + shippingCents,
        customer_email: customer.email,
        customer_name:  customer.name,
        shipping_address: {
          line1:       customer.address,
          city:        customer.city,
          state:       customer.state,
          postal_code: customer.zip,
          country:     'US',
        },
      })
      .select('id')
      .single();

    // Insert order items
    if (order?.id) {
      await serviceClient.from('order_items').insert(
        cart.map(item => ({
          order_id:      order.id,
          product_id:    item.id,
          product_name:  item.name,
          product_image: item.image,
          price_cents:   Math.round(item.price * 100),
          quantity:      item.qty,
        }))
      );
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: customer.email,
      shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: shippingCents, currency: 'usd' },
            display_name: shippingCents === 0 ? 'Free Shipping' : 'Standard Shipping (3–5 days)',
          },
        },
      ],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/cart`,
      metadata: {
        order_id:      order?.id || '',
        customer_name: customer.name,
      },
      payment_intent_data: {
        metadata: { order_id: order?.id || '' },
      },
    });

    // Update order with Stripe session ID
    if (order?.id) {
      await serviceClient
        .from('orders')
        .update({ stripe_session_id: session.id })
        .eq('id', order.id);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Payment setup failed. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
