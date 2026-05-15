# Testing — EmailAutomation extension

Tests are mandatory. CI fails on any commit that:
- Drops coverage on `src/lib/**` below 85%
- Has a failing unit test
- Has a failing typecheck or lint

## Stack
- **Unit / module tests**: Vitest 1.x + jsdom
- **DOM / component tests**: Vitest + `@testing-library/react`
- **Extension e2e**: Playwright with `chromium` launched with `--load-extension=dist/` on a sample HTML page
- **Mocks**: `vi.fn()` + `msw` for `fetch` to googleapis (preferred over hand-rolling)
- **Coverage**: `@vitest/coverage-v8`

## Layout
```
src/lib/auth.ts
src/lib/auth.test.ts          ← lives next to source
src/components/AppButton.tsx
src/components/AppButton.test.tsx
test/e2e/                     ← Playwright specs
test/fixtures/                ← sample LinkedIn/Indeed HTML snapshots, mock Drive responses
test/setup.ts                 ← global jsdom + chrome.* mock setup
```

## What MUST have unit tests
| Area | Why |
|---|---|
| `lib/auth.ts` | OAuth flow, token refresh, sign-out, revoke |
| `lib/drive.ts` | ETag conflict handling, retry/backoff, path containment |
| `lib/gmail.ts` | MIME assembly with attachments, base64url encoding, quota errors |
| `lib/mime.ts` | line-wrapping at 76, CRLF safety, special chars in subjects |
| `lib/template.ts` | placeholder whitelist, no eval, unknown placeholders left visible |
| `lib/storage-bridge.ts` | signal ↔ storage round-trip, change-source dedup |
| `lib/messages.ts` | typed envelope, no implicit any |
| `content/selectors.ts` | tested against fixture HTML snapshots from LinkedIn/Indeed |
| `components/*` | render in all 4 states (loading/empty/error/data) |

## chrome.* mocks
`test/setup.ts` provides a minimal in-memory shim:
- `chrome.storage.local/session/sync` → `Map<string, any>` with `onChanged` listeners
- `chrome.identity.getAuthToken` → returns a fake token; `removeCachedAuthToken` clears it
- `chrome.runtime.sendMessage` → routed through a test dispatcher you can register handlers on
- `chrome.alarms` → fires synchronously in tests via `vi.useFakeTimers`

## msw for googleapis
Define handlers in `test/handlers/google.ts`:
- `GET /drive/v3/files` — search
- `POST /drive/v3/files` — create
- `PATCH /upload/drive/v3/files/:id` — update with ETag enforcement
- `POST /gmail/v1/users/me/messages/send` — returns mock messageId

Use `server.use(...)` to override per-test for error scenarios (412, 429, 401).

## E2E with Playwright
`test/e2e/popup.spec.ts` and `test/e2e/inject.spec.ts`:
- Boot chromium with `--disable-extensions-except=dist --load-extension=dist`
- Open `chrome-extension://<id>/popup.html` and assert UI
- For inject test: serve `test/fixtures/linkedin-profile.html` from a local Vite server, navigate, assert FAB is injected

## Conventions
- `describe('<unit>')` → one per file. `it('does X when Y')` — present tense.
- `beforeEach(() => vi.clearAllMocks())`. Reset chrome.* shims explicitly via helper.
- No real network calls — msw `onUnhandledRequest: 'error'`.
- No real Drive/Gmail credentials in fixtures.
- Snapshot tests only for stable structures (e.g., MIME output). Avoid snapshotting React tree.

## Commands
```
npm test                  # vitest watch
npm run test:run          # single run for CI
npm run test:coverage     # coverage report → coverage/
npm run test:e2e          # Playwright on built dist/
```

## Pre-commit
Husky + lint-staged runs:
- `eslint --fix` on staged `.ts/.tsx`
- `prettier --write`
- `vitest related --run` on staged files (only tests touching changed code)

## CI gate (referenced by release-flow.md)
GitHub Action fails if:
- Any of the above fails
- Coverage threshold not met
- New file in `src/lib/` lacks a sibling `.test.ts`
