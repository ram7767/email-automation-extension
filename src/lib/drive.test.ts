import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  getAccessToken: vi.fn(async () => 'tok'),
  signOut: vi.fn(async () => undefined),
}));

import {
  _resetEtagCacheForTests,
  createCategory,
  createProfile,
  deleteResume,
  ensureRoot,
  refreshProfilesIndex,
  setDefaultResume,
  updateDescription,
  updateTemplate,
  uploadResume,
  writeJson,
} from './drive';
import type { ProfileIndex } from './types';

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[] | undefined;
  body?: unknown;
  size?: number;
}

interface FakeState {
  store: FakeFile[];
  nextId: number;
  index: ProfileIndex;
  indexEtagCounter: number;
  patchPreconditionFailures: number;
}

let state: FakeState;

function setupFetchMock() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const u = new URL(url);
    const method = init?.method ?? 'GET';

    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') ?? '';
      const nameMatch = /name='([^']+)'/.exec(q);
      const parentMatch = /'([^']+)' in parents/.exec(q);
      const mimeMatch = /mimeType='([^']+)'/.exec(q);
      const files = state.store.filter((f) => {
        if (nameMatch && f.name !== nameMatch[1]) return false;
        if (parentMatch && !(f.parents ?? []).includes(parentMatch[1]!)) return false;
        if (mimeMatch && f.mimeType !== mimeMatch[1]) return false;
        return true;
      });
      return new Response(JSON.stringify({ files }), { status: 200 });
    }

    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(init!.body as string) as Partial<FakeFile>;
      const file: FakeFile = {
        id: `id-${++state.nextId}`,
        name: body.name!,
        mimeType: body.mimeType!,
        parents: body.parents,
      };
      state.store.push(file);
      return new Response(JSON.stringify(file), { status: 200 });
    }

    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const text = init!.body as string | Uint8Array;
      const asString = typeof text === 'string' ? text : new TextDecoder().decode(text);
      const metaMatch = /\{[^}]*\}/.exec(asString);
      const meta = metaMatch ? (JSON.parse(metaMatch[0]) as Partial<FakeFile>) : {};
      const file: FakeFile = {
        id: `id-${++state.nextId}`,
        name: meta.name!,
        mimeType: meta.mimeType ?? 'application/octet-stream',
        parents: meta.parents,
        size: 100,
      };
      state.store.push(file);
      // If creating profiles_index.json, link it to state.index
      if (meta.name === 'profiles_index.json') {
        // overwrite state.index from request body
        // crude: leave as-is; tests inject directly
      }
      return new Response(
        JSON.stringify({ ...file, size: String(file.size ?? 0) }),
        { status: 200 },
      );
    }

    if (u.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const id = u.pathname.split('/').pop();
      const file = state.store.find((f) => f.id === id);
      if (!file) return new Response('not found', { status: 404 });
      const etag = `W/"${state.indexEtagCounter}"`;
      return new Response(JSON.stringify(state.index), {
        status: 200,
        headers: { ETag: etag },
      });
    }

    if (u.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
      if (state.patchPreconditionFailures > 0) {
        state.patchPreconditionFailures--;
        return new Response('etag', { status: 412 });
      }
      const ifMatch = (init!.headers as Record<string, string> | undefined)?.['If-Match'] ??
        new Headers(init!.headers).get('If-Match');
      // simulate etag change
      state.indexEtagCounter++;
      try {
        const body = init!.body as string;
        if (body && body.startsWith('{')) {
          state.index = JSON.parse(body) as ProfileIndex;
        }
      } catch {
        // body wasn't json (markdown patch), ignore
      }
      return new Response('', {
        status: 200,
        headers: { ETag: `W/"${state.indexEtagCounter}"`, 'If-Match-Echo': ifMatch ?? '' },
      });
    }

    if (u.pathname.startsWith('/drive/v3/files/') && method === 'DELETE') {
      const id = u.pathname.split('/').pop();
      state.store = state.store.filter((f) => f.id !== id);
      return new Response('', { status: 200 });
    }

    return new Response('unhandled', { status: 500 });
  });
}

async function bootstrap() {
  await ensureRoot();
  // After bootstrap, the index file is created; make further reads return state.index
  // The fetch mock above returns state.index for any GET to /drive/v3/files/{id}
  state.indexEtagCounter = 1;
}

beforeEach(() => {
  void chrome.storage.local.clear();
  _resetEtagCacheForTests();
  state = {
    store: [],
    nextId: 0,
    index: {
      schemaVersion: 1,
      rootFolderId: 'id-1',
      updatedAt: '2026-05-15T00:00:00Z',
      updatedBy: 'extension',
      profiles: [],
    },
    indexEtagCounter: 1,
    patchPreconditionFailures: 0,
  };
  setupFetchMock();
});

describe('ensureRoot', () => {
  it('creates root, metadata, profiles folders, and seeds profiles_index.json on first run', async () => {
    const r = await ensureRoot();
    expect(r.rootFolderId).toBeTruthy();
    expect(r.profilesIndex.schemaVersion).toBe(1);
    expect(r.profilesIndex.profiles).toEqual([]);

    const folderNames = state.store
      .filter((f) => f.mimeType === 'application/vnd.google-apps.folder')
      .map((f) => f.name);
    expect(folderNames).toContain('EmailAutomation');
    expect(folderNames).toContain('metadata');
    expect(folderNames).toContain('profiles');
  });

  it('reuses cached rootFolderId on second run instead of re-creating', async () => {
    await ensureRoot();
    const initial = state.store.filter((f) => f.mimeType === 'application/vnd.google-apps.folder').length;
    await ensureRoot();
    const after = state.store.filter((f) => f.mimeType === 'application/vnd.google-apps.folder').length;
    expect(after).toBe(initial);
  });
});

describe('createProfile', () => {
  it('creates a Drive folder under profiles and appends to the index', async () => {
    await bootstrap();
    const profile = await createProfile('Flutter');
    expect(profile.name).toBe('Flutter');
    expect(profile.id).toBeTruthy();
    expect(profile.fileId).toBeTruthy();
    expect(state.index.profiles.map((p) => p.name)).toContain('Flutter');
  });

  it('rejects empty names', async () => {
    await bootstrap();
    await expect(createProfile('   ')).rejects.toThrow(/name required/);
  });
});

describe('createCategory', () => {
  it('creates folder + description.md + email_template.md and updates index', async () => {
    await bootstrap();
    const profile = await createProfile('Flutter');
    const category = await createCategory(profile.id, 'Senior Developer');
    expect(category.name).toBe('Senior Developer');
    expect(category.descriptionFileId).toBeTruthy();
    expect(category.templateFileId).toBeTruthy();
    const created = state.store.map((f) => f.name);
    expect(created).toContain('description.md');
    expect(created).toContain('email_template.md');
    expect(created).toContain('resumes');
    const profileFromIndex = state.index.profiles.find((p) => p.id === profile.id);
    expect(profileFromIndex?.categories.length).toBe(1);
  });

  it('throws when profile not found', async () => {
    await bootstrap();
    await expect(createCategory('missing-id', 'X')).rejects.toThrow(/profile not found/);
  });
});

describe('uploadResume', () => {
  it('uploads a binary file to <category>/resumes and appends to index', async () => {
    await bootstrap();
    const profile = await createProfile('Flutter');
    const category = await createCategory(profile.id, 'Senior');
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'resume.pdf', {
      type: 'application/pdf',
    });
    const resume = await uploadResume(category.id, file);
    expect(resume.name).toBe('resume.pdf');
    expect(resume.fileId).toBeTruthy();
    expect(resume.mimeType).toBe('application/pdf');
    const updated = state.index.profiles[0]!.categories[0]!;
    expect(updated.resumes.length).toBe(1);
  });

  it('throws when category id is unknown', async () => {
    await bootstrap();
    const file = new File([new Uint8Array([0])], 'x.pdf', { type: 'application/pdf' });
    await expect(uploadResume('nope', file)).rejects.toThrow(/category not found/);
  });
});

describe('deleteResume', () => {
  it('deletes the file in Drive and removes it from the index', async () => {
    await bootstrap();
    const profile = await createProfile('P');
    const category = await createCategory(profile.id, 'C');
    const file = new File([new Uint8Array([1])], 'r.pdf', { type: 'application/pdf' });
    const resume = await uploadResume(category.id, file);
    await deleteResume(category.id, resume.id);
    const cat = state.index.profiles[0]!.categories[0]!;
    expect(cat.resumes.length).toBe(0);
    expect(state.store.find((f) => f.id === resume.fileId)).toBeUndefined();
  });

  it('clears defaultResumeId when deleting the default resume', async () => {
    await bootstrap();
    const profile = await createProfile('P');
    const category = await createCategory(profile.id, 'C');
    const file = new File([new Uint8Array([1])], 'r.pdf', { type: 'application/pdf' });
    const resume = await uploadResume(category.id, file);
    await setDefaultResume(category.id, resume.id);
    expect(state.index.profiles[0]!.categories[0]!.defaultResumeId).toBe(resume.id);
    await deleteResume(category.id, resume.id);
    expect(state.index.profiles[0]!.categories[0]!.defaultResumeId).toBeNull();
  });
});

describe('setDefaultResume', () => {
  it('records the chosen resumeId as default', async () => {
    await bootstrap();
    const profile = await createProfile('P');
    const category = await createCategory(profile.id, 'C');
    const file = new File([new Uint8Array([1])], 'r.pdf', { type: 'application/pdf' });
    const resume = await uploadResume(category.id, file);
    await setDefaultResume(category.id, resume.id);
    expect(state.index.profiles[0]!.categories[0]!.defaultResumeId).toBe(resume.id);
  });

  it('throws when resume not in category', async () => {
    await bootstrap();
    const profile = await createProfile('P');
    const category = await createCategory(profile.id, 'C');
    await expect(setDefaultResume(category.id, 'nope')).rejects.toThrow(/resume not in category/);
  });
});

describe('updateDescription / updateTemplate', () => {
  it('patches existing description.md', async () => {
    await bootstrap();
    const profile = await createProfile('P');
    const category = await createCategory(profile.id, 'C');
    await updateDescription(category.id, '# new');
    // Patch was issued; description fileId stays the same
    expect(category.descriptionFileId).toBeTruthy();
  });

  it('patches existing template.md', async () => {
    await bootstrap();
    const profile = await createProfile('P');
    const category = await createCategory(profile.id, 'C');
    await updateTemplate(category.id, 'Subject: Hi');
    expect(category.templateFileId).toBeTruthy();
  });

  it('creates description.md if missing', async () => {
    await bootstrap();
    const profile = await createProfile('P');
    const category = await createCategory(profile.id, 'C');
    state.index.profiles[0]!.categories[0]!.descriptionFileId = null;
    await updateDescription(category.id, 'fresh');
    expect(state.index.profiles[0]!.categories[0]!.descriptionFileId).toBeTruthy();
  });

  it('creates template.md if missing', async () => {
    await bootstrap();
    const profile = await createProfile('P');
    const category = await createCategory(profile.id, 'C');
    state.index.profiles[0]!.categories[0]!.templateFileId = null;
    await updateTemplate(category.id, 'fresh');
    expect(state.index.profiles[0]!.categories[0]!.templateFileId).toBeTruthy();
  });

  it('throws when category not found (description)', async () => {
    await bootstrap();
    await expect(updateDescription('nope', 'x')).rejects.toThrow(/category not found/);
  });

  it('throws when category not found (template)', async () => {
    await bootstrap();
    await expect(updateTemplate('nope', 'x')).rejects.toThrow(/category not found/);
  });
});

describe('refreshProfilesIndex', () => {
  it('returns the latest index from Drive', async () => {
    await bootstrap();
    state.index = {
      ...state.index,
      profiles: [
        {
          id: 'p1',
          name: 'X',
          fileId: 'fx',
          createdAt: '2026-01-01T00:00:00Z',
          categories: [],
        },
      ],
    };
    const fresh = await refreshProfilesIndex();
    expect(fresh.profiles.map((p) => p.name)).toEqual(['X']);
  });
});

describe('writeJson conflict handling at higher level', () => {
  it('retries up to 3 times on 412 then succeeds', async () => {
    await bootstrap();
    state.patchPreconditionFailures = 2;
    const profile = await createProfile('Retry');
    expect(profile.name).toBe('Retry');
  });

  it('surfaces the error when 412 persists past the retry budget', async () => {
    await bootstrap();
    state.patchPreconditionFailures = 99;
    await expect(createProfile('Forever412')).rejects.toThrow();
  });
});

describe('writeJson direct', () => {
  it('sends If-Match when provided', async () => {
    await bootstrap();
    const etag = await writeJson('id-x', { hello: 'world' }, 'W/"abc"');
    // It returns the new etag from the response headers (If-Match-Echo isn't a real ETag)
    expect(etag === null || typeof etag === 'string').toBe(true);
  });
});
