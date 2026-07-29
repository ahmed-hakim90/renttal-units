'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, FileText, MapPin, ScrollText, Search } from 'lucide-react';
import { Link } from '@/lib/i18n/navigation';
import { globalSearch, type GlobalSearchResult } from '@/lib/actions/search';
import { useCurrentLocale } from '@/lib/i18n/hooks';
import { cn } from '@/lib/utils';
import { InputControl } from '@/components/ui/input';
import { LoadingRegion, SearchResultSkeleton } from '@/components/ui/skeleton';

export function GlobalSearch() {
  const t = useTranslations('common');
  const locale = useCurrentLocale();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);

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
      requestSequence.current += 1;
      return;
    }

    const requestId = ++requestSequence.current;
    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        try {
          const nextResults = await globalSearch(locale, term);
          if (requestId !== requestSequence.current) return;
          setResults(nextResults);
          setSearchFailed(false);
          setOpen(true);
        } catch {
          if (requestId !== requestSequence.current) return;
          setResults([]);
          setSearchFailed(true);
          setOpen(true);
        }
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [locale, query]);

  return (
    <div ref={wrapperRef} className="relative order-last w-full md:order-none md:min-w-64 md:flex-1">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <InputControl
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSearchFailed(false);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('globalSearchPlaceholder')}
        aria-label={t('globalSearchPlaceholder')}
        aria-expanded={open && query.trim().length >= 2}
        aria-controls="global-search-results"
        role="combobox"
        className="h-10 w-full max-w-md rounded-xl border border-border bg-background px-9 text-sm"
      />

      {open && query.trim().length >= 2 && (
        <div
          id="global-search-results"
          className="absolute start-0 top-11 z-50 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          {isPending ? (
            <LoadingRegion label={t('loading')}>
              <SearchResultSkeleton rows={4} />
            </LoadingRegion>
          ) : searchFailed ? (
            <p className="px-4 py-3 text-sm text-destructive">{t('searchFailed')}</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t('noSearchResults')}</p>
          ) : (
            results.map((result) => {
              const Icon = result.type === 'location'
                ? MapPin
                : result.type === 'unit'
                  ? Building2
                  : result.type === 'contract'
                    ? ScrollText
                    : FileText;
              return (
                <Link
                  key={`${result.type}-${result.id}`}
                  href={result.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent"
                >
                  <span className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    result.type === 'location'
                      ? 'bg-emerald-50 text-emerald-600'
                      : result.type === 'unit'
                        ? 'bg-blue-50 text-blue-600'
                        : result.type === 'contract'
                          ? 'bg-violet-50 text-violet-600'
                          : 'bg-amber-50 text-amber-600'
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
