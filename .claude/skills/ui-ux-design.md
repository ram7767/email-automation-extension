# UI/UX design system — EmailAutomation extension

Source of truth for visual design across popup, options page, and injected content-script UI.

## Surface sizes
- **Popup**: fixed `380px × 600px` max. Vertical scroll allowed inside content area; header/footer sticky.
- **Options page**: full window, 12-col grid, content max-width `1024px` centered.
- **Injected modal (content script)**: max `480px × 80vh`, centered, with backdrop blur. Always Shadow DOM — never bleed our styles into LinkedIn/Indeed.

## Design tokens
Defined once in `src/styles/tokens.css` as CSS variables; all Tailwind classes read from them via `tailwind.config.js`.

```
--color-bg            #0B0F19   (dark default)
--color-surface       #131825
--color-surface-2     #1B2030
--color-border        #262C3D
--color-text          #E6E9F0
--color-text-muted    #9AA3B2
--color-primary       #6366F1   (indigo)
--color-primary-hover #4F46E5
--color-success       #10B981
--color-warning       #F59E0B
--color-danger        #EF4444
--color-focus-ring    #818CF8

--radius-sm  6px
--radius-md  10px
--radius-lg  14px

--space-1  4px
--space-2  8px
--space-3  12px
--space-4  16px
--space-6  24px
--space-8  32px

--font-sans   "Inter", system-ui, sans-serif
--text-xs     12px / 16px
--text-sm     13px / 18px   ← popup body default
--text-base   14px / 20px
--text-lg     16px / 24px
--text-xl     20px / 28px

--shadow-1   0 1px 2px rgba(0,0,0,.3)
--shadow-2   0 8px 24px rgba(0,0,0,.45)

--motion-fast  120ms cubic-bezier(.2,.8,.2,1)
--motion-mid   220ms cubic-bezier(.2,.8,.2,1)
```

Light theme: mirror with inverted bg/surface/text. Use `prefers-color-scheme` and an in-app override stored in `chrome.storage.local`.

## Component patterns

| Component | Rule |
|---|---|
| Button (primary) | filled `--color-primary`, 36px height, `--radius-md`, focus-visible ring `--color-focus-ring`, disabled: 50% opacity + `cursor-not-allowed` |
| Button (ghost) | text `--color-text`, hover bg `--color-surface-2` |
| Input | bg `--color-surface-2`, border `--color-border`, focus border `--color-primary` + 2px ring |
| Card | bg `--color-surface`, `--radius-lg`, padding `--space-4` |
| Badge | uppercase, `--text-xs`, padding `2px 8px`, role-colored |
| Toast | top-right of popup, auto-dismiss 4s, swipe to dismiss |

## States — every list/data view MUST have all four
1. **Loading** — skeleton, never spinner-only
2. **Empty** — illustration + 1-line copy + primary action
3. **Error** — icon + message + retry button + "report" link to GitHub issue
4. **Loaded** — the actual data

## Accessibility (WCAG 2.2 AA)
- Contrast ≥ 4.5:1 body, ≥ 3:1 UI. Tokens above are pre-verified.
- Every interactive element has `:focus-visible` ring (2px `--color-focus-ring`, 2px offset).
- Keyboard: Tab order matches reading order; Esc closes modals; Enter submits primary action.
- All icons paired with `aria-label`. Buttons that are icon-only must have `aria-label`.
- Reduced motion: respect `prefers-reduced-motion` — drop transforms, keep opacity changes.

## Motion
- Page/route transitions: 220ms fade + 4px slide.
- Toast in: 220ms slide from right; out: 120ms fade.
- Modal: backdrop fade 120ms, content scale 0.96→1 + fade in 220ms.
- Never animate layout-shifting properties (width/height) — animate transform/opacity.

## Copy guidelines
- Sentence case. No "!". No "please".
- Empty states: short, action-oriented. ✓ "Add your first profile" / ✗ "There are no profiles yet."
- Errors: name what failed + what user can do. ✓ "Couldn't load resumes. Check your connection and retry." / ✗ "An error occurred."
- Never say "loading…" — use skeletons.

## Don'ts
- No raw `alert()`/`confirm()`. Use the in-app modal/toast.
- No third-party icon fonts. Use `lucide-react` (tree-shaken).
- No fixed pixel sizes outside tokens. Always reference `--space-*` etc.
- No styles leaking to host pages. Content-script UI is always inside Shadow DOM.
