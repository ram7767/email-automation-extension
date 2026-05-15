import { useSignals } from '@preact/signals-react/runtime';
import { useEffect, useState } from 'react';
import { Mail, Loader2, ExternalLink } from 'lucide-react';

import { AppButton } from '@/components/AppButton';
import { authStatus$ } from '@/lib/state';
import { send } from '@/lib/messages';

export function App() {
  useSignals();
  const status = authStatus$.value;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);

  useEffect(() => {
    void send({ type: 'BOOT_AUTH' });
  }, []);

  async function handleSignIn() {
    setBusy(true);
    setErr(null);
    try {
      const reply = await send({ type: 'SIGN_IN' });
      if (reply.type === 'SIGN_IN' && reply.ok) {
        const drv = await send({ type: 'BOOTSTRAP_DRIVE' });
        if (drv.type === 'BOOTSTRAP_DRIVE') {
          setBootstrapMsg(`Drive ready · ${drv.profiles.profiles.length} profile(s)`);
        } else if (drv.type === 'ERROR') {
          setErr(drv.message);
        }
      } else {
        setErr('Sign-in cancelled.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    await send({ type: 'SIGN_OUT' });
    setBusy(false);
    setBootstrapMsg(null);
  }

  return (
    <main className="p-4 flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold">EmailAutomation</h1>
      </header>

      {status === 'unknown' && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div className="h-4 w-3/4 rounded bg-surface-2 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-surface-2 animate-pulse" />
        </div>
      )}

      {status === 'signed-out' && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">
            Sign in with Google to access your resumes and send applications from LinkedIn or Indeed.
          </p>
          <AppButton onClick={handleSignIn} loading={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            Sign in with Google
          </AppButton>
          {err && <p className="text-sm text-danger">{err}</p>}
        </section>
      )}

      {status === 'signed-in' && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-text">{bootstrapMsg ?? 'Signed in.'}</p>
          <p className="text-xs text-text-muted">
            View history and dashboard in the EmailAutomation mobile app.
            <ExternalLink className="inline w-3 h-3 ml-1" aria-hidden />
          </p>
          <AppButton variant="ghost" onClick={handleSignOut} loading={busy}>
            Sign out
          </AppButton>
          {err && <p className="text-sm text-danger">{err}</p>}
        </section>
      )}
    </main>
  );
}
