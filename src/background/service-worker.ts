/// <reference types="chrome" />

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    void chrome.storage.local.set({ installedAt: new Date().toISOString() });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ ok: true, ts: Date.now() });
    return false;
  }
  return false;
});
