# Security conventions — EmailAutomation extension

Threat model: malicious web pages (LinkedIn/Indeed are not adversarial but can be compromised), token theft, scope creep, supply-chain.

## OAuth scopes — minimum viable
Allowed: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/gmail.send`.

Forbidden (do not request, ever): `drive` (full Drive), `drive.readonly`, `gmail.readonly`, `gmail.modify`, `gmail.metadata`. If a feature seems to need these, the design is wrong — fix the design.

## Token storage
- **Access token** → `chrome.storage.session` (cleared on browser close, never written to disk).
- **Refresh token** → `chrome.storage.local` ONLY if encrypted with a key derived from `chrome.identity.getProfileUserInfo` + a per-install random salt stored in `chrome.storage.session`. Prefer NOT storing refresh tokens at all and re-prompting via `chrome.identity.getAuthToken({interactive:true})` when expired.
- Never `localStorage`. Never `IndexedDB`. Never sent to any non-Google origin.
- All token reads go through `src/lib/auth.ts → getAccessToken()`. No other module touches storage for tokens.

## Network
- Only these origins are reachable from the extension: `https://www.googleapis.com`, `https://oauth2.googleapis.com`, `https://accounts.google.com`. Enforced via `host_permissions` in manifest + a `fetch` wrapper (`src/lib/http.ts`) that rejects other URLs.
- All requests use HTTPS. No mixed content.
- `Authorization: Bearer <token>` header only — never as query string.

## Content Security Policy (manifest.json)
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'"
}
```
- `'unsafe-inline'` for styles only because Tailwind injects runtime styles. No `'unsafe-eval'`. No remote scripts.

## Injection / XSS
- Email templates support `{{name}}` style placeholders. Render via a tiny safe interpolator that ONLY substitutes known keys; never `eval`, never `innerHTML` of user content. Body is sent as `text/plain` MIME unless user explicitly opts into HTML, and HTML is sanitized via `DOMPurify`.
- Data scraped from LinkedIn/Indeed (names, emails, job titles) is ALWAYS treated as untrusted: validate with strict regex, length-cap, and never insert into HTML without sanitization.

## DOM isolation (content script)
- All injected UI lives inside a Shadow DOM root. No global CSS. No global event listeners outside the shadow root.
- Never read sensitive page state (cookies, sessionStorage of host page). Only the visible DOM nodes we need.

## Logging & telemetry
- Default: zero telemetry. If added later, opt-in only, anonymous, no PII, no email content.
- Console logs in production builds: stripped via Vite `define`/`drop_console`. Dev logs never include tokens, emails, or message bodies.

## Drive write safety
- Use ETag (`If-Match`) for `metadata/sent_emails.json` and `profiles_index.json` updates to detect concurrent writes from the Flutter app. On 412, re-read, merge, retry (max 3).
- Never delete user files outside `EmailAutomation/`. The drive client refuses paths that don't start with the configured root folder ID.

## Supply chain
- Lock dependencies (`package-lock.json` committed). Renovate/Dependabot enabled.
- No `postinstall` scripts allowed in dependencies — enforce with `npm config set ignore-scripts true` in CI.
- Audit before each release: `npm audit --omit=dev` must show 0 high/critical.

## Release integrity
- GitHub Action signs the release zip with sigstore/cosign and publishes the signature alongside.
- Manifest `key` field pinned so the extension ID stays stable across self-hosted installs.

## Incident response
- Token revocation flow: `Settings → Sign out` calls `chrome.identity.removeCachedAuthToken` AND `https://oauth2.googleapis.com/revoke?token=...`. Confirm with toast.
- Compromise switch: a remotely-loaded killswitch is a CSP violation; instead, document a manual "uninstall + revoke at myaccount.google.com" path in README.
