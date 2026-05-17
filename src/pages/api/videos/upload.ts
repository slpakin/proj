import type { APIRoute } from 'astro';
import { getSessionFromCookies, isAdmin } from '../../../lib/supabase';

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export const POST: APIRoute = async ({ request, cookies }) => {
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const { user, client } = await getSessionFromCookies(cookies);
  if (!user) return json({ error: 'Unauthorized.' }, 401);
  if (!isAdmin(user.email)) return json({ error: 'Only admins can upload videos.' }, 403);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const title       = formData.get('title')?.toString().trim();
  const description = formData.get('description')?.toString().trim() ?? '';
  const file        = formData.get('video');

  if (!title)              return json({ error: 'Title is required.' }, 400);
  if (!(file instanceof File)) return json({ error: 'Video file is required.' }, 400);
  if (file.size > MAX_BYTES)   return json({ error: 'File exceeds the 500 MB limit.' }, 400);

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
  const storagePath = `${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await client.storage
    .from('training-videos')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) return json({ error: uploadError.message }, 500);

  const { data: { publicUrl } } = client.storage
    .from('training-videos')
    .getPublicUrl(storagePath);

  const { data: videoRecord, error: dbError } = await client
    .from('videos')
    .insert({ title, description, url: publicUrl, storage_path: storagePath, user_id: user.id })
    .select()
    .single();

  if (dbError) return json({ error: dbError.message }, 500);

  return json({ success: true, video: videoRecord });
};
