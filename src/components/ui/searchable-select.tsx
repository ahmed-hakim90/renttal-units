'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { matchesSearch } from '@/lib/search/matches-search';
import { cn } from '@/lib/utils';
import { InputControl } from '@/components/ui/input';

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra strings used only for filtering (codes, aliases, etc.). */
  keywords?: Array<string | number | null | undefined>;
  disabled?: boolean;
};

type SearchableSelectProps = {
  label?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  icon?: ReactNode;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  dropdownClassName?: string;
  /** Force search UI even for short lists. Default: auto when options > 6. */
  searchable?: boolean;
  emptyMessage?: string;
};

export function SearchableSelect({
  label,
  name,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  searchPlaceholder,
  error,
  icon,
  compact = false,
  disabled = false,
  className,
  dropdownClassName,
  searchable,
  emptyMessage,
}: SearchableSelectProps) {
  const t = useTranslations('common');
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const enableSearch = searchable ?? options.length > 6;
  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = useMemo(() => {
    if (!enableSearch || !query.trim()) return options;
    return options.filter((option) => (
      matchesSearch(query, [option.label, option.value, ...(option.keywords ?? [])])
    ));
  }, [enableSearch, options, query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
        setActiveIndex(0);
        onBlur?.();
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onBlur, open]);

  function selectValue(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    onBlur?.();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      setActiveIndex(0);
      onBlur?.();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option && !option.disabled) selectValue(option.value);
    }
  }

  return (
    <div className={cn('relative min-w-0 space-y-1', compact && 'space-y-0', className)} ref={rootRef}>
      {label && !compact && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}

      {name && <input type="hidden" name={name} value={value} readOnly />}

      <div className="relative min-w-0">
        {(icon || enableSearch) && (
          <span
            className={cn(
              'pointer-events-none absolute inset-y-0 start-0 z-[1] flex items-center justify-center text-muted-foreground',
              compact ? 'w-7' : 'w-10',
            )}
            aria-hidden="true"
          >
            {icon ?? <Search className={compact ? 'size-3.5' : 'size-4'} />}
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          title={selected?.label || placeholder || t('select')}
          onClick={() => {
            if (disabled) return;
            setOpen((previous) => !previous);
          }}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            'flex w-full min-w-0 max-w-full items-center overflow-hidden border border-border bg-card text-start text-sm shadow-sm',
            'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
            'disabled:cursor-not-allowed disabled:opacity-50',
            compact
              ? 'h-7 rounded-md border-transparent bg-transparent px-2 pe-7 shadow-none hover:border-border'
              : 'h-10 rounded-xl px-3 pe-8',
            (icon || enableSearch) && (compact ? 'ps-7' : 'ps-10'),
            error && 'border-destructive focus-visible:ring-destructive/30',
            !selected?.label && 'text-muted-foreground',
          )}
        >
          <span className="min-w-0 flex-1 truncate">{selected?.label || placeholder || t('select')}</span>
          <ChevronDown
            className={cn(
              'pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>

      {open && (
        <div
          className={cn(
            'absolute start-0 z-50 mt-1 w-full min-w-[14rem] max-w-[min(28rem,90vw)] overflow-hidden rounded-lg border border-border bg-card shadow-lg',
            compact && 'min-w-[16rem]',
            dropdownClassName,
          )}
          onKeyDown={onListKeyDown}
        >
          {enableSearch && (
            <div className="relative border-b border-border p-1.5">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <InputControl
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder={searchPlaceholder ?? t('search')}
                aria-label={searchPlaceholder ?? t('search')}
                autoFocus
                className="h-8 w-full rounded-md border border-border bg-background ps-8 pe-2 text-sm"
              />
            </div>
          )}

          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-56 overflow-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {emptyMessage ?? t('noSearchResults')}
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <li key={`${option.value}-${index}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        isActive && 'bg-accent',
                        isSelected && 'font-medium text-primary',
                        !isActive && 'hover:bg-muted/60',
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => {
                        if (!option.disabled) selectValue(option.value);
                      }}
                    >
                      <Check
                        className={cn(
                          'size-3.5 shrink-0',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="min-w-0 truncate" dir="auto">{option.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {error && !compact && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
