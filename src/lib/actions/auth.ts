'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { redirect } from '@/lib/i18n/navigation';
import {
  buildRateLimitKey,
  clearRateLimit,
  isRateLimited,
  recordRateLimitFailure,
} from '@/lib/security/rate-limit';
import { validateStaffPassword } from '@/lib/validation/password-policy';

const LOGIN_RATE_LIMIT_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const GENERIC_LOGIN_ERROR = 'invalid_credentials';
const GENERIC_PASSWORD_CHANGE_ERROR = 'change_password_failed';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }

  const rateLimitKey = await buildRateLimitKey('login', email);
  if (await isRateLimited(rateLimitKey.keyHash, LOGIN_RATE_LIMIT_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_MS)) {
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await recordRateLimitFailure(rateLimitKey, LOGIN_RATE_LIMIT_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_MS);
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }

  await clearRateLimit(rateLimitKey.keyHash);
  return { success: true };
}

export async function changePassword(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  const passwordError = validateStaffPassword(password);
  if (passwordError) {
    return { success: false, error: passwordError };
  }
  if (password !== confirmPassword) {
    return { success: false, error: 'passwords_mismatch' };
  }

  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await getAuthContext(ctx);
  if (!auth) {
    return { success: false, error: GENERIC_PASSWORD_CHANGE_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { success: false, error: GENERIC_PASSWORD_CHANGE_ERROR };
  }

  const { error: clearError } = await supabase.rpc('clear_own_must_change_password');
  if (clearError) {
    return { success: false, error: GENERIC_PASSWORD_CHANGE_ERROR };
  }

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
