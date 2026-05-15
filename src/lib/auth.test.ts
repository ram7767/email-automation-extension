import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut, bootAuthStatus, getAccessToken } from './auth';
import { authStatus$ } from './state';

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStatus$.value = 'unknown';
  });

  afterEach(() => {
    void chrome.storage.session.clear();
  });

  it('signIn returns true and flips status when token is granted', async () => {
    (chrome.identity.getAuthToken as ReturnType<typeof vi.fn>).mockImplementation(
      (_o: unknown, cb: (t: string) => void) => cb('valid-token'),
    );
    const ok = await signIn();
    expect(ok).toBe(true);
    expect(authStatus$.value).toBe('signed-in');
  });

  it('signIn returns false and stays signed-out when getAuthToken yields nothing', async () => {
    (chrome.identity.getAuthToken as ReturnType<typeof vi.fn>).mockImplementation(
      (_o: unknown, cb: (t?: string) => void) => cb(undefined),
    );
    const ok = await signIn();
    expect(ok).toBe(false);
    expect(authStatus$.value).toBe('signed-out');
  });

  it('signOut clears session storage and revokes', async () => {
    (chrome.identity.getAuthToken as ReturnType<typeof vi.fn>).mockImplementation(
      (_o: unknown, cb: (t: string) => void) => cb('t'),
    );
    await getAccessToken(false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await signOut();
    expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://oauth2.googleapis.com/revoke'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(authStatus$.value).toBe('signed-out');
  });

  it('bootAuthStatus reports signed-in when a non-interactive token exists', async () => {
    (chrome.identity.getAuthToken as ReturnType<typeof vi.fn>).mockImplementation(
      (_o: unknown, cb: (t: string) => void) => cb('cached'),
    );
    const status = await bootAuthStatus();
    expect(status).toBe('signed-in');
    expect(authStatus$.value).toBe('signed-in');
  });
});
