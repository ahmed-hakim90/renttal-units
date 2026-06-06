import { createClient } from '@/lib/supabase/server';
import { redirect } from '@/lib/i18n/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
  }

  const auth = await getAuthContext({ correlation_id: await getCorrelationId() });
  if (!auth) {
    redirect({ href: '/login', locale });
  }

  const session = auth as NonNullable<typeof auth>;

  return (
    <DashboardShell auth={session}>
      {children}
    </DashboardShell>
  );
}
