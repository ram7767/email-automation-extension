import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function AppEmptyState({ title, description, icon, action }: Props) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-8 px-4 bg-surface border border-border rounded-lg">
      <div className="text-text-muted" aria-hidden>
        {icon ?? <Inbox className="w-8 h-8" />}
      </div>
      <p className="text-sm text-text">{title}</p>
      {description && <p className="text-xs text-text-muted max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
