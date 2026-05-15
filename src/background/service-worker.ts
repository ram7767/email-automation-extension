/// <reference types="chrome" />
import { bootAuthStatus, signIn, signOut } from '@/lib/auth';
import { ensureRoot } from '@/lib/drive';
import type { Msg, Reply } from '@/lib/messages';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    void chrome.storage.local.set({ installedAt: new Date().toISOString() });
  }
});

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse: (r: Reply) => void) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'PING':
          sendResponse({ type: 'PING', ok: true, ts: Date.now() });
          break;
        case 'BOOT_AUTH': {
          const status = await bootAuthStatus();
          sendResponse({ type: 'BOOT_AUTH', status });
          break;
        }
        case 'SIGN_IN': {
          const ok = await signIn();
          sendResponse({ type: 'SIGN_IN', ok });
          break;
        }
        case 'SIGN_OUT': {
          await signOut();
          sendResponse({ type: 'SIGN_OUT', ok: true });
          break;
        }
        case 'BOOTSTRAP_DRIVE': {
          const r = await ensureRoot();
          sendResponse({
            type: 'BOOTSTRAP_DRIVE',
            ok: true,
            rootFolderId: r.rootFolderId,
            profiles: r.profilesIndex,
          });
          break;
        }
      }
    } catch (e) {
      sendResponse({ type: 'ERROR', message: e instanceof Error ? e.message : String(e) });
    }
  })();
  return true;
});
