'use client';

import { useCallback, useRef, useState } from 'react';

export function useSingleSubmit() {
  const inFlightRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runOnce = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (inFlightRef.current) return undefined;

    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      return await task();
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, []);

  return { isSubmitting, runOnce };
}
