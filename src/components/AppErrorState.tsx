import { AlertTriangle } from 'lucide-react';
import { AppButton } from './AppButton';

interface Props {
  title?: string;
  message: string;
  onRetry?: () => void;
}

const ISSUE_URL =
  'https://github.com/softsuave/email-automation-extension/issues/new';

export function AppErrorState({ title = "Something didn't load", message, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center text-center gap-3 py-8 px-4 bg-surface border border-danger/30 rounded-lg"
    >
      <AlertTriangle className="w-8 h-8 text-danger" aria-hidden />
      <p className="text-sm text-text">{title}</p>
      <p className="text-xs text-text-muted max-w-xs">{message}</p>
      <div className="flex gap-2 mt-1">
        {onRetry && (
          <AppButton variant="ghost" onClick={onRetry}>
            Retry
          </AppButton>
        )}
        <a
          href={ISSUE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-text-muted underline self-center"
        >
          Report
        </a>
      </div>
    </div>
  );
}
