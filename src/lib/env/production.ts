import 'server-only';

const REQUIRED_PRODUCTION_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RATE_LIMIT_HASH_SECRET',
  'CRON_SECRET',
  'ODOO_SETTINGS_SECRET',
] as const;

export function assertProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = REQUIRED_PRODUCTION_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length === 0) return;

  throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
}

export function requireOdooSettingsSecret() {
  const secret =
    process.env.ODOO_SETTINGS_SECRET ||
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!secret?.trim()) {
    throw new Error('ODOO_SETTINGS_SECRET is required to encrypt Odoo credentials');
  }
  return secret;
}
