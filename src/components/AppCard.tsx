import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function AppCard({ children, className, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={`bg-surface border border-border rounded-lg p-4 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
