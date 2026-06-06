'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { redirect } from '@/lib/i18n/navigation';
import { headers } from 'next/headers';
import { createHmac } from 'node:crypto';

const LOGIN_RATE_LIMIT_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const GENERIC_LOGIN_ERROR = 'Invalid email or password';

type LoginRateLimitRow = {
  key_hash: string;
  email_hash: string;
  ip_hash: string;
  attempts: number;
  window_start: string;
  locked_until: string | null;
};

function hashRateLimitValue(value: string) {
  const secret = process.env.RATE_LIMIT_HASH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Rate limit hash secret is not configured');
  return createHmac('sha256', secret).update(value).digest('hex');
}

async function getClientIp() {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor ||
    headersList.get('cf-connecting-ip') ||
    headersList.get('x-real-ip') ||
    'unknown'
  );
}

async function getRateLimitKey(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const ip = await getClientIp();
  const emailHash = hashRateLimitValue(normalizedEmail);
  const ipHash = hashRateLimitValue(ip);

  return {
    emailHash,
    ipHash,
    keyHash: hashRateLimitValue(`${normalizedEmail}:${ip}`),
  };
}

async function isLoginBlocked(keyHash: string) {
  const supabaseAdmin = createAdminClient();
  const { data } = await supabaseAdmin
    .from('auth_rate_limits')
    .select('attempts, window_start, locked_until')
    .eq('key_hash', keyHash)
    .maybeSingle<LoginRateLimitRow>();

  if (!data) return false;

  const now = Date.now();
  if (data.locked_until && new Date(data.locked_until).getTime() > now) {
    return true;
  }

  const windowStart = new Date(data.window_start).getTime();
  return now - windowStart < LOGIN_RATE_LIMIT_WINDOW_MS && data.attempts >= LOGIN_RATE_LIMIT_ATTEMPTS;
}

async function recordFailedLogin(key: { keyHash: string; emailHash: string; ipHash: string }) {
  const supabaseAdmin = createAdminClient();
  const now = new Date();
  const { data } = await supabaseAdmin
    .from('auth_rate_limits')
    .select('attempts, window_start')
    .eq('key_hash', key.keyHash)
    .maybeSingle<LoginRateLimitRow>();

  const existingWindowStart = data ? new Date(data.window_start) : now;
  const withinWindow = now.getTime() - existingWindowStart.getTime() < LOGIN_RATE_LIMIT_WINDOW_MS;
  const attempts = withinWindow ? data?.attempts ?? 0 : 0;
  const nextAttempts = attempts + 1;
  const windowStart = withinWindow ? existingWindowStart : now;
  const lockedUntil =
    nextAttempts >= LOGIN_RATE_LIMIT_ATTEMPTS
      ? new Date(now.getTime() + LOGIN_RATE_LIMIT_WINDOW_MS).toISOString()
      : null;

  await supabaseAdmin.from('auth_rate_limits').upsert({
    key_hash: key.keyHash,
    email_hash: key.emailHash,
    ip_hash: key.ipHash,
    attempts: nextAttempts,
    window_start: windowStart.toISOString(),
    locked_until: lockedUntil,
    updated_at: now.toISOString(),
  });
}

async function clearLoginRateLimit(keyHash: string) {
  const supabaseAdmin = createAdminClient();
  await supabaseAdmin.from('auth_rate_limits').delete().eq('key_hash', keyHash);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }

  const rateLimitKey = await getRateLimitKey(email);
  if (await isLoginBlocked(rateLimitKey.keyHash)) {
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await recordFailedLogin(rateLimitKey);
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }

  await clearLoginRateLimit(rateLimitKey.keyHash);
  return { success: true };
}

export async function signOut(locale: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: '/login', locale });
}

export async function getSession() {
  const ctx = { correlation_id: await getCorrelationId() };
  return getAuthContext(ctx);
}
