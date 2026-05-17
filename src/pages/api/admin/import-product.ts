import type { APIRoute } from 'astro';
import { getSessionFromCookies, isAdmin } from '../../../lib/supabase';

function extractJsonLd(html: string): Record<string, any> | null {
  const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      const obj = JSON.parse(match[1]);
      const items = Array.isArray(obj) ? obj : [obj];
      for (const item of items) {
        if (item['@type'] === 'Product') return item;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function extractOgMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const re = /<meta[^>]+property=["'](og:[^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    meta[m[1]] = m[2];
  }
  // Also try the reversed attribute order
  const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+property=["'](og:[^"']+)["'][^>]*>/gi;
  while ((m = re2.exec(html)) !== null) {
    if (!meta[m[2]]) meta[m[2]] = m[1];
  }
  return meta;
}

function extractRunParams(html: string): Record<string, any> | null {
  // Find window.runParams = { ... }
  const idx = html.indexOf('window.runParams');
  if (idx === -1) return null;
  const eqIdx = html.indexOf('{', idx);
  if (eqIdx === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = eqIdx; i < Math.min(eqIdx + 200000, html.length); i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null;

  try {
    return JSON.parse(html.slice(eqIdx, end));
  } catch {
    return null;
  }
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function extractImages(html: string, ogMeta: Record<string, string>): string[] {
  const imgs: string[] = [];
  if (ogMeta['og:image']) imgs.push(ogMeta['og:image']);

  // Look for image arrays in script data
  const imgRe = /["'](https:\/\/ae\d*\.alicdn\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi;
  let m: RegExpExecArray | null;
  const seen = new Set(imgs);
  while ((m = imgRe.exec(html)) !== null) {
    const url = m[1].split('_')[0] + (m[1].includes('.') ? '.' + m[1].split('.').pop()!.split('_')[0].replace(/[^a-z]/gi, '') || 'jpg' : '.jpg');
    const clean = m[1];
    if (!seen.has(clean)) {
      seen.add(clean);
      imgs.push(clean);
    }
  }
  return imgs.slice(0, 8);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const { user } = await getSessionFromCookies(cookies);
  if (!user || !isAdmin(user.email)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let url: string;
  try {
    ({ url } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  if (!url || !url.includes('aliexpress')) {
    return new Response(JSON.stringify({ error: 'Please provide a valid AliExpress URL.' }), { status: 400 });
  }

  let html: string;
  try {
    html = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control':   'no-cache',
      },
    }).then(r => r.text());
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Could not fetch URL: ${err.message}` }), { status: 502 });
  }

  const ogMeta    = extractOgMeta(html);
  const jsonLd    = extractJsonLd(html);
  const runParams = extractRunParams(html);

  // Build product from all sources, preferring JSON-LD > runParams > OG
  let name        = '';
  let description = '';
  let price: number | null = null;
  let comparePrice: number | null = null;
  const features: string[] = [];

  // JSON-LD
  if (jsonLd) {
    name        = cleanText(jsonLd.name || '');
    description = cleanText(jsonLd.description || '');
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    if (offer?.price) price = parseFloat(String(offer.price).replace(/[^0-9.]/g, ''));
  }

  // runParams
  if (runParams) {
    const rp = runParams as any;
    const product = rp?.data?.pageModule?.product || rp?.data?.product || rp?.product;
    if (product) {
      if (!name && product.subject)         name        = cleanText(product.subject);
      if (!description && product.description) description = cleanText(product.description);
      if (!price && product.tradeComponent?.formatAmount) {
        price = parseFloat(String(product.tradeComponent.formatAmount).replace(/[^0-9.]/g, ''));
      }
    }
  }

  // OG fallback
  if (!name        && ogMeta['og:title'])       name        = cleanText(ogMeta['og:title']);
  if (!description && ogMeta['og:description']) description = cleanText(ogMeta['og:description']);
  if (!price       && ogMeta['og:price:amount']) {
    price = parseFloat(String(ogMeta['og:price:amount']).replace(/[^0-9.]/g, ''));
  }

  // Try price from page text as last resort
  if (!price) {
    const priceMatch = html.match(/["']price["']\s*[:=]\s*["']?([\d.]+)["']?/);
    if (priceMatch) price = parseFloat(priceMatch[1]);
  }

  if (!name) {
    return new Response(
      JSON.stringify({ error: 'Could not extract product data. Try copying the details manually.' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const images = extractImages(html, ogMeta);

  return new Response(
    JSON.stringify({
      name,
      description,
      price:         price && !isNaN(price) ? Math.round(price * 100) / 100 : null,
      compare_price: comparePrice,
      images,
      tagline:       '',
      features,
      source_url:    url,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
