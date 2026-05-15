import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const storageMap = new Map<string, unknown>();
const sessionMap = new Map<string, unknown>();

function shimArea(map: Map<string, unknown>) {
  return {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (!keys) return Object.fromEntries(map);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(list.map((k) => [k, map.get(k)]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) map.set(k, v);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => map.delete(k));
    }),
    clear: vi.fn(async () => map.clear()),
  };
}

(globalThis as unknown as { chrome: typeof chrome }).chrome = {
  storage: { local: shimArea(storageMap), session: shimArea(sessionMap) },
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
