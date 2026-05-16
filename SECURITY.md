# Security Policy

## Reporting a vulnerability

Found a security issue? **Please don't open a public GitHub issue.** Instead, email **monika@softsuave.com** with:
- A clear description of the issue
- Steps to reproduce
- Affected version (or commit SHA)
- Your name / handle (for credit, optional)

We'll acknowledge within **7 days** (best-effort) and target a fix in the next release.

## Supported versions

We patch the **latest minor release** on a best-effort basis. Earlier minor releases are not actively maintained.

| Version | Supported |
|---|---|
| 0.x | Yes (current pre-release) |
| < 0.1 | No |

## Hardening summary

- **OAuth scopes**: only `openid email profile`, `drive.file`, `gmail.send`. No broader scopes are requested.
- **Token storage**: access tokens in `chrome.storage.session` (cleared on browser close). Never in `localStorage`. Never in `IndexedDB`.
- **Network**: all outbound requests are restricted to `googleapis.com`, `oauth2.googleapis.com`, `accounts.google.com` via host-whitelisting in `src/lib/http.ts`.
- **CSP**: no `'unsafe-eval'`, no `'unsafe-inline'` for scripts. Inline styles permitted only for Tailwind runtime injection. Connect sources restricted via CSP.
- **Recipient PII**: never logged in full — only sha256 hash (first 8 hex chars) per `.claude/skills/security.md`.
- **DOM isolation**: content-script UI runs inside a Shadow DOM root; styles never leak into LinkedIn/Indeed pages.
- **Page data**: anything scraped from LinkedIn/Indeed is treated as untrusted (validated, length-capped, sanitized).
- **CI**: `npm audit --omit=dev --audit-level=high` is gated in CI (must report 0 high/critical).

## What you should also do

- **Revoke our access** at https://myaccount.google.com/permissions if you uninstall.
- **Use a strong Google account password + 2FA** — sign-in security is on Google's side, but a compromised Google account compromises this app too.
