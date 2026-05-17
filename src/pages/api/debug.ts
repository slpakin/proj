import type { APIRoute } from 'astro';
import { getSupabase } from '../../lib/supabase';

export const GET: APIRoute = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, is_active')
    .limit(5);

  return new Response(JSON.stringify({
    data,
    error,
    env: {
      supabase_url:      import.meta.env.SUPABASE_URL     ? import.meta.env.SUPABASE_URL.slice(0, 40) + '...' : 'MISSING',
      has_anon_key:      !!import.meta.env.SUPABASE_ANON_KEY,
      anon_key_preview:  import.meta.env.SUPABASE_ANON_KEY ? import.meta.env.SUPABASE_ANON_KEY.slice(0, 20) + '...' : 'MISSING',
    },
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
