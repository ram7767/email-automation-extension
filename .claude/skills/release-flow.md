# Release flow — EmailAutomation extension

## Branch model
- `main` — only release tags + hotfixes; protected
- `develop` — integration branch; every push triggers a rolling prerelease build
- `feat/*` — feature branches → PR into `develop`

## Versioning
SemVer in BOTH `package.json` and `public/manifest.json`. Synced by `scripts/sync-version.mjs`. CI fails the build if they diverge.

## Continuous flows

### On any push or PR (`.github/workflows/ci.yml`)
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run test:run` (with coverage gate ≥ 85% on `src/lib/**`)
- `npm run build` (smoke check; artifact discarded)
Required to pass before merge.

### On push to `develop` (`.github/workflows/develop.yml`)
1. Run all CI steps above.
2. `npm run build`.
3. Compute `DEV_VERSION = $(cat package.json | jq -r .version)-dev.$(git rev-parse --short HEAD)`.
4. Patch `manifest.json` version field with `DEV_VERSION`.
5. `cd dist && zip -r ../email-automation-extension-$DEV_VERSION.zip .`
6. Update (or create) GitHub Release tagged `develop` (rolling, prerelease=true) by deleting old asset and re-uploading the new zip. Title: `Latest develop build (HEAD: <sha>)`.
7. Auto-generated release notes from commits since previous develop release.

This means: **the latest `develop` zip is always at `https://github.com/<org>/email-automation-extension/releases/tag/develop`** — testers download and reload.

### On tag `v*` (`.github/workflows/release.yml`)
1. Run all CI steps.
2. `npm run build` → `dist/`.
3. `cd dist && zip -r ../email-automation-extension-v$VERSION.zip .`
4. Cosign sign the zip.
5. `gh release create v$VERSION` with zip + signature + auto-generated notes (latest=true, prerelease=false).
6. **Chrome Web Store upload + publish** via `mnao305/chrome-extension-upload@v5`:
   ```yaml
   - uses: mnao305/chrome-extension-upload@v5
     with:
       file-path: email-automation-extension-v${{ steps.ver.outputs.value }}.zip
       extension-id: ${{ secrets.CWS_EXTENSION_ID }}
       client-id: ${{ secrets.CWS_CLIENT_ID }}
       client-secret: ${{ secrets.CWS_CLIENT_SECRET }}
       refresh-token: ${{ secrets.CWS_REFRESH_TOKEN }}
       publish: true
   ```
7. Post a sticky comment to the release with the CWS URL.

## Required CI secrets
| Secret | Purpose | How to get |
|---|---|---|
| `CWS_EXTENSION_ID` | extension id in CWS | After first manual CWS upload |
| `CWS_CLIENT_ID` | OAuth client (type: Web app) for CWS API | console.cloud.google.com → enable Chrome Web Store API |
| `CWS_CLIENT_SECRET` | same client | same |
| `CWS_REFRESH_TOKEN` | refresh token granting `https://www.googleapis.com/auth/chromewebstore` scope | `npx chrome-webstore-upload-cli get-refresh-token` |
| `COSIGN_PRIVATE_KEY` | release zip signing | `cosign generate-key-pair` |
| `COSIGN_PASSWORD` | password for above | choose strong, store in 1Password |

## First-time CWS setup (manual, do once)
1. Pay $5 developer fee at chrome.google.com/webstore/devconsole.
2. Manually upload the first zip to claim the extension ID.
3. Fill out store listing (title, description, screenshots, privacy policy link, justifications per permission).
4. Submit for first review (~1–3 business days).
5. After approval, copy `extension-id` from the dashboard → set as `CWS_EXTENSION_ID` secret.
6. Subsequent releases auto-publish — no further manual steps.

## Tag → publish runbook
```bash
# from develop, after merging the release PR into main
git checkout main && git pull
npm version <patch|minor|major>      # bumps package.json
npm run sync-version                  # writes manifest.json + commits both
git push --follow-tags                # triggers release.yml
```
Watch the action; if CWS publish fails (review queue, bad zip, etc.), fix and re-tag.

## Hotfix
1. Branch `hotfix/<desc>` from latest `v*` tag.
2. Patch + tests.
3. PR → review → merge to `main`.
4. Tag `v<patch+1>` → release.yml fires.
5. Cherry-pick onto `develop`.

## Pre-flight (Action enforces all)
- `npm audit --omit=dev` → 0 high/critical
- Coverage ≥ 85% on `src/lib/**`
- All required icons present (16, 32, 48, 128)
- `oauth2.client_id` not the placeholder
- `key` field present in manifest
- No `console.log` in `dist/` (terser drop_console)
