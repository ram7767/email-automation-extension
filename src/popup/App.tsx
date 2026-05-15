import { useSignals } from '@preact/signals-react/runtime';
import { authStatus$ } from '@/lib/state';
import { signIn } from '@/lib/auth';
import { AppButton } from '@/components/AppButton';
import { Mail } from 'lucide-react';

export function App() {
  useSignals();
  const status = authStatus$.value;

  return (
    <main className="p-4 flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold">EmailAutomation</h1>
      </header>

      {status === 'signed-out' && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">
            Sign in with Google to access your resumes and send applications from LinkedIn or Indeed.
          </p>
          <AppButton onClick={signIn}>Sign in with Google</AppButton>
        </section>
      )}

      {status === 'unknown' && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div className="h-4 w-3/4 rounded bg-surface-2 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-surface-2 animate-pulse" />
        </div>
      )}

      {status === 'signed-in' && (
        <p className="text-sm text-text-muted">
          Signed in. Profile management lands in Phase A2.
        </p>
      )}
    </main>
  );
}
