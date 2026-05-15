# Gmail sender conventions — extension

All Gmail API calls go through `src/lib/gmail.ts`. Single function exposed:

```ts
sendApplicationEmail(req: {
  to: string;
  subject: string;
  bodyText: string;        // plaintext only by default
  bodyHtml?: string;       // optional, sanitized by caller
  attachments: Array<{ name: string; mimeType: string; bytes: Uint8Array }>;
  profileName: string;
  categoryName: string;
}): Promise<{ messageId: string; threadId: string }>
```

## Scope
`https://www.googleapis.com/auth/gmail.send` only. Never `gmail.modify`, never `gmail.readonly`.

## MIME construction
- Build `multipart/mixed` with two parts: a `multipart/alternative` (text + optional html) and one part per attachment.
- Each attachment uses `Content-Transfer-Encoding: base64` with line wrapping at 76 chars.
- Use a CRLF-safe builder (`src/lib/mime.ts`). Do not concatenate strings ad-hoc — easy to break with attachments > 1MB.
- Encode the entire message with base64url (`+ → -`, `/ → _`, no padding) before posting to `users.messages.send`.

## Quota & rate limits
- Gmail send quota: 250 quota units per user per second; `messages.send` = 100 units. Effective limit ≈ 2 sends/sec sustained.
- Daily send cap (free Gmail): 500 emails / day. Workspace: 2000 / day. Surface a counter in popup; warn at 80%.
- On 429 / 403 `rateLimitExceeded`: exponential backoff (1s, 2s, 4s, 8s, 16s, max 5 retries), then surface to user as a queued send.

## Send queue (in background SW)
- Sends go through an RxJS `Subject<SendJob>` in the background service worker.
- `concatMap` enforces serial sends with built-in throttle (`delay(600)` between sends).
- Job state (`queued | sending | sent | failed`) is persisted in `chrome.storage.local` so UI can show progress across popup re-opens.

## After success
1. Append to `sent_emails.json` (via `drive.ts` with ETag merge).
2. Update `stats.json` counters (denormalized for cheap reads).
3. Emit `EMAIL_SENT` message → UI toasts + history list updates.

## After failure
1. Increment retry count on the job, keep status `queued` if retryable.
2. After max retries: status `failed`, error message stored on job, toast shown.
3. Failed jobs are NOT written to `sent_emails.json`.

## Templates
- `email_template.md` format:
  ```
  ---
  subject: Application for {{role}} at {{company}}
  ---
  Hi {{recipientName}},

  …body…
  ```
- Frontmatter parsed by `gray-matter`. Body and subject pass through `interpolate(text, vars)` which:
  - Substitutes ONLY known keys (whitelist enforced)
  - Never evaluates code
  - Leaves unknown placeholders untouched (visible to user as a hint to fill them)

## Logging
- Successful sends log only: `messageId`, `threadId`, `to` (hashed sha256 first 8 chars), `profileName`, `categoryName`, `timestamp`.
- Never log: token, full email body, attachment bytes, full recipient address (only the hash).
