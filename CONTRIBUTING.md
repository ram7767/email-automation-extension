# Contributing — EmailAutomation Browser Extension

Thanks for taking the time. Read this once; the rest is in `CLAUDE.md` and `.claude/skills/`.

## Branch model

- `main` — protected. Only release tags + hotfixes land here.
- `develop` — integration branch. All feature PRs target this.
- `feature/<short-desc>` — feature branches. PR into `develop`.
- `bugfix/<short-desc>` — bug-fix branches. PR into `develop` (or `main` for hotfixes).

## Commit message format

```
<scope>: <short, imperative summary>

<optional body>
```

Examples:
- `phase A3: linkedin/indeed content scripts + tests`
- `bugfix: ESLint flat config + manifest key`
- `docs: PRIVACY + LICENSE + CONTRIBUTING`

Don't include trailers like `Co-Authored-By` unless the user asked.

## Development setup

```bash
# 1. Install
npm install

# 2. Set up GCP OAuth (one-time)
#    - console.cloud.google.com → enable Drive API + Gmail API
#    - Create OAuth client (type: Chrome extension)
#    - Use extension id: ldbofaaihbjefjigcpaomabfhbiolbge
#    - Paste client_id into public/manifest.json oauth2.client_id

# 3. Dev with HMR
npm run dev
# Then in chrome://extensions: Developer mode → Load unpacked → select dist/

# 4. Tests
npm test            # vitest watch
npm run test:run    # single run
npm run test:coverage  # with coverage report
```

## Required gates

Every PR must pass before merging:

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 warnings (max-warnings=0)
- `npm run test:run` — all pass
- Coverage on `src/lib/**` ≥ 85%
- `npm run build` — succeeds

CI runs all these on every push.

## Conventions

- **No comments** unless the WHY is non-obvious. Names should explain WHAT.
- **Tests next to source**: `src/lib/foo.test.ts` next to `src/lib/foo.ts`.
- **All Drive/Gmail calls** go through `src/lib/drive.ts` / `src/lib/gmail.ts` — never `fetch` to googleapis directly.
- **All UI strings** via design tokens in `src/styles/tokens.css`. No hardcoded colors / sizes.
- **All cross-context state** via `chrome.storage` + signal bridge. Never in module-level vars in the SW.
- See `.claude/skills/*.md` for the full set.

## Releases

- Push to `develop` → rolling prerelease zip attached to the `develop` GitHub Release.
- Tag `vX.Y.Z` → versioned release + auto-publish to Chrome Web Store.

See `.claude/skills/release-flow.md`.

## Reporting security issues

See `SECURITY.md` — please don't file public issues for security bugs.
