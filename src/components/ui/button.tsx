import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'issue' | 'payment';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
}

const variants = {
  primary:
    'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/95',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70',
  destructive:
    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/95',
  ghost:
    'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
  outline:
    'border border-border bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
  issue:
    'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/95',
  payment:
    'bg-success text-success-foreground shadow-sm hover:bg-success/90 active:bg-success/95',
};

const sizes = {
  sm: 'h-9 gap-1.5 rounded-lg px-3 text-sm',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-11 gap-2 rounded-xl px-5 text-base',
  icon: 'size-10 shrink-0 rounded-xl p-0',
  'icon-sm': 'size-9 shrink-0 rounded-lg p-0',
};

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'className'> = {}) {
  return cn(
    'inline-flex min-w-fit select-none items-center justify-center whitespace-nowrap font-medium leading-none',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
    variants[variant],
    sizes[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    disabled,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={buttonStyles({ variant, size, className })}
      disabled={disabled}
      {...props}
    />
  );
});
