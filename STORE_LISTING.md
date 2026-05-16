# Chrome Web Store listing — EmailAutomation

This file is the canonical source for the CWS submission form. Copy fields into the Chrome Web Store Developer Dashboard during upload.

## Single-purpose statement

> Send job-application emails directly from LinkedIn or Indeed using resumes and templates you store in your own Google Drive — with no third-party server.

## Short description (≤132 chars)

> Send job-application emails from LinkedIn / Indeed using resumes in your own Google Drive. No server. No tracking.

## Detailed description

EmailAutomation turns "found a great role on LinkedIn" into "email sent" in three clicks — without copy-pasting templates or attaching the wrong resume.

**How it works:**
- Browse LinkedIn or Indeed as you normally would.
- When you find a role / recruiter, click the floating "Send via EmailAutomation" button.
- Pick a profile (Flutter, Swift, Backend — whatever you organize by) → category (Senior, Junior) → resume.
- Preview the auto-filled email (subject + body interpolated from the page), edit if you want, hit Send.

**Where your data lives:**
- All resumes, templates, descriptions, and send-history are stored in **your own Google Drive** under an `EmailAutomation/` folder. We don't run a server. We can't see your data.
- The mobile companion app reads the same Drive folder, so your dashboard and history are available on your phone.

**Privacy guarantees:**
- We request only `drive.file` (only files this app creates) and `gmail.send` (cannot read your inbox).
- No third-party telemetry. No tracking pixels. No selling data. No data ever touches a server we operate.
- See PRIVACY.md in the GitHub repo for full details.

**Open source:** https://github.com/ram7767/email-automation-extension (MIT). Mobile app: https://github.com/ram7767/email-automation-app.

## Per-permission justification

| Permission | Why we need it |
|---|---|
| `identity` | Sign in with Google to obtain Drive + Gmail access. Uses `chrome.identity.getAuthToken` — Google handles all credential UI. |
| `storage` | Cache UI state and the access token (in `session` storage, cleared on browser close). |
| `alarms` | Periodic Drive sync from the background service worker (refreshes profile cache ~every 15 minutes). |
| `scripting`, `activeTab` | Inject the floating "Send via EmailAutomation" button on LinkedIn / Indeed pages. |
| `https://www.linkedin.com/*` | Detect emails / job context on LinkedIn pages so the user can send applications without leaving the page. |
| `https://*.indeed.com/*` | Same as above, for Indeed. |
| `https://www.googleapis.com/*` | Talk to Drive (read/write the user's `EmailAutomation/` folder) and Gmail (send mail). |
| `https://oauth2.googleapis.com/*` | OAuth token revocation on sign-out. |

## OAuth scope justification (for the consent screen)

| Scope | Justification |
|---|---|
| `openid email profile` | Identify the signed-in user (display name, email, photo in the popup). |
| `drive.file` | Create and manage only the files this extension creates (your `EmailAutomation/` folder). Cannot see other Drive files. |
| `gmail.send` | Send job-application emails on your behalf. Cannot read your inbox. |

## Privacy policy

URL: https://github.com/ram7767/email-automation-extension/blob/main/PRIVACY.md

## Category & languages

- Primary category: **Productivity**
- Languages: English (more via `_locales/` planned in a future release)

## Screenshots (1280 × 800 each — 4 required)

Placeholders in `screenshots/`. Replace with real screenshots before public submission:
1. `screenshots/01-popup.png` — Popup showing signed-in state + summary
2. `screenshots/02-options.png` — Options page with profile/category management
3. `screenshots/03-modal.png` — Floating "Send" modal injected on a LinkedIn page
4. `screenshots/04-history.png` — Companion mobile app dashboard (shown for context)

## Promo tile (440 × 280)

Placeholder at `screenshots/promo-440x280.png`. Replace with real artwork.

## Release notes (per upload)

See `CHANGELOG.md`.

## Submission checklist

Before uploading:
- [ ] Bumped version in `package.json` AND `manifest.json` (sync via `npm run sync-version`)
- [ ] Real screenshots in `screenshots/`
- [ ] Real promo tile in `screenshots/promo-440x280.png`
- [ ] Privacy policy URL is reachable (PRIVACY.md merged to main)
- [ ] OAuth consent screen verified in Google Cloud Console
- [ ] CWS Developer Dashboard fee paid ($5 one-time)
- [ ] First-time only: extension ID claimed by manual upload
