import type { APIRoute } from 'astro';
import { getSupabase, isAdmin } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const { access_token, refresh_token } = await request.json();

  if (!access_token || !refresh_token) {
    return new Response(JSON.stringify({ error: 'Missing tokens' }), { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });

  if (error || !data.session) {
    return new Response(JSON.stringify({ error: 'Invalid tokens' }), { status: 401 });
  }

  const cookieOpts = {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,
    path: '/',
  };

  cookies.set('sb-access-token',  access_token,  { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 });
  cookies.set('sb-refresh-token', refresh_token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });

  const redirect = isAdmin(data.session.user?.email) ? '/admin' : '/account';
  return new Response(JSON.stringify({ redirect }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
