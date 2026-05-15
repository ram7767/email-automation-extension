# EmailAutomation — Browser Extension

Chrome MV3 extension that helps users send job-application emails from LinkedIn / Indeed using resumes & templates stored in their own Google Drive. Companion to the Flutter app at `../email-automation-app`.

## Read these before any feature work

Skills (`.claude/skills/`):
- `ui-ux-design.md` — design tokens, component patterns, four-states rule
- `security.md` — OAuth scopes, token storage, CSP, MIME safety
- `reactive-patterns.md` — signals + chrome.storage bridge + RxJS streams
- `responsive-design.md` — popup / options / content-modal layouts
- `drive-client.md` — folder layout, ETag conflict handling
- `gmail-sender.md` — MIME + queue + quota + logging redaction
- `manifest-v3.md` — service worker lifetime, messaging, content scripts
- `testing.md` — Vitest unit tests, Playwright extension e2e
- `release-flow.md` — develop → prerelease, tag → CWS publish

Agents (`.claude/agents/`):
- `extension-builder` — `npm run build` + manifest validation + zip
- `drive-schema-checker` — validates schemas against code that touches them
- `linkedin-indeed-selector-auditor` — verifies content-script selectors against live DOM

## Tech stack
- **Build**: Vite 5 + `@crxjs/vite-plugin` (MV3 HMR), TypeScript 5
- **UI**: React 18 + Tailwind CSS 3 + lucide-react icons
- **State**: `@preact/signals-react` + `chrome.storage` bridge + RxJS 7
- **Auth/API**: `chrome.identity.getAuthToken` + raw `fetch` (no `googleapis` package — too heavy for an extension)
- **Tests**: Vitest + jsdom (unit) + Playwright (extension e2e on chromium)
- **Lint**: ESLint + Prettier

## Folder layout
```
src/
  popup/          popup UI
  options/        full options page
  content/        per-site content scripts (linkedin.ts, indeed.ts) + selectors.ts
  background/     service-worker.ts
  lib/            auth, drive, gmail, http, mime, storage-bridge, state, messages
  components/     shared React components (AppButton, AppCard, etc.)
  styles/         tokens.css, index.css
public/           manifest.json, icons, _locales
schemas/          *.schema.json (shared with Flutter app — keep in sync)
```

## Conventions
- No comments unless WHY is non-obvious. No JSDoc on internal functions.
- One module = one responsibility. If a file > 200 lines, split.
- All cross-context state in `chrome.storage`; never in module-level vars in the SW.
- All styles via tokens (CSS vars). No hardcoded colors/sizes.
- All Drive/Gmail calls through `lib/drive.ts` / `lib/gmail.ts` — never inline `fetch` to googleapis.
- Tests live next to source: `src/lib/auth.test.ts` next to `auth.ts`.

## Getting started
```bash
npm install
npm run dev           # Vite serves with MV3 HMR; load dist/ as unpacked extension
npm test              # vitest watch
npm run build         # production build → dist/
```

## Required setup before first run
1. Create OAuth client (type: Chrome extension) at console.cloud.google.com.
2. Paste the client_id into `public/manifest.json` `oauth2.client_id`.
3. Pin extension ID via `key` field — generate via `npm run gen-key` (script in package.json).

## CI/CD
- Push to any branch: lint + typecheck + test
- Push to `develop`: prerelease build attached to a rolling `develop` GitHub Release
- Tag `v*`: production release → GitHub Release + Chrome Web Store auto-publish

See `.claude/skills/release-flow.md` for details and `.github/workflows/` for the actual workflows.
