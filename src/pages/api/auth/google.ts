import type { APIRoute } from 'astro';
import { getSupabase } from '../../../lib/supabase';

export const GET: APIRoute = async ({ url }) => {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: url.origin + '/auth/callback',
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=' + encodeURIComponent('Google sign-in unavailable. Please try again.') },
    });
  }

  return new Response(null, { status: 302, headers: { Location: data.url } });
};
