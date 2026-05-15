import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const AppInput = forwardRef<HTMLInputElement, Props>(function AppInput(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const inputId = id ?? `inp-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1">
      {label && <span className="text-sm text-text">{label}</span>}
      <input
        ref={ref}
        id={inputId}
        {...rest}
        className={`bg-surface-2 border border-border rounded-md px-3 h-9 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-[var(--color-focus-ring)]/40 ${className ?? ''}`}
      />
      {hint && !error && <span className="text-xs text-text-muted">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  );
});
