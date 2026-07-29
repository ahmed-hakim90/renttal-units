# Rental Units Management System

Bilingual (English/Arabic) internal dashboard for managing rental units in Saudi Arabia.

## Tech Stack

- Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- Supabase (Auth, Database, RLS, Storage)
- next-intl (i18n with RTL support)
- Odoo XML-RPC integration (optional, feature-flagged)
- Sentry (observability)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.local.example` to `.env.local` and fill in values:

```bash
cp .env.local.example .env.local
```

Required for production:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RATE_LIMIT_HASH_SECRET`
- `CRON_SECRET`
- `ODOO_SETTINGS_SECRET`

### 3. Apply database migrations

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Apply **all** migrations under `supabase/migrations/` in lexical order before deploying app code.

### Pre-flight checks (before migration #3 and later)

```sql
SELECT odoo_product_id, COUNT(*) FROM units WHERE odoo_product_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
SELECT odoo_partner_id, COUNT(*) FROM tenants WHERE odoo_partner_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
SELECT odoo_invoice_id, COUNT(*) FROM invoices WHERE odoo_invoice_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
SELECT unit_id, COUNT(*) FROM contracts WHERE status = 'active' GROUP BY 1 HAVING COUNT(*) > 1;
```

### 4. Create first system owner

Sign up via Supabase Auth, then assign the system-owner role:

```sql
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE is_system_owner = true LIMIT 1)
WHERE email = 'your@email.com';
```

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3000/ar/dashboard](http://localhost:3000/ar/dashboard)

## Release Gate

```bash
npm run lint
npx tsc --noEmit
npm run test:odoo
npm run build
```

## Architecture

```
UI → Server Actions → Services → Repositories → Supabase
```

## Roles & Permissions

Granular permissions are stored in `roles` / `role_permissions`.
System owner has full access. Custom roles can be created from the Roles page.
Only system owners can assign the system-owner role.

## Odoo Rollout

1. Configure Odoo in Settings (`odoo.manage`)
2. Link units to Odoo products
3. Run Import Center preview and commit manually
4. Issue one local invoice and confirm outbound outbox sync
5. Enable cron (`vercel.json` schedules `/api/cron/odoo-sync` every 15 minutes) with `CRON_SECRET`
6. Keep feature flag `odoo_cron_sync` on only after step 5 succeeds

## Locales

- `en` (LTR)
- `ar` (RTL)

## Pages

- Dashboard, Locations, Units, Contracts
- Due Now, Awaiting Payment, Partial Payments, Fully Paid
- Payment History, Debt Aging, Location Statement
- Import Center, Users, Roles, Feature Flags, Settings
