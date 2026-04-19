import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, cookies }) => {
  const { access_token, refresh_token } = await request.json();

  if (!access_token || !refresh_token) {
    return new Response(JSON.stringify({ error: 'Missing tokens' }), { status: 400 });
  }

  const cookieOpts = {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,
    path: '/',
  };

  cookies.set('sb-access-token',  access_token,  { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 });
  cookies.set('sb-refresh-token', refresh_token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
