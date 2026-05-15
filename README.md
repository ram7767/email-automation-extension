# EmailAutomation — Browser Extension

Send job-application emails from LinkedIn / Indeed using resumes & templates stored in **your own** Google Drive. Companion to the [EmailAutomation Flutter app](../email-automation-app).

## Status
🚧 Phase A0 (foundations) complete. See `CLAUDE.md` for the phase plan.

## Install

### From a release zip (pre Chrome Web Store)
1. Download the latest zip from [Releases](../../releases) — `develop` for the rolling prerelease, or a `vX.Y.Z` tag.
2. Unzip.
3. Visit `chrome://extensions`, enable Developer mode, click "Load unpacked", select the unzipped folder.

### From the Chrome Web Store
Coming after first release. Link will land here.

## Permissions — what we ask for and why
| Permission | Why |
|---|---|
| `identity` | Sign in with Google via `chrome.identity` |
| `storage` | Cache UI state and access tokens (in `session` storage, cleared on browser close) |
| `alarms` | Periodic Drive sync from the background service worker |
| `scripting`, `activeTab` | Inject the "Send via EmailAutomation" button on LinkedIn / Indeed |
| `https://www.linkedin.com/*`, `https://*.indeed.com/*` | Detect emails / job context on those sites |
| `https://www.googleapis.com/*`, `https://oauth2.googleapis.com/*` | Talk to Drive and Gmail APIs |

OAuth scopes:
- `openid`, `email`, `profile` — identify you
- `drive.file` — only files this app creates (cannot see other Drive files)
- `gmail.send` — send mail (cannot read your inbox)

## Develop
```bash
npm install
npm run dev          # Vite + MV3 HMR
npm test             # vitest watch
npm run build        # production build → dist/
```
Then load `dist/` as an unpacked extension in `chrome://extensions`.

## Required setup before first run
1. Create an OAuth client (type: Chrome extension) in [Google Cloud Console](https://console.cloud.google.com).
2. Paste the client ID into `public/manifest.json` `oauth2.client_id`.
3. Pin the extension ID via the `key` field in `manifest.json`.

## Releases
- Push to `develop` → updates the rolling [develop release](../../releases/tag/develop) with the latest build zip.
- Tag `vX.Y.Z` → cuts a versioned release AND auto-publishes to the Chrome Web Store.

See `.claude/skills/release-flow.md` for the full pipeline and `.github/workflows/` for the CI.

## License
MIT (TODO: confirm with the maintainer).
