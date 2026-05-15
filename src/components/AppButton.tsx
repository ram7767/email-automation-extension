import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium ' +
  'transition-colors duration-[var(--motion-fast)] ease-snappy ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
};

export function AppButton({ variant = 'primary', loading, children, disabled, className, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className ?? ''}`}
      aria-busy={loading || undefined}
    >
      {loading && (
        <span
          className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
