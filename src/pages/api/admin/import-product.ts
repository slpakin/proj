import type { APIRoute } from 'astro';
import { getSessionFromCookies, isAdmin } from '../../../lib/supabase';

// ─── Helpers ───────────────────────────────────────────────────────────────

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function extractJsonLd(html: string): Record<string, any> | null {
  const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      const obj = JSON.parse(match[1]);
      const items = Array.isArray(obj) ? obj : [obj];
      for (const item of items) {
        if (item['@type'] === 'Product') return item;
      }
    } catch { /* continue */ }
  }
  return null;
}

function extractOgMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const re  = /<meta[^>]+property=["'](og:[^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+property=["'](og:[^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))  !== null) meta[m[1]] = m[2];
  while ((m = re2.exec(html)) !== null) if (!meta[m[2]]) meta[m[2]] = m[1];
  return meta;
}

// ─── AliExpress ────────────────────────────────────────────────────────────

function parseAliExpress(html: string, ogMeta: Record<string, string>) {
  const jsonLd = extractJsonLd(html);

  // window.runParams
  let runParams: any = null;
  const idx = html.indexOf('window.runParams');
  if (idx !== -1) {
    const eqIdx = html.indexOf('{', idx);
    if (eqIdx !== -1) {
      let depth = 0, end = -1;
      for (let i = eqIdx; i < Math.min(eqIdx + 200000, html.length); i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end !== -1) try { runParams = JSON.parse(html.slice(eqIdx, end)); } catch { /**/ }
    }
  }

  let name = '', description = '', price: number | null = null;
  const features: string[] = [];

  if (jsonLd) {
    name        = cleanText(jsonLd.name || '');
    description = cleanText(jsonLd.description || '');
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    if (offer?.price) price = parseFloat(String(offer.price).replace(/[^0-9.]/g, ''));
  }
  if (runParams) {
    const rp = runParams as any;
    const prod = rp?.data?.pageModule?.product || rp?.data?.product || rp?.product;
    if (prod) {
      if (!name && prod.subject)       name        = cleanText(prod.subject);
      if (!description && prod.description) description = cleanText(prod.description);
      if (!price && prod.tradeComponent?.formatAmount)
        price = parseFloat(String(prod.tradeComponent.formatAmount).replace(/[^0-9.]/g, ''));
    }
  }
  if (!name        && ogMeta['og:title'])        name        = cleanText(ogMeta['og:title']);
  if (!description && ogMeta['og:description'])  description = cleanText(ogMeta['og:description']);
  if (!price       && ogMeta['og:price:amount']) price = parseFloat(String(ogMeta['og:price:amount']).replace(/[^0-9.]/g, ''));
  if (!price) {
    const pm = html.match(/["']price["']\s*[:=]\s*["']?([\d.]+)["']?/);
    if (pm) price = parseFloat(pm[1]);
  }

  const imgs: string[] = [];
  if (ogMeta['og:image']) imgs.push(ogMeta['og:image']);
  const imgRe = /["'](https:\/\/ae\d*\.alicdn\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi;
  let m: RegExpExecArray | null;
  const seen = new Set(imgs);
  while ((m = imgRe.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); imgs.push(m[1]); }
  }

  return { name, description, price, features, images: imgs.slice(0, 8) };
}

// ─── Alibaba ────────────────────────────────────────────────────────────────

function parseAlibaba(html: string, ogMeta: Record<string, string>) {
  const jsonLd = extractJsonLd(html);
  let name = '', description = '', price: number | null = null;
  const features: string[] = [];

  if (jsonLd) {
    name        = cleanText(jsonLd.name || '');
    description = cleanText(jsonLd.description || '');
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    if (offer?.price) price = parseFloat(String(offer.price).replace(/[^0-9.]/g, ''));
    if (offer?.lowPrice) price = parseFloat(String(offer.lowPrice).replace(/[^0-9.]/g, ''));
  }
  if (!name        && ogMeta['og:title'])       name        = cleanText(ogMeta['og:title']);
  if (!description && ogMeta['og:description']) description = cleanText(ogMeta['og:description']);

  // Alibaba price ranges like "$12.00 - $15.00" — grab the lower
  if (!price) {
    const pm = html.match(/\$\s*([\d,]+\.?\d*)\s*(?:-|–)/);
    if (pm) price = parseFloat(pm[1].replace(/,/g, ''));
  }

  // Features from bullet lists near the description
  const featureRe = /<li[^>]*>([^<]{10,200})<\/li>/gi;
  let fm: RegExpExecArray | null;
  while ((fm = featureRe.exec(html)) !== null && features.length < 8) {
    const t = cleanText(fm[1]);
    if (t && !t.includes('<') && t.length < 200) features.push(t);
  }

  const imgs: string[] = [];
  if (ogMeta['og:image']) imgs.push(ogMeta['og:image']);
  const imgRe = /["'](https:\/\/[^"']*\.alibaba\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi;
  const seen  = new Set(imgs);
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); imgs.push(m[1]); }
  }

  return { name, description, price, features, images: imgs.slice(0, 8) };
}

// ─── Amazon ────────────────────────────────────────────────────────────────

function parseAmazon(html: string, ogMeta: Record<string, string>) {
  // Title
  let name = '';
  const titleMatch = html.match(/<span[^>]+id=["']productTitle["'][^>]*>\s*([\s\S]*?)\s*<\/span>/i);
  if (titleMatch) name = cleanText(titleMatch[1]);
  if (!name && ogMeta['og:title']) name = cleanText(ogMeta['og:title']);

  // Price — try multiple patterns
  let price: number | null = null;
  const pricePatterns = [
    /"priceAmount"\s*:\s*([\d.]+)/,
    /class="a-price-whole">([^<]+)<\/span>[^<]*<span[^>]*class="a-price-fraction">([^<]+)/,
    /"buyingPrice"\s*:\s*([\d.]+)/,
    /id="priceblock_ourprice"[^>]*>\s*\$\s*([\d,]+\.?\d*)/i,
    /id="priceblock_dealprice"[^>]*>\s*\$\s*([\d,]+\.?\d*)/i,
  ];
  for (const pat of pricePatterns) {
    const pm = html.match(pat);
    if (pm) {
      const raw = pm[2] ? `${pm[1].replace(/[^0-9]/g, '')}.${pm[2]}` : pm[1].replace(/,/g, '');
      const p = parseFloat(raw);
      if (!isNaN(p) && p > 0) { price = p; break; }
    }
  }

  // Description / features from #feature-bullets
  const description = ogMeta['og:description'] ? cleanText(ogMeta['og:description']) : '';
  const features: string[] = [];
  const bulletsMatch = html.match(/id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/ul>/i);
  if (bulletsMatch) {
    const liRe = /<li[^>]*>\s*<span[^>]*>\s*([\s\S]*?)\s*<\/span>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = liRe.exec(bulletsMatch[1])) !== null && features.length < 8) {
      const t = cleanText(lm[1].replace(/<[^>]+>/g, ''));
      if (t && t.length > 5 && t.length < 300) features.push(t);
    }
  }

  // Images — Amazon stores them in a JSON object
  const imgs: string[] = [];
  if (ogMeta['og:image']) imgs.push(ogMeta['og:image']);
  const colorImagesMatch = html.match(/"colorImages"\s*:\s*\{[^}]*"initial"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (colorImagesMatch) {
    try {
      const arr = JSON.parse(colorImagesMatch[1]);
      const seen = new Set(imgs);
      for (const item of arr) {
        const url = item.hiRes || item.large || item.main;
        if (url && typeof url === 'string' && !seen.has(url)) { seen.add(url); imgs.push(url); }
        if (imgs.length >= 8) break;
      }
    } catch { /**/ }
  }

  return { name, description, price, features, images: imgs.slice(0, 8) };
}

// ─── Route ─────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request, cookies }) => {
  const { user } = await getSessionFromCookies(cookies);
  if (!user || !isAdmin(user.email)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let url: string;
  try { ({ url } = await request.json()); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 }); }

  const isAliExpress = url?.includes('aliexpress');
  const isAlibaba    = url?.includes('alibaba.com');
  const isAmazon     = url?.includes('amazon.');

  if (!url || (!isAliExpress && !isAlibaba && !isAmazon)) {
    return new Response(
      JSON.stringify({ error: 'Please provide a valid AliExpress, Alibaba, or Amazon URL.' }),
      { status: 400 }
    );
  }

  let html: string;
  try {
    html = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control':   'no-cache',
      },
    }).then(r => r.text());
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Could not fetch URL: ${err.message}` }), { status: 502 });
  }

  const ogMeta = extractOgMeta(html);
  let result: ReturnType<typeof parseAliExpress>;

  if (isAmazon)        result = parseAmazon(html, ogMeta);
  else if (isAlibaba)  result = parseAlibaba(html, ogMeta);
  else                 result = parseAliExpress(html, ogMeta);

  if (!result.name) {
    return new Response(
      JSON.stringify({ error: 'Could not extract product data. Try copying the details manually.' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      name:          result.name,
      description:   result.description,
      price:         result.price && !isNaN(result.price) ? Math.round(result.price * 100) / 100 : null,
      compare_price: null,
      images:        result.images,
      tagline:       '',
      features:      result.features,
      source_url:    url,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
