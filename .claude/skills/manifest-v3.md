# Manifest V3 conventions — EmailAutomation extension

## Service worker (background)
- Single entry: `src/background/service-worker.ts`. Bundled by Vite as one file.
- The SW is **terminated when idle** (~30s). All persistent state lives in `chrome.storage.local`. Hold no module-level state that you can't rebuild from storage.
- Long-lived async work uses `chrome.alarms` (not `setInterval`/`setTimeout` > 30s — they get killed). RxJS streams must be re-subscribed on SW wake.
- Wake triggers we care about:
  - `chrome.runtime.onInstalled` → run migrations
  - `chrome.runtime.onMessage` → main RPC dispatcher
  - `chrome.alarms.onAlarm` → periodic Drive sync

## Messaging
- Popup ↔ SW: `chrome.runtime.sendMessage` for one-shot RPC. Long-lived UI subscriptions use `chrome.runtime.connect` (`Port`) so the SW knows when popup closes.
- Content script ↔ SW: `chrome.runtime.sendMessage` (one-shot only). Content scripts are short-lived per page nav.
- All messages typed via `src/lib/messages.ts`. SW dispatcher returns `true` from `onMessage` only when reply is async (otherwise returns `undefined`).

## Permissions in manifest.json
```json
{
  "manifest_version": 3,
  "name": "EmailAutomation",
  "version": "0.1.0",
  "permissions": ["identity", "storage", "alarms", "scripting", "activeTab"],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://*.indeed.com/*",
    "https://www.googleapis.com/*",
    "https://oauth2.googleapis.com/*"
  ],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html" },
  "options_page": "options.html",
  "content_scripts": [{
    "matches": ["https://www.linkedin.com/*", "https://*.indeed.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "oauth2": {
    "client_id": "REPLACE_WITH_CHROME_EXTENSION_OAUTH_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/gmail.send"
    ]
  },
  "key": "PASTE_KEY_HERE_TO_PIN_EXTENSION_ID",
  "minimum_chrome_version": "120"
}
```

## Identity flow
- Use `chrome.identity.getAuthToken({ interactive: true })` for first sign-in.
- Subsequent calls use `{ interactive: false }` and fall through to interactive on failure.
- On sign-out: `chrome.identity.removeCachedAuthToken({ token })` AND POST to `https://oauth2.googleapis.com/revoke?token=...` AND `chrome.storage.session.clear()`.

## Content scripts
- Each site gets its own file: `src/content/linkedin.ts`, `src/content/indeed.ts`. Vite produces one bundle each, loaded conditionally based on `match`.
- Inject UI inside a Shadow DOM root attached to a `<div>` we create — never the host page.
- Use `MutationObserver` (debounced 200ms) to re-detect emails on SPA navigations. Disconnect on `pagehide`.
- Selectors live in `src/content/selectors.ts` — one place to update when LinkedIn/Indeed change DOM. The `linkedin-indeed-selector-auditor` agent watches this file.

## Build constraints
- No `eval`, no `new Function`, no remote scripts (CSP enforced).
- All deps must be bundled — manifest V3 disallows dynamic remote code.
- Source maps generated for dev builds, stripped for releases.

## Common pitfalls (avoid these)
- ❌ Using `window` in service worker — use `self`.
- ❌ Top-level `await` in SW with side effects — moves logic out of message handlers, causing it to run only on cold start.
- ❌ `chrome.storage.local` for tokens — use `session` (see security.md).
- ❌ Loading content script via manifest AND `chrome.scripting.executeScript` — pick one (we use manifest).
