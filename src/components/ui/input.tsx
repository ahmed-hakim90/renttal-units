'use client';

import { useId, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  formatNumberInputValue,
  normalizeArabicDigits,
  normalizeNumberInputValue,
} from '@/lib/i18n/numbers';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Leading icon shown inside the field (RTL-aware via logical start). */
  icon?: ReactNode;
  /** Tighter ERP-style density (labels + spacing). */
  dense?: boolean;
}

export function Input({ className, label, error, id, icon, dense = false, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cn(dense ? 'space-y-1' : 'space-y-1.5')}>
      {label && (
        <label
          htmlFor={inputId}
          className={cn(
            'font-medium text-foreground',
            dense ? 'flex min-h-[2.25rem] items-end text-xs leading-snug' : 'text-sm',
          )}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span
            className={cn(
              'pointer-events-none absolute inset-y-0 start-0 z-[1] flex items-center justify-center text-muted-foreground',
              dense ? 'w-8' : 'w-10',
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <InputControl
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            'flex w-full border border-border bg-card text-sm shadow-sm',
            dense ? 'h-8 rounded-md py-1.5' : 'h-10 rounded-xl py-2',
            'transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
            'disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-70',
            icon ? (dense ? 'ps-8 pe-2.5' : 'ps-10 pe-3') : dense ? 'px-2.5' : 'px-3',
            error && 'border-destructive focus-visible:ring-destructive',
            className
          )}
          {...props}
        />
      </div>
      {error && <p id={errorId} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function InputControl(props: InputHTMLAttributes<HTMLInputElement>) {
  if (props.type === 'number') {
    return <FormattedNumberInput {...props} />;
  }

  // Password visibility toggles must keep the same input component mounted.
  // Password values are also intentionally excluded from digit normalization.
  if (props.autoComplete === 'current-password' || props.autoComplete === 'new-password') {
    return <input {...props} />;
  }

  if (!props.type || ['text', 'search', 'tel', 'email', 'url'].includes(props.type)) {
    return <DigitNormalizingInput {...props} />;
  }

  return <input {...props} />;
}

function DigitNormalizingInput({
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = normalizeArabicDigits(event.currentTarget.value);
    onChange?.(event);
  }

  return <input {...props} onChange={handleChange} />;
}

function FormattedNumberInput({
  value,
  defaultValue,
  name,
  onChange,
  disabled,
  inputMode,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(() => (
    normalizeNumberInputValue(defaultValue == null ? '' : String(defaultValue))
  ));
  const rawValue = controlled
    ? normalizeNumberInputValue(value == null ? '' : String(value))
    : uncontrolledValue;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const inputType = 'inputType' in event.nativeEvent
      ? String((event.nativeEvent as InputEvent).inputType)
      : '';
    const enteredValue = inputType.startsWith('delete') && !event.currentTarget.value.includes(',')
      ? event.currentTarget.value.replaceAll('.', '')
      : event.currentTarget.value;
    const normalizedValue = normalizeNumberInputValue(enteredValue);
    if (!controlled) {
      setUncontrolledValue(normalizedValue);
    }

    // Keep existing form state canonical while showing grouped digits.
    event.currentTarget.value = normalizedValue;
    onChange?.(event);
  }

  return (
    <>
      <input
        {...props}
        type="text"
        inputMode={inputMode ?? 'decimal'}
        dir="ltr"
        value={formatNumberInputValue(rawValue)}
        onChange={handleChange}
        disabled={disabled}
      />
      {name && (
        <input
          type="hidden"
          name={name}
          value={rawValue}
          disabled={disabled}
          readOnly
        />
      )}
    </>
  );
}
