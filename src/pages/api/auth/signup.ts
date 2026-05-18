import type { APIRoute } from 'astro';
import { getSupabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form     = await request.formData();
  const name     = form.get('name')?.toString().trim();
  const email    = form.get('email')?.toString().trim();
  const password = form.get('password')?.toString();

  if (!name || !email || !password) {
    return new Response(JSON.stringify({ error: 'All fields are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (password.length < 8) {
    return new Response(JSON.stringify({ error: 'Password must be at least 8 characters.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = getSupabase();
  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Notify admin via Resend (optional — skipped when RESEND_API_KEY is not set)
  const resendKey = import.meta.env.RESEND_API_KEY;
  const adminEmail = import.meta.env.ADMIN_EMAIL ?? 'admin@nutries.ca';
  if (resendKey) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Nutries <noreply@nutries.ca>',
        to: [adminEmail],
        subject: 'New User Registration — AkinsMedia',
        html: `
          <h2 style="font-family:sans-serif;color:#1e3a8a">New User Registered</h2>
          <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Name</td><td style="padding:4px 0"><strong>${name}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email</td><td style="padding:4px 0"><strong>${email}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Time</td><td style="padding:4px 0">${new Date().toUTCString()}</td></tr>
          </table>
        `,
      }),
    }).catch((err) => console.error('Resend notification failed:', err));
  }

  // If email confirmation is required, Supabase returns session = null
  if (!data.session) {
    return redirect('/login?message=check-email');
  }

  const cookieOpts = {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,
    path: '/',
  };

  cookies.set('sb-access-token',  data.session.access_token,  { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 });
  cookies.set('sb-refresh-token', data.session.refresh_token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });

  return redirect('/dashboard');
};
