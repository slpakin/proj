-- ============================================================
-- Nutries E-Commerce Schema  (idempotent — safe to re-run)
-- Run this AFTER setup.sql (extends the existing schema)
-- ============================================================

-- ─────────────────────────────────────────────
-- Products
-- ─────────────────────────────────────────────
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  tagline       text default '',
  description   text default '',
  price         numeric(10,2) not null check (price >= 0),
  compare_price numeric(10,2),
  stock         integer not null default 0,
  sku           text unique,
  images        text[] default '{}',
  features      text[] default '{}',
  category      text not null default 'vacuum-sealers',
  is_featured   boolean default false,
  is_active     boolean default true,
  weight_g      integer,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────
create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id),
  stripe_session_id     text unique,
  stripe_payment_intent text,
  status                text not null default 'pending'
                          check (status in ('pending','paid','shipped','delivered','cancelled','refunded')),
  subtotal_cents        integer not null default 0,
  shipping_cents        integer not null default 0,
  total_cents           integer not null default 0,
  customer_email        text,
  customer_name         text,
  shipping_address      jsonb,
  notes                 text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Order Items
-- ─────────────────────────────────────────────
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id),
  product_name  text not null,
  product_image text,
  price_cents   integer not null,
  quantity      integer not null default 1,
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Product Reviews
-- ─────────────────────────────────────────────
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid references public.products(id) on delete cascade,
  user_id     uuid references auth.users(id),
  author_name text not null,
  rating      integer not null check (rating between 1 and 5),
  title       text,
  body        text,
  is_verified boolean default false,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Grants  (anon + authenticated need explicit SELECT)
-- ─────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select on public.products    to anon, authenticated;
grant select on public.reviews     to anon, authenticated;
grant select on public.orders      to authenticated;
grant select on public.order_items to authenticated;
grant insert on public.orders      to authenticated;
grant insert on public.order_items to authenticated;
grant insert on public.reviews     to authenticated;

-- ─────────────────────────────────────────────
-- RLS  (drop first so re-runs are idempotent)
-- ─────────────────────────────────────────────
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews     enable row level security;

-- Products
drop policy if exists "products_public_read" on public.products;
drop policy if exists "products_admin_all"   on public.products;
create policy "products_public_read" on public.products for select using (is_active = true);
create policy "products_admin_all"   on public.products for all    using (auth.role() = 'service_role');

-- Orders
drop policy if exists "orders_own_read"  on public.orders;
drop policy if exists "orders_admin_all" on public.orders;
create policy "orders_own_read"  on public.orders for select using (user_id = auth.uid());
create policy "orders_admin_all" on public.orders for all    using (auth.role() = 'service_role');

-- Order Items
drop policy if exists "order_items_own_read"  on public.order_items;
drop policy if exists "order_items_admin_all" on public.order_items;
create policy "order_items_own_read" on public.order_items
  for select using (
    order_id in (select id from public.orders where user_id = auth.uid())
  );
create policy "order_items_admin_all" on public.order_items for all using (auth.role() = 'service_role');

-- Reviews
drop policy if exists "reviews_public_read" on public.reviews;
drop policy if exists "reviews_auth_insert" on public.reviews;
drop policy if exists "reviews_own_delete"  on public.reviews;
create policy "reviews_public_read" on public.reviews for select using (true);
create policy "reviews_auth_insert" on public.reviews for insert with check (auth.uid() is not null);
create policy "reviews_own_delete"  on public.reviews for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Storage bucket for product images
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

drop policy if exists "product_images_public_read"   on storage.objects;
drop policy if exists "product_images_admin_upload"  on storage.objects;
create policy "product_images_public_read"  on storage.objects
  for select using (bucket_id = 'product-images');
create policy "product_images_admin_upload" on storage.objects
  for insert with check (bucket_id = 'product-images' and auth.role() = 'service_role');

-- ─────────────────────────────────────────────
-- Seed Data  (ON CONFLICT DO NOTHING — safe to re-run)
-- ─────────────────────────────────────────────
insert into public.products (slug, name, tagline, description, price, compare_price, stock, sku, images, features, category, is_featured, is_active)
values
(
  'chef-preserve-compact-vacuum-sealer',
  'Chef Preserve Compact Vacuum Sealer',
  'One press. 10 seconds. Up to 5× longer freshness.',
  'The Chef Preserve is a handheld vacuum sealer engineered for everyday home kitchens. Its dual-pump motor removes up to 99% of air from compatible bags in under 10 seconds, slowing oxidation and spoilage at the source. Compact enough to live in a kitchen drawer, powerful enough for meat, produce, cheese, baked goods, and dry pantry staples alike. Trusted by home cooks in over 40 countries.',
  149.99,
  199.99,
  50,
  'CP-VS-001',
  ARRAY[
    '/images/products/product-avocado.jpg',
    '/images/products/product-peppers.jpg',
    '/images/products/product-salmon.jpg',
    '/images/products/product-meat.jpg',
    '/images/products/product-pantry.jpg'
  ],
  ARRAY[
    'One-touch operation — vacuum and seal in under 10 seconds',
    'Dual-pump motor removes 99% of air',
    'Intelligent moist & dry mode auto-detection',
    'Works on avocados, meat, fish, vegetables, baked goods & dry pantry staples',
    'Rechargeable via USB-C — no cable needed during use',
    'Whisper-quiet motor under 55 dB',
    'Compatible with all standard vacuum seal bags and zipper bags',
    '2-year manufacturer warranty — worldwide coverage'
  ],
  'vacuum-sealers',
  true,
  true
),
(
  'vacuum-sealer-bags-50pk',
  'Vacuum Sealer Bags — 50 Pack',
  'BPA-Free. Freezer Safe. Reusable.',
  'Keep the freshness going with our premium vacuum sealer bags. Heavy-duty multi-layer construction seals airtight every time and holds up in the freezer, microwave, and sous-vide bath. Reusable up to 3 times after gentle washing. Works with the Chef Preserve and all major handheld vacuum sealers.',
  24.99,
  null,
  200,
  'CP-BAGS-50',
  ARRAY[
    '/images/products/product-pantry.jpg',
    '/images/products/product-salmon.jpg'
  ],
  ARRAY[
    'BPA-free, food-grade multi-layer material',
    'Freezer safe to -40°F (-40°C) and microwave safe',
    'Universal fit — works with all vacuum sealers',
    'Reusable up to 3 times after gentle washing',
    '50 bags per pack: 20 quart, 20 gallon, 10 two-gallon',
    'Double-sealed edge for extra puncture resistance'
  ],
  'accessories',
  false,
  true
),
(
  'chef-preserve-pro-bundle',
  'Chef Preserve Pro Bundle',
  'Sealer + 100 BPA-Free Bags. Save $100.',
  'Everything you need to start preserving from day one. The Pro Bundle includes one Chef Preserve handheld vacuum sealer and two full 50-pack bag sets (100 bags total). Ship to yourself or give as a gift — it arrives beautifully packaged in a single box. Save $100 compared to buying separately.',
  199.99,
  299.97,
  30,
  'CP-BUNDLE-PRO',
  ARRAY[
    '/images/products/product-salmon.jpg',
    '/images/products/product-meat.jpg',
    '/images/products/product-avocado.jpg',
    '/images/products/product-pantry.jpg'
  ],
  ARRAY[
    'Includes 1× Chef Preserve Compact Vacuum Sealer',
    'Includes 2× 50-Pack Vacuum Sealer Bags (100 bags total)',
    'Saves $100 vs. buying separately',
    'Ships in one elegant gift-ready box',
    '2-year worldwide warranty on the sealer',
    'Priority support — dedicated email and chat'
  ],
  'bundles',
  true,
  true
)
on conflict (slug) do update set
  tagline       = excluded.tagline,
  description   = excluded.description,
  price         = excluded.price,
  compare_price = excluded.compare_price,
  stock         = excluded.stock,
  images        = excluded.images,
  features      = excluded.features,
  is_featured   = excluded.is_featured,
  updated_at    = now();
