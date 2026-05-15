import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  getAccessToken: vi.fn(async () => 'tok'),
  signOut: vi.fn(async () => undefined),
}));

import { ensureRoot } from './drive';

interface FakeFile { id: string; name: string; mimeType: string; parents: string[] | undefined; body?: unknown }

describe('ensureRoot', () => {
  let store: FakeFile[];
  let nextId = 0;

  beforeEach(() => {
    void chrome.storage.local.clear();
    store = [];
    nextId = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const u = new URL(url);
      const method = init?.method ?? 'GET';

      if (u.pathname === '/drive/v3/files' && method === 'GET') {
        const q = u.searchParams.get('q') ?? '';
        const nameMatch = /name='([^']+)'/.exec(q);
        const parentMatch = /'([^']+)' in parents/.exec(q);
        const mimeMatch = /mimeType='([^']+)'/.exec(q);
        const files = store.filter((f) => {
          if (nameMatch && f.name !== nameMatch[1]) return false;
          if (parentMatch && !(f.parents ?? []).includes(parentMatch[1]!)) return false;
          if (mimeMatch && f.mimeType !== mimeMatch[1]) return false;
          return true;
        });
        return new Response(JSON.stringify({ files }), { status: 200 });
      }

      if (u.pathname === '/drive/v3/files' && method === 'POST') {
        const body = JSON.parse(init!.body as string) as Partial<FakeFile>;
        const file: FakeFile = { id: `id-${++nextId}`, name: body.name!, mimeType: body.mimeType!, parents: body.parents };
        store.push(file);
        return new Response(JSON.stringify(file), { status: 200 });
      }

      if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
        const text = init!.body as string;
        const metaMatch = /\{[^}]*\}/.exec(text);
        const meta = metaMatch ? (JSON.parse(metaMatch[0]) as Partial<FakeFile>) : {};
        const file: FakeFile = { id: `id-${++nextId}`, name: meta.name!, mimeType: 'application/json', parents: meta.parents };
        store.push(file);
        return new Response(JSON.stringify(file), { status: 200 });
      }

      if (u.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
        const id = u.pathname.split('/').pop();
        const file = store.find((f) => f.id === id);
        if (!file) return new Response('not found', { status: 404 });
        return new Response(JSON.stringify({
          schemaVersion: 1,
          rootFolderId: 'id-1',
          updatedAt: '2026-05-15T00:00:00Z',
          updatedBy: 'extension',
          profiles: [],
        }), { status: 200, headers: { ETag: 'W/"1"' } });
      }

      return new Response('unhandled', { status: 500 });
    });
  });

  it('creates root, metadata, profiles folders, and seeds profiles_index.json on first run', async () => {
    const r = await ensureRoot();
    expect(r.rootFolderId).toBeTruthy();
    expect(r.profilesIndex.schemaVersion).toBe(1);
    expect(r.profilesIndex.profiles).toEqual([]);

    const folderNames = store.filter((f) => f.mimeType === 'application/vnd.google-apps.folder').map((f) => f.name);
    expect(folderNames).toContain('EmailAutomation');
    expect(folderNames).toContain('metadata');
    expect(folderNames).toContain('profiles');
  });

  it('reuses cached rootFolderId on second run instead of re-creating', async () => {
    await ensureRoot();
    const initialFolderCount = store.filter((f) => f.mimeType === 'application/vnd.google-apps.folder').length;
    await ensureRoot();
    const after = store.filter((f) => f.mimeType === 'application/vnd.google-apps.folder').length;
    expect(after).toBe(initialFolderCount);
  });
});
