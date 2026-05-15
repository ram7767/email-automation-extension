# Drive client conventions — extension

All Drive API calls go through `src/lib/drive.ts`. No other module imports `googleapis` URLs directly.

## Scope
`https://www.googleapis.com/auth/drive.file` ONLY. This restricts the extension to files it created. Never request `drive` or `drive.readonly`.

## Folder layout (must match Flutter app byte-for-byte)
```
EmailAutomation/                         (root)
  profiles/
    <ProfileName>/                       e.g. Flutter, Swift
      <CategoryName>/                    e.g. Senior_Developer, Junior_Developer
        resumes/
          <fileName>.pdf
        description.md
        email_template.md
  metadata/
    profiles_index.json
    sent_emails.json
    stats.json
```

## Bootstrap (first login)
1. Search for `name='EmailAutomation' and mimeType='application/vnd.google-apps.folder' and trashed=false`.
2. If absent, create it; store its `fileId` in `chrome.storage.local` as `rootFolderId`.
3. Ensure `metadata/` subfolder exists; create `profiles_index.json` with `{schemaVersion: 1, profiles: []}` if missing.

## API surface (`drive.ts` exports)
```ts
ensureRoot(): Promise<string>                          // returns rootFolderId
listProfiles(): Promise<ProfileIndex>
createProfile(name: string): Promise<Profile>
createCategory(profileId: string, name: string): Promise<Category>
uploadResume(categoryId: string, file: File): Promise<DriveFile>
readJson<T>(fileId: string): Promise<{value: T; etag: string}>
writeJson<T>(fileId: string, value: T, opts: {ifMatch?: string}): Promise<{etag: string}>
downloadBytes(fileId: string): Promise<Uint8Array>
```

## Invariants
- Never expose `fileId` to UI components. UI works with `Profile`/`Category` domain objects keyed by name; the repository layer maps to fileId.
- All writes to `profiles_index.json` and `sent_emails.json` use `If-Match` header (ETag from previous read). On 412, re-read, merge, retry up to 3 times. Surface a toast if it still fails.
- All requests go through a single `httpJson` wrapper that:
  - Adds `Authorization: Bearer ...`
  - Retries on 5xx with exponential backoff (500/1000/2000/4000ms, max 4 tries)
  - On 401, refreshes token via `getAuthToken({interactive:false})` and retries once
  - On 403 quota, surfaces a typed `QuotaError` to the UI

## Conflict strategy for sent_emails.json
Append-heavy. On every write:
1. Read with ETag.
2. Append new entry to local copy.
3. Write with `If-Match`.
4. On 412 → re-read, append to fresh copy, write again.

If the file grows past 500 entries, roll into `sent_emails_<YYYY-MM>.json` and update `sent_emails.json` to point at the current shard via `currentShard` field.

## Caching
- In-memory LRU (size 100) of `fileId → metadata` for the popup session.
- Cleared on `chrome.runtime.onSuspend`.
- Never cache file contents to disk — privacy + staleness risk.

## Errors to surface vs swallow
| Code | Action |
|---|---|
| 401 | refresh once, then prompt re-auth |
| 403 (quota) | toast + back off 60s |
| 403 (insufficient permission) | re-prompt for scope grant |
| 404 | invalidate cached fileId, re-resolve from index |
| 412 | retry with merge (see above) |
| 5xx | retry per backoff, then toast |
