import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function AppDialog({ open, title, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border border-border rounded-lg shadow-2xl w-full max-w-md p-4 flex flex-col gap-3"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-base font-medium text-text">{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="text-text-muted hover:text-text p-1 rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>
        <div className="text-sm text-text">{children}</div>
        {footer && <footer className="flex justify-end gap-2 pt-2">{footer}</footer>}
      </div>
    </div>
  );
}
