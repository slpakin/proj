import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

export function getSupabase() {
  return createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );
}

/** Restore a server-side Supabase session from cookies. Returns null user if invalid. */
export async function getSessionFromCookies(cookies: AstroCookies) {
  const accessToken  = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  if (!accessToken || !refreshToken) return { client: getSupabase(), user: null, session: null };

  const client = getSupabase();

  const { data, error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error || !data.session) return { client, user: null, session: null };

  return { client, user: data.session.user, session: data.session };
}

export function isAdmin(email: string | undefined) {
  return email === import.meta.env.ADMIN_EMAIL;
}

export function getSupabaseAdmin() {
  return createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
