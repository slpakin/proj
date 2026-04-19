import type { APIRoute } from 'astro';
import { getSessionFromCookies } from '../../../lib/supabase';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  const { client } = await getSessionFromCookies(cookies);
  await client.auth.signOut();

  cookies.delete('sb-access-token',  { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });

  return redirect('/login');
};
