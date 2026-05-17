import type { APIRoute } from 'astro';
import { getSessionFromCookies, isAdmin, getSupabaseAdmin } from '../../../lib/supabase';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const { user } = await getSessionFromCookies(cookies);
  if (!user || !isAdmin(user.email)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data' }), { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return new Response(
      JSON.stringify({ error: `Invalid file type: ${file.type}. Only JPEG, PNG, WebP, GIF, and AVIF are allowed.` }),
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return new Response(
      JSON.stringify({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.` }),
      { status: 400 }
    );
  }

  // Sanitize filename
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
  const path = `products/${Date.now()}-${base}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const supabaseAdmin = getSupabaseAdmin();

  const { error: uploadError } = await supabaseAdmin.storage
    .from('product-images')
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert:      false,
    });

  if (uploadError) {
    return new Response(
      JSON.stringify({ error: `Upload failed: ${uploadError.message}` }),
      { status: 500 }
    );
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('product-images')
    .getPublicUrl(path);

  return new Response(
    JSON.stringify({ url: publicUrl }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
