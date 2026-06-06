import { createClient } from '@/lib/supabase/server';
import { usersRepository } from '@/lib/repositories/users';
import type { AuthContext } from '@/types/database';
import { redirect } from '@/lib/i18n/navigation';
import type { LogContext } from '@/lib/observability';

export async function getAuthContext(ctx: LogContext = {}): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await usersRepository.findById(user.id, ctx);
  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    role: profile.role,
    isAdminEditor: profile.role === 'admin_editor',
  };
}

export async function requireAuth(locale: string, ctx: LogContext = {}): Promise<AuthContext> {
  const auth = await getAuthContext(ctx);
  if (!auth) redirect({ href: '/login', locale });
  return auth!;
}

export async function requireAdminEditor(locale: string, ctx: LogContext = {}): Promise<AuthContext> {
  const auth = await requireAuth(locale, ctx);
  if (!auth.isAdminEditor) redirect({ href: '/dashboard', locale });
  return auth;
}
