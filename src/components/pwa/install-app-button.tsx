'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallAppButton() {
  const t = useTranslations('common.pwa');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  );
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const updateInstalled = () => setInstalled(media.matches);
    media.addEventListener('change', updateInstalled);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      media.removeEventListener('change', updateInstalled);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (hidden || installed || !installEvent) return null;

  const handleInstall = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      setInstallEvent(null);
    } else {
      setHidden(true);
    }
  };

  return (
    <Button variant="outline" size="sm" type="button" onClick={handleInstall} className="gap-2">
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">{t('install')}</span>
    </Button>
  );
}

export function InstallAppHint() {
  const t = useTranslations('common.pwa');
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  );

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const updateInstalled = () => setInstalled(media.matches);
    media.addEventListener('change', updateInstalled);
    return () => media.removeEventListener('change', updateInstalled);
  }, []);

  if (!installed) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
      <Check className="h-3 w-3" />
      {t('installed')}
    </span>
  );
}
