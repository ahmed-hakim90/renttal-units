'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

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
  const [isIos] = useState(
    () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  );
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const updateInstalled = () => setInstalled(media.matches || navigatorWithStandalone.standalone === true);
    updateInstalled();
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

  if (hidden || installed || (!installEvent && !isIos)) return null;

  const handleInstall = async () => {
    if (!installEvent) {
      setShowIosHelp(true);
      return;
    }

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
    <>
      <Button variant="outline" size="icon-sm" type="button" onClick={handleInstall} aria-label={t('install')} title={t('install')}>
        <Download className="h-4 w-4" />
      </Button>
      <Modal open={showIosHelp} onClose={() => setShowIosHelp(false)} title={t('iosInstallTitle')}>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>{t('iosInstallDescription')}</p>
          <div className="flex items-start gap-3 rounded-xl bg-muted p-4 text-foreground">
            <Share className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p>{t('iosInstallSteps')}</p>
          </div>
        </div>
      </Modal>
    </>
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
