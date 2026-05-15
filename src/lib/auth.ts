import { authStatus$ } from './state';

const TOKEN_KEY = 'auth.accessToken';

export async function getAccessToken(interactive = false): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) return resolve(null);
      const t = typeof token === 'string' ? token : (token as { token: string }).token;
      void chrome.storage.session.set({ [TOKEN_KEY]: t });
      resolve(t);
    });
  });
}

export async function signIn(): Promise<void> {
  const token = await getAccessToken(true);
  authStatus$.value = token ? 'signed-in' : 'signed-out';
}

export async function signOut(): Promise<void> {
  const stored = await chrome.storage.session.get(TOKEN_KEY);
  const token: string | undefined = stored[TOKEN_KEY];
  if (token) {
    chrome.identity.removeCachedAuthToken({ token });
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      });
    } catch {
      /* surface only if we add a logger that strips tokens */
    }
  }
  await chrome.storage.session.clear();
  authStatus$.value = 'signed-out';
}

export async function bootAuthStatus(): Promise<void> {
  const token = await getAccessToken(false);
  authStatus$.value = token ? 'signed-in' : 'signed-out';
}
