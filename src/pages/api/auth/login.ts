import type { APIRoute } from 'astro';
import { getSupabase, isAdmin } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form     = await request.formData();
  const email    = form.get('email')?.toString().trim();
  const password = form.get('password')?.toString();

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return new Response(
      JSON.stringify({ error: error?.message ?? 'Invalid credentials. Please try again.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const cookieOpts = {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,
    path: '/',
  };

  cookies.set('sb-access-token',  data.session.access_token,  { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 });
  cookies.set('sb-refresh-token', data.session.refresh_token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });

  return redirect(isAdmin(data.user?.email) ? '/admin' : '/account');
};
