# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server with hot reload
npm run build     # Production build
npm run preview   # Preview production build locally
```

No test framework is configured.

## Environment Setup

Copy `.env.example` to `.env` and populate:
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project
- `ADMIN_EMAIL` — the email address that gets admin upload privileges (defaults to `admin@akinsmedia.com`)
- `RESEND_API_KEY` — optional, enables new-signup email notifications

Run `supabase/setup.sql` against your Supabase project to create the `videos` table, RLS policies, and `training-videos` storage bucket.

## Architecture

**Astro 4 (SSR mode) + Supabase + Tailwind CSS.** All pages are server-rendered via the Node.js adapter (`output: 'server'`).

### Routing

File-based routing under `src/pages/`:
- `index.astro` — public marketing landing page
- `login.astro` / `signup.astro` — auth forms
- `dashboard.astro` — protected LMS + admin upload UI
- `api/auth/{signup,login,logout}.ts` — auth API endpoints
- `api/videos/upload.ts` — video upload endpoint (admin-only)

### Auth Flow

API endpoints set two httpOnly cookies (`sb-access-token`, `sb-refresh-token`) on successful login/signup. Server-side session is restored via `getSessionFromCookies()` in `src/lib/supabase.ts`. Admin status is determined by comparing the authenticated user's email against the `ADMIN_EMAIL` env var via `isAdmin()`.

Protected pages redirect to `/login` when no valid session cookie is present.

### Video Upload Flow

Dashboard form → `POST /api/videos/upload` → validates auth + admin role + file size (≤500 MB) → uploads to Supabase Storage bucket `training-videos` → inserts metadata row into `videos` table. Progress is tracked client-side via XHR `progress` events.

### Key Files

- `src/lib/supabase.ts` — `getSupabase()`, `getSessionFromCookies()`, `isAdmin()` helpers used across all API routes and protected pages
- `supabase/setup.sql` — full DB schema, RLS policies, and storage bucket setup
- `tailwind.config.mjs` — custom `brand-*` color scale (blue-based, 50–900) and Inter font
- `tsconfig.json` — extends `astro/tsconfigs/strict` with `strictNullChecks: true`

### Data Model

`videos` table: `id`, `title`, `description`, `url` (public streaming URL), `storage_path`, `user_id`, `created_at`. RLS allows all authenticated users to read; inserts are admin-gated at the API layer.
