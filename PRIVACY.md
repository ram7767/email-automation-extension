# Privacy Policy — EmailAutomation Browser Extension

_Last updated: 2026-05-16. Repo: https://github.com/ram7767/email-automation-extension_

EmailAutomation is built so your data stays in **your** Google account. We never run a server. We never see your data.

## What we read

- **Pages on LinkedIn and Indeed** — only when you click the floating "Send via EmailAutomation" button on a page. We extract: the visible email address, recruiter / contact name, job title, and company name. The page DOM is never sent to any third party.
- **Your Google profile** — name, email, profile picture (via the `openid email profile` OAuth scopes) so the extension knows who you're signed in as.

## What we send

- **Emails** to recipients you select, via the Gmail API (`gmail.send` scope) — sent through your own Gmail account, with your chosen resume attached.
- **Drive operations** to read / write files this extension created (`drive.file` scope) — your `EmailAutomation/` folder. We cannot see other Drive files.

## What we store

- **Your Google access token** in `chrome.storage.session` (cleared when you close the browser).
- **Cached UI state** (selected profile, last-opened category) in `chrome.storage.local` on your machine.
- **All other data** — profiles, categories, resumes, send history (`sent_emails.json`) — lives in **your own Google Drive**. We never copy it anywhere.

## What we never do

- ❌ Send anything to a server we operate.
- ❌ Read your Gmail inbox.
- ❌ Read other Drive files (only files this extension created).
- ❌ Track you, profile you, or sell your data.
- ❌ Use third-party analytics or telemetry.

## OAuth scopes — minimum we ask

| Scope | Why |
|---|---|
| `openid`, `email`, `profile` | Identify you |
| `https://www.googleapis.com/auth/drive.file` | Manage only files this extension creates (your `EmailAutomation/` folder) |
| `https://www.googleapis.com/auth/gmail.send` | Send emails on your behalf (no inbox read) |

## Data deletion

To remove all data this extension uses:

1. **Revoke our access** at https://myaccount.google.com/permissions → find "EmailAutomation" → Remove access.
2. **Delete the Drive folder** at https://drive.google.com → find `EmailAutomation/` → Delete.
3. **Uninstall the extension** at `chrome://extensions`.

## Children

This extension is not directed at children under 13.

## Changes to this policy

Material changes are recorded in `CHANGELOG.md` and announced on the GitHub release notes.

## Contact

Questions: open a GitHub issue at https://github.com/ram7767/email-automation-extension/issues, or email monika@softsuave.com.
