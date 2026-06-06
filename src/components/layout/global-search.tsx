'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, FileText, Search } from 'lucide-react';
import { Link } from '@/lib/i18n/navigation';
import { globalSearch, type GlobalSearchResult } from '@/lib/actions/search';
import { useCurrentLocale } from '@/lib/i18n/hooks';
import { cn } from '@/lib/utils';

export function GlobalSearch() {
  const t = useTranslations('common');
  const locale = useCurrentLocale();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      return;
    }

    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        const nextResults = await globalSearch(locale, term);
        setResults(nextResults);
        setOpen(true);
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [locale, query]);

  return (
    <div ref={wrapperRef} className="relative order-last w-full md:order-none md:min-w-64 md:flex-1">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('globalSearchPlaceholder')}
        className="h-10 w-full max-w-md rounded-xl border border-border bg-background px-9 text-sm"
      />

      {open && query.trim().length >= 2 && (
        <div className="absolute start-0 top-11 z-50 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {isPending ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t('loading')}</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t('noSearchResults')}</p>
          ) : (
            results.map((result) => {
              const Icon = result.type === 'unit' ? Building2 : FileText;
              return (
                <Link
                  key={`${result.type}-${result.id}`}
                  href={result.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent"
                >
                  <span className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    result.type === 'unit' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                  )}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{result.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                  </span>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
