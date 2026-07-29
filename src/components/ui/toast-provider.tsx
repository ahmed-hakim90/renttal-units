'use client';

import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      offset={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
    />
  );
}
