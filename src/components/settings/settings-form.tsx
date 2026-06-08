'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateSetting } from '@/lib/actions/admin';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { toast } from 'sonner';
import type { Setting } from '@/types/database';

export function SettingsForm({ settings, locale, canEdit }: { settings: Setting[]; locale: string; canEdit: boolean }) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const companySetting = settings.find((s) => s.key === 'company_name');
  const termsSetting = settings.find((s) => s.key === 'default_payment_terms_days');
  const graceSetting = settings.find((s) => s.key === 'overdue_grace_days');
  const { isSubmitting, runOnce } = useSingleSubmit();

  const companyValue = companySetting?.value as { en?: string; ar?: string } | undefined;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    await runOnce(async () => {
    const fd = new FormData(e.currentTarget);

    await Promise.all([
      updateSetting(locale, 'company_name', {
        en: fd.get('company_name_en'),
        ar: fd.get('company_name_ar'),
      }),
      updateSetting(locale, 'default_payment_terms_days', Number(fd.get('payment_terms'))),
      updateSetting(locale, 'overdue_grace_days', Number(fd.get('grace_days'))),
    ]);

    toast.success(t('saved'));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6">
      {!canEdit && <p className="text-sm text-amber-600">{t('adminOnly')}</p>}
      <Input name="company_name_en" label={t('companyNameEn')} defaultValue={companyValue?.en ?? ''} disabled={!canEdit || isSubmitting} />
      <Input name="company_name_ar" label={t('companyNameAr')} defaultValue={companyValue?.ar ?? ''} disabled={!canEdit || isSubmitting} />
      <Input name="payment_terms" label={t('defaultPaymentTerms')} type="number" defaultValue={String(termsSetting?.value ?? 30)} disabled={!canEdit || isSubmitting} />
      <Input name="grace_days" label={t('overdueGraceDays')} type="number" defaultValue={String(graceSetting?.value ?? 7)} disabled={!canEdit || isSubmitting} />
      {canEdit && <Button type="submit" disabled={isSubmitting}>{isSubmitting ? tc('loading') : tc('save')}</Button>}
    </form>
  );
}
