# Responsive design — EmailAutomation extension

Three surfaces, three responsive strategies.

## 1. Popup — fixed but content-flexible
- Width pinned at `380px`, height grows to a max of `600px` then scrolls.
- Internal layout uses CSS grid with `minmax()` so cards reflow if a user zooms.
- Test at 100%, 125%, 150% browser zoom — no horizontal scroll, no clipped buttons.

## 2. Options page — fully responsive (mobile-first even though it's desktop)
Breakpoints (Tailwind):
```
sm   ≥ 640px   single column, stacked cards
md   ≥ 768px   2-column form layouts
lg   ≥ 1024px  sidebar + content
xl   ≥ 1280px  sidebar + content + right-rail (stats)
```
- Content max-width capped at `1024px` even on `xl+` (centered) — long line-lengths hurt readability.
- Sidebar collapses to a top tab bar below `lg`.
- All tables become stacked cards below `md` (no horizontal scroll on data tables).

## 3. Content-script modal — viewport-aware
- `max-width: min(480px, 92vw)`.
- `max-height: min(680px, 85vh)`.
- Position: centered with `position: fixed; inset: 0; display: grid; place-items: center;` inside a backdrop.
- On viewport `< 600px` height: modal uses 95vh and inner sections become collapsible accordions.

## Implementation rules
- Use Tailwind responsive prefixes (`md:`, `lg:`) — never write `@media` by hand except in tokens.
- No `width: 100vw` (causes horizontal scroll with scrollbar). Use `width: 100%`.
- No fixed pixel heights on scrollable areas — use `flex-1` + `min-h-0`.
- Test resize: open popup, drag DevTools wider/narrower → no overflow.
- All images/icons use intrinsic size or `aspect-ratio` to prevent layout shift.

## Touch targets
Even on desktop, minimum tap target = `36×36px`. Spacing between adjacent interactive elements ≥ `8px`.

## Container queries (where supported)
For cards that may render in popup OR options sidebar OR right-rail, use `@container` queries instead of viewport breakpoints. Mark the wrapper with `container-type: inline-size`.

## Testing checklist (per PR)
- [ ] Popup at 100%, 125%, 150% zoom — no overflow
- [ ] Options at 360px, 768px, 1280px — no overflow, no clipped controls
- [ ] Content-script modal at 600×400 viewport — readable, dismissable
- [ ] Reduced-motion + dark mode + light mode — all surfaces inspected
