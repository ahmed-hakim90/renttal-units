'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { revalidatePath } from 'next/cache';
import { redirect } from '@/lib/i18n/navigation';

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const locale = formData.get('locale') as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect({ href: '/dashboard', locale });
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
