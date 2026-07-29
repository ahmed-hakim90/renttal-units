'use client';

import { useMemo, useState } from 'react';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';
import { toast } from 'sonner';
import { updateFeatureFlag } from '@/lib/actions/admin';
import {
  FEATURE_FLAG_REGISTRY,
  getFeatureFlagsByCategory,
  type FeatureFlagKey,
  type FeatureFlags,
} from '@/lib/features';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function FeatureFlagsForm({
  locale,
  flags: initialFlags,
}: {
  locale: string;
  flags: FeatureFlags;
}) {
  const t = useTranslations('featureFlags');
  const tc = useTranslations('common');
  const router = useRouter();
  const [flags, setFlags] = useState<FeatureFlags>(initialFlags);
  const [savedFlags, setSavedFlags] = useState<FeatureFlags>(initialFlags);
  const [propsSnapshot, setPropsSnapshot] = useState(() => JSON.stringify(initialFlags));
  const { isSubmitting, runOnce } = useSingleSubmit();
  const groups = useMemo(() => getFeatureFlagsByCategory(), []);
  const nextSnapshot = JSON.stringify(initialFlags);
  if (nextSnapshot !== propsSnapshot) {
    setPropsSnapshot(nextSnapshot);
    setFlags(initialFlags);
    setSavedFlags(initialFlags);
  }

  const dirtyKeys = useMemo(
    () => (Object.keys(flags) as FeatureFlagKey[]).filter((key) => flags[key] !== savedFlags[key]),
    [flags, savedFlags],
  );

  function toggleFlag(key: FeatureFlagKey) {
    setFlags((current) => ({ ...current, [key]: !current[key] }));
  }

  async function saveFlags() {
    if (dirtyKeys.length === 0) return;
    await runOnce(async () => {
      const failures: string[] = [];
      for (const key of dirtyKeys) {
        const result = await updateFeatureFlag(locale, key, flags[key]);
        if (!result.success) failures.push(key);
      }
      if (failures.length > 0) {
        toast.error(t('saveFailed'));
        return;
      }
      setSavedFlags(flags);
      toast.success(t('saved'));
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {groups.map(({ category, flags: keys }) => (
        <section key={category} className="surface-panel space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="icon-tile bg-primary/10 text-primary">
              <Flag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {t(`categories.${category}`)}
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            {keys.map((key) => {
              const enabled = flags[key];
              const meta = FEATURE_FLAG_REGISTRY[key];
              return (
                <div
                  key={key}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{t(`${meta.i18nKey}.title`)}</p>
                      <Badge
                        status={enabled ? 'success' : 'vacant'}
                        label={enabled ? t('enabled') : t('disabled')}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(`${meta.i18nKey}.description`)}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={t(`${meta.i18nKey}.title`)}
                    disabled={isSubmitting}
                    onClick={() => toggleFlag(key)}
                    className={cn(
                      'relative inline-flex h-7 w-12 shrink-0 self-end rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto',
                      enabled ? 'border-primary bg-primary' : 'border-border bg-muted',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                        enabled ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {dirtyKeys.length > 0 ? t('unsavedChanges') : ' '}
        </p>
        <Button type="button" disabled={isSubmitting || dirtyKeys.length === 0} onClick={saveFlags}>
          {isSubmitting ? tc('loading') : tc('save')}
        </Button>
      </div>
    </div>
  );
}
