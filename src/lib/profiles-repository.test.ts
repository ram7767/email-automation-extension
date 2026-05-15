import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./drive', () => {
  type Cat = {
    id: string;
    name: string;
    fileId: string;
    createdAt: string;
    defaultResumeId: string | null;
    descriptionFileId: string | null;
    templateFileId: string | null;
    resumes: Array<{
      id: string;
      name: string;
      fileId: string;
      uploadedAt: string;
      sizeBytes: number;
      mimeType?: string;
    }>;
  };
  type Prof = {
    id: string;
    name: string;
    fileId: string;
    createdAt: string;
    categories: Cat[];
  };
  type Idx = {
    schemaVersion: 1;
    rootFolderId: string;
    updatedAt: string;
    updatedBy: 'extension' | 'flutter-app';
    profiles: Prof[];
  };
  const mockProfile = (id: string, name: string): Prof => ({
    id,
    name,
    fileId: `file-${id}`,
    createdAt: '2026-05-15T00:00:00Z',
    categories: [],
  });
  const mockIndex = (profileNames: string[]): Idx => ({
    schemaVersion: 1,
    rootFolderId: 'root',
    updatedAt: '2026-05-15T00:00:00Z',
    updatedBy: 'extension',
    profiles: profileNames.map((n, i) => mockProfile(`p${i}`, n)),
  });

  let currentIndex: Idx = mockIndex([]);

  return {
    ensureRoot: vi.fn(async () => ({
      rootFolderId: 'root',
      profilesIndex: currentIndex,
      profilesIndexFileId: 'idx',
    })),
    refreshProfilesIndex: vi.fn(async () => currentIndex),
    createProfile: vi.fn(async (name: string) => {
      const profile = mockProfile(`p${currentIndex.profiles.length}`, name);
      currentIndex = { ...currentIndex, profiles: [...currentIndex.profiles, profile] };
      return profile;
    }),
    createCategory: vi.fn(async (profileId: string, name: string) => {
      const category: Cat = {
        id: `c-${name}`,
        name,
        fileId: `cf-${name}`,
        createdAt: '2026-05-15T00:00:00Z',
        defaultResumeId: null,
        descriptionFileId: 'd',
        templateFileId: 't',
        resumes: [],
      };
      currentIndex = {
        ...currentIndex,
        profiles: currentIndex.profiles.map((p) =>
          p.id === profileId ? { ...p, categories: [...p.categories, category] } : p,
        ),
      };
      return category;
    }),
    uploadResume: vi.fn(async (categoryId: string, file: File) => {
      const resume: Cat['resumes'][number] = {
        id: `r-${file.name}`,
        name: file.name,
        fileId: `rf-${file.name}`,
        uploadedAt: '2026-05-15T00:00:00Z',
        sizeBytes: file.size,
        mimeType: file.type,
      };
      currentIndex = {
        ...currentIndex,
        profiles: currentIndex.profiles.map((p) => ({
          ...p,
          categories: p.categories.map((c) =>
            c.id === categoryId ? { ...c, resumes: [...c.resumes, resume] } : c,
          ),
        })),
      };
      return resume;
    }),
    deleteResume: vi.fn(async () => undefined),
    setDefaultResume: vi.fn(async () => undefined),
    updateDescription: vi.fn(async () => undefined),
    updateTemplate: vi.fn(async () => undefined),
    __reset: () => {
      currentIndex = mockIndex([]);
    },
    __setIndex: (idx: ReturnType<typeof mockIndex>) => {
      currentIndex = idx;
    },
  };
});

import * as drive from './drive';
import * as repo from './profiles-repository';
import { profiles$ } from './state';

const driveMock = drive as unknown as {
  ensureRoot: ReturnType<typeof vi.fn>;
  refreshProfilesIndex: ReturnType<typeof vi.fn>;
  createProfile: ReturnType<typeof vi.fn>;
  createCategory: ReturnType<typeof vi.fn>;
  uploadResume: ReturnType<typeof vi.fn>;
  deleteResume: ReturnType<typeof vi.fn>;
  setDefaultResume: ReturnType<typeof vi.fn>;
  updateDescription: ReturnType<typeof vi.fn>;
  updateTemplate: ReturnType<typeof vi.fn>;
  __reset: () => void;
  __setIndex: (i: unknown) => void;
};

beforeEach(() => {
  driveMock.__reset();
  repo._resetQueueForTests();
  profiles$.value = null;
  vi.clearAllMocks();
});

describe('profiles-repository', () => {
  it('bootstrap hydrates the profiles signal', async () => {
    await repo.bootstrap();
    expect(profiles$.value?.profiles).toEqual([]);
    expect(driveMock.ensureRoot).toHaveBeenCalledOnce();
  });

  it('createProfile updates the signal via refresh', async () => {
    await repo.bootstrap();
    const p = await repo.createProfile('Flutter');
    expect(p.name).toBe('Flutter');
    expect(profiles$.value?.profiles.map((x) => x.name)).toEqual(['Flutter']);
  });

  it('createCategory updates the signal', async () => {
    await repo.bootstrap();
    const profile = await repo.createProfile('Flutter');
    await repo.createCategory(profile.id, 'Senior');
    expect(profiles$.value?.profiles[0]?.categories[0]?.name).toBe('Senior');
  });

  it('uploadResume updates the signal with the new resume', async () => {
    await repo.bootstrap();
    const profile = await repo.createProfile('P');
    const cat = await repo.createCategory(profile.id, 'C');
    const file = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' });
    await repo.uploadResume(cat.id, file);
    expect(profiles$.value?.profiles[0]?.categories[0]?.resumes[0]?.name).toBe('a.pdf');
  });

  it('deleteResume / setDefaultResume / updateDescription / updateTemplate go through the queue', async () => {
    await repo.bootstrap();
    await repo.deleteResume('c', 'r');
    await repo.setDefaultResume('c', 'r');
    await repo.updateDescription('c', 'body');
    await repo.updateTemplate('c', 'body');
    expect(driveMock.deleteResume).toHaveBeenCalled();
    expect(driveMock.setDefaultResume).toHaveBeenCalled();
    expect(driveMock.updateDescription).toHaveBeenCalled();
    expect(driveMock.updateTemplate).toHaveBeenCalled();
  });

  it('serializes concurrent writes through the queue', async () => {
    await repo.bootstrap();
    const order: string[] = [];

    driveMock.createProfile.mockImplementation(async (name: string) => {
      order.push(`start:${name}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end:${name}`);
      return {
        id: `id-${name}`,
        name,
        fileId: `fx-${name}`,
        createdAt: 'now',
        categories: [],
      };
    });

    await Promise.all([
      repo.createProfile('A'),
      repo.createProfile('B'),
      repo.createProfile('C'),
    ]);

    expect(order).toEqual([
      'start:A',
      'end:A',
      'start:B',
      'end:B',
      'start:C',
      'end:C',
    ]);
  });

  it('refresh keeps queue alive even when an earlier task rejects', async () => {
    await repo.bootstrap();
    driveMock.createProfile.mockRejectedValueOnce(new Error('boom'));
    await expect(repo.createProfile('Bad')).rejects.toThrow(/boom/);
    // Subsequent op should still complete
    const p = await repo.createProfile('Good');
    expect(p.name).toBe('Good');
  });

  it('refresh syncs the signal from drive', async () => {
    await repo.bootstrap();
    driveMock.refreshProfilesIndex.mockResolvedValueOnce({
      schemaVersion: 1,
      rootFolderId: 'root',
      updatedAt: 'x',
      updatedBy: 'extension',
      profiles: [
        {
          id: 'remote',
          name: 'Remote',
          fileId: 'r',
          createdAt: 'x',
          categories: [],
        },
      ],
    });
    const fresh = await repo.refresh();
    expect(fresh.profiles[0]?.name).toBe('Remote');
    expect(profiles$.value?.profiles[0]?.name).toBe('Remote');
  });
});
