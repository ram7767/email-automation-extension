# Changelog

All notable changes to the EmailAutomation Chrome extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to SemVer.

## [v0.3.0-beta.1] — 2026-05-16
### Added
- Phase A3: LinkedIn / Indeed content scripts with Shadow-DOM modal, hardened multi-selector fallbacks, and a 3-step send flow (profile → category+resume → preview/send).
- Phase A4: Gmail send pipeline — RFC 5322 / 2045 MIME builder, Gmail API client with 429 retry/backoff, ETag-merging append to `metadata/sent_emails.json` with monthly shard rollover at 500 entries.
- Phase A4: RxJS-based send queue running in the service worker, persisted across SW wake, with retry / backoff / EMAIL_SENT events.
- Popup: "Last sent: <subject> · <relative time>" line (no list, no stats — history lives in the mobile app).
- Docs: PRIVACY, LICENSE, CONTRIBUTING, SECURITY, STORE_LISTING.

### Changed
- Service worker dispatcher extended with `QUEUE_SEND`, `LIST_PROFILES_FOR_SEND`, `GET_QUEUE_STATUS`, `GET_LAST_SENT`.
- Test setup gained a `chrome.alarms` shim.
- Tests: 130 pass + 1 skipped (userEvent-timing edge case).

### Security
- All Gmail/Drive calls go through the existing `http()` wrapper with host whitelist.
- Recipient addresses sha256-hashed (first 8 hex) before any logging — no full email in logs.

## [v0.2.1-beta.1] — 2026-05-16
### Added
- Real 2048-bit RSA public key in `manifest.json` `key` field. Stable extension ID: `ldbofaaihbjefjigcpaomabfhbiolbge`.
- Fix for "Failed to load extension — Value 'key' is missing or invalid."

### Changed
- Org references renamed `softsuave` → `ratnakar` in schemas, README, schema URLs.
- Schema URLs now use `https://emailautomation.ratnakar.com/schemas/...`.

## [v0.2.0-beta.1] — 2026-05-15
### Added
- Phase A2: profile + category + resume management UI (popup summary card + full options page CRUD).
- Drive client extended with `createProfile`, `createCategory`, `uploadResume`, `deleteResume`, `setDefaultResume`, `updateDescription`, `updateTemplate` — all with ETag-merge conflict handling.
- Profiles repository wraps Drive operations with a write queue.
- 62 tests, 96.47% coverage on `src/lib/**`.

## [v0.1.0-beta.1] — 2026-05-15
### Added
- Phase A0: Vite + MV3 + TypeScript + Tailwind scaffold; CLAUDE.md, skills, agents, schemas, GitHub Actions workflows.
- Phase A1: chrome.identity sign-in flow, `ensureRoot()` Drive bootstrap, profiles_index.json seeding, host-whitelisted `http()` wrapper with retry/backoff and ETag conflict handling.
- 17 unit tests, 100% coverage on the auth + http + drive modules.

[v0.3.0-beta.1]: https://github.com/ram7767/email-automation-extension/releases/tag/v0.3.0-beta.1
[v0.2.1-beta.1]: https://github.com/ram7767/email-automation-extension/releases/tag/v0.2.1-beta.1
[v0.2.0-beta.1]: https://github.com/ram7767/email-automation-extension/releases/tag/v0.2.0-beta.1
[v0.1.0-beta.1]: https://github.com/ram7767/email-automation-extension/releases/tag/v0.1.0-beta.1
