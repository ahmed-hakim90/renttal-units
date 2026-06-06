# Rental Units Management System

Bilingual (English/Arabic) internal dashboard for managing rental units in Saudi Arabia.

## Tech Stack

- Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- Supabase (Auth, Database, RLS)
- next-intl (i18n with RTL support)
- Sentry (observability)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

### 3. Apply database migrations

Using Supabase CLI (linked to your project):

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or apply manually via Supabase Dashboard SQL editor:
- Run `supabase/migrations/20250606000001_initial_schema.sql`

### 4. Create admin user

Sign up via Supabase Auth, then promote to admin:

```sql
UPDATE profiles SET role = 'admin_editor' WHERE email = 'your@email.com';
```

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3000/en/dashboard](http://localhost:3000/en/dashboard)

## Architecture

```
UI → Server Actions → Services → Repositories → Supabase
```

## Locales

- `en` (default, LTR)
- `ar` (RTL)

Language switcher in header preserves route and persists via cookie.

## Roles

| Role | Access |
|------|--------|
| `admin_editor` | Full CRUD, invoices, payments, import, users, settings |
| `viewer` | Read-only everywhere (UI hidden + server blocked + RLS) |

## Pages

- Dashboard, Locations, Units, Due This Month
- Awaiting Payment, Partial Payments, Fully Paid
- Payment History, Debt Aging Report
- Import Units, Users & Roles, Settings
