import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const storageMap = new Map<string, unknown>();
const sessionMap = new Map<string, unknown>();
const changeListeners: Array<
  (changes: Record<string, chrome.storage.StorageChange>, area: chrome.storage.AreaName) => void
> = [];

function shimArea(map: Map<string, unknown>, area: chrome.storage.AreaName) {
  return {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (!keys) return Object.fromEntries(map);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(list.map((k) => [k, map.get(k)]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: map.get(k), newValue: v };
        map.set(k, v);
      }
      changeListeners.forEach((cb) => cb(changes, area));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => map.delete(k));
    }),
    clear: vi.fn(async () => map.clear()),
  };
}

(globalThis as unknown as { chrome: typeof chrome }).chrome = {
  storage: {
    local: shimArea(storageMap, 'local'),
    session: shimArea(sessionMap, 'session'),
    onChanged: {
      addListener: vi.fn((cb: (typeof changeListeners)[number]) => changeListeners.push(cb)),
      removeListener: vi.fn((cb: (typeof changeListeners)[number]) => {
        const i = changeListeners.indexOf(cb);
        if (i >= 0) changeListeners.splice(i, 1);
      }),
    },
  },
  identity: {
    getAuthToken: vi.fn((_opts, cb: (t: string) => void) => cb('test-token')),
    removeCachedAuthToken: vi.fn((_o, cb?: () => void) => cb?.()),
  },
  runtime: {
    lastError: undefined,
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(async () => ({ ok: true })),
  },
} as unknown as typeof chrome;
