'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { InputControl } from '@/components/ui/input';

const LIST_SEARCH_CHANGE_EVENT = 'renttal:list-search';

function readSearchFromLocation() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('search') ?? '';
}

/** Client-side list search value that stays in sync without triggering a route soft-navigation. */
export function useListSearchValue() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');

  useEffect(() => {
    function sync() {
      setSearch(readSearchFromLocation());
    }

    window.addEventListener(LIST_SEARCH_CHANGE_EVENT, sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener(LIST_SEARCH_CHANGE_EVENT, sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  return search;
}

export function ListSearch() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(() => searchParams.get('search') ?? '');
  const updateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (updateTimeout.current) clearTimeout(updateTimeout.current);
  }, []);

  function commitSearch(nextValue: string) {
    const params = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : searchParams.toString(),
    );

    if (nextValue.trim()) params.set('search', nextValue);
    else params.delete('search');

    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new Event(LIST_SEARCH_CHANGE_EVENT));
  }

  function updateSearch(nextValue: string, immediately = false) {
    const normalizedValue = nextValue.slice(0, 200);
    setValue(normalizedValue);
    if (updateTimeout.current) clearTimeout(updateTimeout.current);

    if (immediately) {
      commitSearch(normalizedValue);
      return;
    }

    updateTimeout.current = setTimeout(() => commitSearch(normalizedValue), 250);
  }

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <InputControl
        type="search"
        value={value}
        onChange={(event) => updateSearch(event.target.value)}
        aria-label={t('listSearchLabel')}
        placeholder={t('listSearchPlaceholder')}
        className="h-10 w-full rounded-xl border border-border bg-background px-9 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
      />
      {value && (
        <button
          type="button"
          onClick={() => updateSearch('', true)}
          title={t('clearSearch')}
          aria-label={t('clearSearch')}
          className="absolute end-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
