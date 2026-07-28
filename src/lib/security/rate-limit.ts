import { createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

type RateLimitRow = {
  key_hash: string;
  email_hash: string;
  ip_hash: string;
  attempts: number;
  window_start: string;
  locked_until: string | null;
};

function getRateLimitSecret() {
  const secret = process.env.RATE_LIMIT_HASH_SECRET;
  if (!secret) {
    throw new Error('RATE_LIMIT_HASH_SECRET is not configured');
  }
  return secret;
}

export function hashRateLimitValue(value: string) {
  return createHmac('sha256', getRateLimitSecret()).update(value).digest('hex');
}

export async function getClientIp() {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor ||
    headersList.get('cf-connecting-ip') ||
    headersList.get('x-real-ip') ||
    'unknown'
  );
}

export async function buildRateLimitKey(scope: string, identity: string) {
  const normalizedIdentity = identity.trim().toLowerCase();
  const ip = await getClientIp();
  const emailHash = hashRateLimitValue(normalizedIdentity);
  const ipHash = hashRateLimitValue(ip);

  return {
    emailHash,
    ipHash,
    keyHash: hashRateLimitValue(`${scope}:${normalizedIdentity}:${ip}`),
  };
}

export async function isRateLimited(
  keyHash: string,
  maxAttempts: number,
  windowMs: number,
) {
  const supabaseAdmin = createAdminClient();
  const { data } = await supabaseAdmin
    .from('auth_rate_limits')
    .select('attempts, window_start, locked_until')
    .eq('key_hash', keyHash)
    .maybeSingle<RateLimitRow>();

  if (!data) return false;

  const now = Date.now();
  if (data.locked_until && new Date(data.locked_until).getTime() > now) {
    return true;
  }

  const windowStart = new Date(data.window_start).getTime();
  return now - windowStart < windowMs && data.attempts >= maxAttempts;
}

export async function recordRateLimitFailure(
  key: { keyHash: string; emailHash: string; ipHash: string },
  maxAttempts: number,
  windowMs: number,
) {
  const supabaseAdmin = createAdminClient();
  const now = new Date();
  const { data } = await supabaseAdmin
    .from('auth_rate_limits')
    .select('attempts, window_start')
    .eq('key_hash', key.keyHash)
    .maybeSingle<RateLimitRow>();

  const existingWindowStart = data ? new Date(data.window_start) : now;
  const withinWindow = now.getTime() - existingWindowStart.getTime() < windowMs;
  const attempts = withinWindow ? data?.attempts ?? 0 : 0;
  const nextAttempts = attempts + 1;
  const windowStart = withinWindow ? existingWindowStart : now;
  const lockedUntil =
    nextAttempts >= maxAttempts
      ? new Date(now.getTime() + windowMs).toISOString()
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

export async function clearRateLimit(keyHash: string) {
  const supabaseAdmin = createAdminClient();
  await supabaseAdmin.from('auth_rate_limits').delete().eq('key_hash', keyHash);
}
