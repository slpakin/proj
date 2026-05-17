-- ============================================================
-- Nutries E-Commerce Schema
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
  compare_price numeric(10,2),                       -- struck-through "was" price
  stock         integer not null default 0,
  sku           text unique,
  images        text[] default '{}',                 -- array of public storage URLs
  features      text[] default '{}',                 -- bullet list of features
  category      text not null default 'vacuum-sealers',
  is_featured   boolean default false,
  is_active     boolean default true,
  weight_g      integer,                             -- for shipping calc
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id),
  stripe_session_id   text unique,
  stripe_payment_intent text,
  status              text not null default 'pending'
                        check (status in ('pending','paid','shipped','delivered','cancelled','refunded')),
  subtotal_cents      integer not null default 0,
  shipping_cents      integer not null default 0,
  total_cents         integer not null default 0,
  customer_email      text,
  customer_name       text,
  shipping_address    jsonb,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
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
-- RLS Policies
-- ─────────────────────────────────────────────
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews     enable row level security;

-- Products: everyone can read active ones; only service-role inserts/updates
create policy "products_public_read"  on public.products for select using (is_active = true);
create policy "products_admin_all"    on public.products for all using (auth.role() = 'service_role');

-- Orders: users see their own; service-role sees all
create policy "orders_own_read"  on public.orders for select using (user_id = auth.uid());
create policy "orders_admin_all" on public.orders for all using (auth.role() = 'service_role');

-- Order items: users see items for their orders
create policy "order_items_own_read" on public.order_items
  for select using (
    order_id in (select id from public.orders where user_id = auth.uid())
  );
create policy "order_items_admin_all" on public.order_items for all using (auth.role() = 'service_role');

-- Reviews: public read, authenticated insert
create policy "reviews_public_read"      on public.reviews for select using (true);
create policy "reviews_auth_insert"      on public.reviews for insert with check (auth.uid() is not null);
create policy "reviews_own_delete"       on public.reviews for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Storage bucket for product images
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "product_images_admin_upload" on storage.objects
  for insert with check (bucket_id = 'product-images' and auth.role() = 'service_role');

-- ─────────────────────────────────────────────
-- Seed Data — Chef Preserve Vacuum Sealers
-- ─────────────────────────────────────────────
insert into public.products (slug, name, tagline, description, price, compare_price, stock, sku, images, features, category, is_featured, is_active)
values
(
  'chef-preserve-compact-vacuum-sealer',
  'Chef Preserve Compact Vacuum Sealer',
  'Seal in Freshness. Lock in Nutrition.',
  'The Chef Preserve Compact Vacuum Sealer is engineered for the modern kitchen. With one-touch operation and a powerful dual-pump system, it removes up to 99% of air from compatible bags, extending food freshness by up to 5× compared to conventional storage methods. Compact enough to live on your countertop, powerful enough for daily use.',
  149.99,
  199.99,
  50,
  'CP-VS-001',
  ARRAY['/images/vacuum-sealer-hero.jpg'],
  ARRAY[
    'One-touch automatic operation — seal any bag in under 10 seconds',
    'Dual-pump motor removes 99% of air for maximum freshness',
    'Compact countertop footprint (12" × 5" × 3.5")',
    'Compatible with all standard vacuum seal bags and rolls',
    'Built-in bag cutter and roll storage compartment',
    'Moist & dry food modes',
    'Easy-clean removable drip tray',
    '2-year manufacturer warranty'
  ],
  'vacuum-sealers',
  true,
  true
),
(
  'vacuum-sealer-bags-50pk',
  'Vacuum Sealer Bags — 50 Pack',
  'BPA-Free. Microwave & Freezer Safe.',
  'Keep the freshness going with our premium vacuum sealer bags. Available in three sizes (quart, gallon, 2-gallon), these heavy-duty multi-layer bags are designed specifically for the Chef Preserve system. Reusable up to 3× after washing.',
  24.99,
  null,
  200,
  'CP-BAGS-50',
  ARRAY['/images/bags-50pk.jpg'],
  ARRAY[
    'BPA-free, food-grade multi-layer material',
    'Freezer safe to -40°F and microwave safe',
    'Universal fit — works with all vacuum sealers',
    'Reusable up to 3 times after gentle washing',
    '50 bags per pack: 20 quart, 20 gallon, 10 two-gallon',
    'Double-sealed zipper closure for extra security'
  ],
  'accessories',
  false,
  true
),
(
  'chef-preserve-pro-bundle',
  'Chef Preserve Pro Bundle',
  'Everything You Need to Get Started.',
  'The ultimate freshness package: one Chef Preserve Compact Vacuum Sealer plus two 50-pack bag sets. Save $54 compared to buying separately and start your freshness journey fully equipped.',
  199.99,
  299.97,
  30,
  'CP-BUNDLE-PRO',
  ARRAY['/images/bundle-pro.jpg'],
  ARRAY[
    'Includes 1× Chef Preserve Compact Vacuum Sealer',
    'Includes 2× 50-Pack Vacuum Sealer Bags (100 bags total)',
    'Saves $54 vs. buying separately',
    'Ships in one box — perfect as a gift',
    '2-year warranty on the sealer',
    'Priority customer support access'
  ],
  'bundles',
  true,
  true
);
