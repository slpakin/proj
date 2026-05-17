import type { APIRoute } from 'astro';
import { getSessionFromCookies, isAdmin } from '../../../lib/supabase';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const GET: APIRoute = async ({ url }) => {
  const client   = getServiceClient();
  const category = url.searchParams.get('category');
  const featured = url.searchParams.get('featured');

  let query = client
    .from('products')
    .select('id,slug,name,tagline,price,compare_price,images,is_featured,stock,category')
    .eq('is_active', true)
    .order('is_featured', { ascending: false });

  if (category && category !== 'all') query = query.eq('category', category);
  if (featured === 'true') query = query.eq('is_featured', true);

  const { data, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const { user } = await getSessionFromCookies(cookies);
  if (!user || !isAdmin(user.email)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const required = ['name', 'slug', 'price', 'stock', 'category'];
  for (const field of required) {
    if (!body[field] && body[field] !== 0) {
      return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), { status: 400 });
    }
  }

  const client = getServiceClient();
  const { data, error } = await client
    .from('products')
    .insert({
      name:          body.name,
      slug:          body.slug,
      tagline:       body.tagline || '',
      description:   body.description || '',
      price:         Number(body.price),
      compare_price: body.compare_price ? Number(body.compare_price) : null,
      stock:         Number(body.stock),
      sku:           body.sku || null,
      category:      body.category,
      is_featured:   Boolean(body.is_featured),
      is_active:     body.is_active !== undefined ? Boolean(body.is_active) : true,
      features:      Array.isArray(body.features) ? body.features : [],
      images:        Array.isArray(body.images)   ? body.images   : [],
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505' ? 'A product with that slug already exists.' : error.message;
    return new Response(JSON.stringify({ error: msg }), { status: 400 });
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
