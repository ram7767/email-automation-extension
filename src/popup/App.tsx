import { useSignals } from '@preact/signals-react/runtime';
import { useEffect, useState } from 'react';
import { Mail, Settings } from 'lucide-react';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { authStatus$, profiles$ } from '@/lib/state';
import { send } from '@/lib/messages';
import type { RuntimeEvent, SentSummary } from '@/lib/messages';

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'just now';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function App() {
  useSignals();
  const status = authStatus$.value;
  const index = profiles$.value;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [lastSent, setLastSent] = useState<SentSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled && authStatus$.value === 'unknown') {
        authStatus$.value = 'signed-out';
        setErr('Background service worker did not respond. Try reloading the extension.');
      }
    }, 4000);
    void send({ type: 'BOOT_AUTH' })
      .catch((e) => {
        if (cancelled) return;
        authStatus$.value = 'signed-out';
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => clearTimeout(timeoutId));
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (status === 'signed-in' && !bootstrapped) {
      void (async () => {
        try {
          const drv = await send({ type: 'BOOTSTRAP_DRIVE' });
          if (drv.type === 'BOOTSTRAP_DRIVE') {
            profiles$.value = drv.profiles;
            setBootstrapped(true);
          } else if (drv.type === 'ERROR') {
            setErr(drv.message);
          }
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      })();
    }
  }, [status, bootstrapped]);

  useEffect(() => {
    if (status !== 'signed-in') return;
    let cancelled = false;
    void (async () => {
      try {
        const reply = await send({ type: 'GET_LAST_SENT' });
        if (!cancelled && reply.type === 'GET_LAST_SENT') {
          setLastSent(reply.sent);
        }
      } catch {
        /* popup may open before SW is ready; not critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, bootstrapped]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage?.addListener) return;
    const listener = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const ev = msg as RuntimeEvent;
      if (ev.type === 'EMAIL_SENT') {
        setLastSent({ subject: ev.subject, sentAt: ev.sentAt });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener?.(listener);
    };
  }, []);

  async function handleSignIn() {
    setBusy(true);
    setErr(null);
    try {
      const reply = await send({ type: 'SIGN_IN' });
      if (reply.type === 'SIGN_IN' && !reply.ok) setErr('Sign-in cancelled.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    await send({ type: 'SIGN_OUT' });
    profiles$.value = null;
    setBootstrapped(false);
    setBusy(false);
  }

  function openSettings() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  }

  const profileCount = index?.profiles.length ?? 0;
  const categoryCount =
    index?.profiles.reduce((sum, p) => sum + p.categories.length, 0) ?? 0;

  return (
    <main className="p-4 flex flex-col gap-4 w-[380px]">
      <header className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold text-text">EmailAutomation</h1>
      </header>

      {status === 'unknown' && (
        <div className="flex flex-col gap-2" aria-busy="true" data-testid="popup-loading">
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
            Sign in with Google
          </AppButton>
          {err && (
            <p role="alert" className="text-sm text-danger">
              {err}
            </p>
          )}
        </section>
      )}

      {status === 'signed-in' && (
        <section className="flex flex-col gap-3">
          <AppCard>
            <p className="text-sm text-text">
              {profileCount} profile{profileCount === 1 ? '' : 's'} ·{' '}
              {categoryCount} categor{categoryCount === 1 ? 'y' : 'ies'}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Open the EmailAutomation mobile app for sent activity.
            </p>
          </AppCard>
          {lastSent && (
            <p
              className="text-xs text-text-muted"
              data-testid="popup-last-sent"
              aria-live="polite"
            >
              Last sent: {lastSent.subject ?? '(no subject)'} · {relativeTime(lastSent.sentAt)}
            </p>
          )}
          <AppButton onClick={openSettings} aria-label="Manage in settings">
            <Settings className="w-4 h-4" aria-hidden />
            Manage in settings
          </AppButton>
          <AppButton variant="ghost" onClick={handleSignOut} loading={busy}>
            Sign out
          </AppButton>
          {err && (
            <p role="alert" className="text-sm text-danger">
              {err}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
