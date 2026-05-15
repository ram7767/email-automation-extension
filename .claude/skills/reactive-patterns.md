# Reactive patterns — EmailAutomation extension

State is fully reactive. UI components subscribe; they never poll. Cross-context sync (popup ↔ background ↔ content script) is event-driven.

## Stack
- **In-component state**: `@preact/signals-react` (tiny, fine-grained, no provider boilerplate).
- **Cross-context state**: `chrome.storage.local` + `chrome.storage.onChanged` adapter that mirrors changes into signals.
- **Async streams** (Drive watchers, send progress): RxJS 7 `Observable` / `Subject`.

## Layering
```
UI (popup/options/content) ── reads ──▶ signals (src/lib/state.ts)
                                          │
                                          ├── synced via chrome.storage.onChanged
                                          ▼
                                   chrome.storage.local
                                          ▲
                                          │
Background service worker ── writes ──────┘
        │
        └── owns long-running async (Drive sync, Gmail send queue) as RxJS streams
```

UI never calls Drive/Gmail directly. UI dispatches a typed message (`src/lib/messages.ts`) → background performs the side effect → background updates `chrome.storage.local` → signal updates → UI re-renders.

## Signal conventions
```ts
// src/lib/state.ts
export const profiles$ = signal<ProfileIndex | null>(null);
export const sendQueue$ = signal<SendJob[]>([]);
export const authStatus$ = signal<'unknown' | 'signed-out' | 'signed-in'>('unknown');
```
- Suffix all signals with `$`.
- Computed values use `computed()` — never derive in render.
- Never mutate signal `.value` from inside render. Mutations go in event handlers or message handlers.

## chrome.storage ↔ signal bridge
`src/lib/storage-bridge.ts` exports `bind(signal, key)`:
- On init: hydrate signal from storage.
- Subscribes to signal changes → writes to storage (debounced 100ms).
- Subscribes to `chrome.storage.onChanged` → updates signal (skip if change came from us).
Two-way binding handles popup-vs-background races.

## Message envelope (typed)
```ts
type Msg =
  | { type: 'SEND_EMAIL'; payload: SendRequest }
  | { type: 'REFRESH_PROFILES' }
  | { type: 'SIGN_OUT' };
type Reply<T extends Msg['type']> = ...;
```
- Define in `src/lib/messages.ts`. All `chrome.runtime.sendMessage` calls go through `send(msg)` which is type-safe.
- Background uses a single `chrome.runtime.onMessage` dispatcher mapped by `type`.

## Async work — RxJS rules
- Long-lived streams (e.g., poll Drive every N min) live in the background SW only.
- Use `shareReplay(1)` for streams the UI subscribes to.
- Cancel on `chrome.runtime.onSuspend` — flush signals to storage first.
- Backoff: `retryWhen(errors => errors.pipe(delayWhen((_,i)=>timer(Math.min(30000, 2**i*500)))))`.

## React rendering rules
- Components are function components. No class components.
- Use `useSignals()` from `@preact/signals-react/runtime` once at app root.
- Never pass signals as props — import from `src/lib/state.ts` directly. (Signals are global, not local.)
- Local UI state (e.g., a single dropdown's open/closed) can use `useState` — don't put it in a signal.

## Don'ts
- ❌ `setInterval` polling. Use RxJS `interval` + `takeUntil(suspend$)`.
- ❌ `useEffect` for data fetching in popup. Background owns fetching; popup just reads signals.
- ❌ Mutating arrays/objects in place. Always replace: `profiles$.value = { ...profiles$.value, ... }`.
- ❌ Cross-context state in React Context. Context dies when popup closes; signals + storage survive.
