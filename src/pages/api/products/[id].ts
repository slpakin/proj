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

export const GET: APIRoute = async ({ params }) => {
  const { data, error } = await getServiceClient()
    .from('products')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, cookies, params }) => {
  const { user } = await getSessionFromCookies(cookies);
  if (!user || !isAdmin(user.email)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { data, error } = await getServiceClient()
    .from('products')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  const { user } = await getSessionFromCookies(cookies);
  if (!user || !isAdmin(user.email)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { error } = await getServiceClient()
    .from('products')
    .delete()
    .eq('id', params.id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
