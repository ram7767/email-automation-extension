import { http, HttpError } from './http';
import type { Category, Profile, ProfileIndex, Resume } from './types';

const ROOT_FOLDER_NAME = 'EmailAutomation';
const METADATA_FOLDER = 'metadata';
const PROFILES_FOLDER = 'profiles';
const PROFILES_INDEX_FILE = 'profiles_index.json';
const ROOT_KEY = 'drive.rootFolderId';
const INDEX_FILE_KEY = 'drive.profilesIndexFileId';
const PROFILES_FOLDER_KEY = 'drive.profilesFolderId';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MARKDOWN_MIME = 'text/markdown';

const DESCRIPTION_FILE = 'description.md';
const TEMPLATE_FILE = 'email_template.md';
const RESUMES_FOLDER = 'resumes';

const MAX_INDEX_RETRIES = 3;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string;
}

let cachedIndexEtag: string | null = null;

export function _resetEtagCacheForTests(): void {
  cachedIndexEtag = null;
}

async function findFile(
  name: string,
  parentId: string | null,
  mimeType?: string,
): Promise<DriveFile | null> {
  const safeName = name.replace(/'/g, "\\'");
  const filters = [`name='${safeName}'`, 'trashed=false'];
  if (mimeType) filters.push(`mimeType='${mimeType}'`);
  if (parentId) filters.push(`'${parentId}' in parents`);
  const { value } = await http<{ files: DriveFile[] }>(
    'https://www.googleapis.com/drive/v3/files',
    {
      query: {
        q: filters.join(' and '),
        fields: 'files(id,name,mimeType,parents)',
        spaces: 'drive',
        pageSize: 10,
      },
    },
  );
  return value.files[0] ?? null;
}

async function createFolder(name: string, parentId: string | null): Promise<DriveFile> {
  const body: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) body.parents = [parentId];
  const { value } = await http<DriveFile>('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    query: { fields: 'id,name,mimeType,parents' },
  });
  return value;
}

async function ensureFolder(name: string, parentId: string | null): Promise<string> {
  const existing = await findFile(name, parentId, FOLDER_MIME);
  if (existing) return existing.id;
  const created = await createFolder(name, parentId);
  return created.id;
}

async function uploadJsonAsNew<T>(
  name: string,
  parentId: string,
  value: T,
): Promise<DriveFile> {
  const boundary = `eab${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType: 'application/json' });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(value)}\r\n` +
    `--${boundary}--`;
  const { value: created } = await http<DriveFile>(
    'https://www.googleapis.com/upload/drive/v3/files',
    {
      method: 'POST',
      query: { uploadType: 'multipart', fields: 'id,name,mimeType,parents' },
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return created;
}

async function uploadTextAsNew(
  name: string,
  parentId: string,
  mimeType: string,
  body: string,
): Promise<DriveFile> {
  const boundary = `eab${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType });
  const payload =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;
  const { value: created } = await http<DriveFile>(
    'https://www.googleapis.com/upload/drive/v3/files',
    {
      method: 'POST',
      query: { uploadType: 'multipart', fields: 'id,name,mimeType,parents' },
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: payload,
    },
  );
  return created;
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      resolve(new Uint8Array(buf));
    };
    reader.readAsArrayBuffer(file);
  });
}

async function uploadBinaryAsNew(
  name: string,
  parentId: string,
  file: File,
): Promise<DriveFile> {
  const boundary = `eab${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({
    name,
    parents: [parentId],
    mimeType: file.type || 'application/octet-stream',
  });
  const headerPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n` +
    `Content-Transfer-Encoding: binary\r\n\r\n`;
  const footer = `\r\n--${boundary}--`;

  const headerBytes = new TextEncoder().encode(headerPart);
  const footerBytes = new TextEncoder().encode(footer);
  const fileBytes = await fileToBytes(file);
  const body = new Uint8Array(headerBytes.length + fileBytes.length + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(fileBytes, headerBytes.length);
  body.set(footerBytes, headerBytes.length + fileBytes.length);

  const { value: created } = await http<DriveFile>(
    'https://www.googleapis.com/upload/drive/v3/files',
    {
      method: 'POST',
      query: { uploadType: 'multipart', fields: 'id,name,mimeType,parents,size' },
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: body as unknown as BodyInit,
    },
  );
  return created;
}

export async function readJson<T>(
  fileId: string,
): Promise<{ value: T; etag: string | null }> {
  return http<T>(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    query: { alt: 'media' },
  });
}

export async function writeJson<T>(
  fileId: string,
  value: T,
  ifMatch?: string,
): Promise<string | null> {
  const opts: Parameters<typeof http>[1] = {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    query: { uploadType: 'media' },
  };
  if (ifMatch) opts.ifMatch = ifMatch;
  const { etag } = await http<unknown>(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}`,
    opts,
  );
  return etag;
}

async function patchTextFile(fileId: string, mimeType: string, body: string): Promise<void> {
  await http<unknown>(`https://www.googleapis.com/upload/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': `${mimeType}; charset=UTF-8` },
    body,
    query: { uploadType: 'media' },
  });
}

async function deleteFile(fileId: string): Promise<void> {
  await http<unknown>(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
  });
}

async function getProfilesFolderId(): Promise<string> {
  const cached = await chrome.storage.local.get([PROFILES_FOLDER_KEY, ROOT_KEY]);
  let id = cached[PROFILES_FOLDER_KEY] as string | undefined;
  if (id) return id;
  const rootId = cached[ROOT_KEY] as string | undefined;
  if (!rootId) throw new Error('drive: root not initialized');
  id = await ensureFolder(PROFILES_FOLDER, rootId);
  await chrome.storage.local.set({ [PROFILES_FOLDER_KEY]: id });
  return id;
}

async function getIndexFileId(): Promise<string> {
  const cached = await chrome.storage.local.get(INDEX_FILE_KEY);
  const id = cached[INDEX_FILE_KEY] as string | undefined;
  if (!id) throw new Error('drive: profiles index not initialized');
  return id;
}

export async function refreshProfilesIndex(): Promise<ProfileIndex> {
  const indexFileId = await getIndexFileId();
  const { value, etag } = await readJson<ProfileIndex>(indexFileId);
  cachedIndexEtag = etag;
  return value;
}

async function commitIndex(
  mutator: (index: ProfileIndex) => ProfileIndex | Promise<ProfileIndex>,
): Promise<ProfileIndex> {
  const indexFileId = await getIndexFileId();
  let attempt = 0;
  let lastError: unknown;
  while (attempt < MAX_INDEX_RETRIES) {
    if (cachedIndexEtag === null) {
      const fresh = await readJson<ProfileIndex>(indexFileId);
      cachedIndexEtag = fresh.etag;
    }
    const { value: current } = await readJson<ProfileIndex>(indexFileId);
    const next = await mutator(current);
    const stamped: ProfileIndex = {
      ...next,
      updatedAt: new Date().toISOString(),
      updatedBy: 'extension',
    };
    try {
      const newEtag = await writeJson(
        indexFileId,
        stamped,
        cachedIndexEtag ?? undefined,
      );
      cachedIndexEtag = newEtag;
      return stamped;
    } catch (e) {
      lastError = e;
      if (e instanceof HttpError && e.status === 412) {
        cachedIndexEtag = null;
        attempt++;
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('drive: profiles index write failed after retries');
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const DEFAULT_DESCRIPTION = `# Description\n\nWrite a short description of this category here.\n`;
const DEFAULT_TEMPLATE = `# Email template\n\nSubject: Application for {{role}} at {{company}}\n\nHi {{recipientName}},\n\nI'm reaching out about the {{role}} role at {{company}}. My resume is attached.\n\nRegards,\n{{myName}}\n`;

export async function createProfile(name: string): Promise<Profile> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('drive: profile name required');
  const profilesFolderId = await getProfilesFolderId();
  const folder = await createFolder(trimmed, profilesFolderId);
  const profile: Profile = {
    id: newId(),
    name: trimmed,
    fileId: folder.id,
    createdAt: nowIso(),
    categories: [],
  };
  await commitIndex((current) => ({
    ...current,
    profiles: [...current.profiles, profile],
  }));
  return profile;
}

export async function createCategory(profileId: string, name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('drive: category name required');
  const index = await refreshProfilesIndex();
  const profile = index.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('drive: profile not found');

  const folder = await createFolder(trimmed, profile.fileId);
  await ensureFolder(RESUMES_FOLDER, folder.id);
  const description = await uploadTextAsNew(
    DESCRIPTION_FILE,
    folder.id,
    MARKDOWN_MIME,
    DEFAULT_DESCRIPTION,
  );
  const template = await uploadTextAsNew(
    TEMPLATE_FILE,
    folder.id,
    MARKDOWN_MIME,
    DEFAULT_TEMPLATE,
  );

  const category: Category = {
    id: newId(),
    name: trimmed,
    fileId: folder.id,
    createdAt: nowIso(),
    defaultResumeId: null,
    descriptionFileId: description.id,
    templateFileId: template.id,
    resumes: [],
  };

  await commitIndex((current) => ({
    ...current,
    profiles: current.profiles.map((p) =>
      p.id === profileId ? { ...p, categories: [...p.categories, category] } : p,
    ),
  }));
  return category;
}

interface CategoryRef {
  profile: Profile;
  category: Category;
}

function findCategoryRef(index: ProfileIndex, categoryId: string): CategoryRef | null {
  for (const profile of index.profiles) {
    for (const category of profile.categories) {
      if (category.id === categoryId) return { profile, category };
    }
  }
  return null;
}

async function ensureResumesFolder(category: Category): Promise<string> {
  return ensureFolder(RESUMES_FOLDER, category.fileId);
}

export async function uploadResume(categoryId: string, file: File): Promise<Resume> {
  const index = await refreshProfilesIndex();
  const ref = findCategoryRef(index, categoryId);
  if (!ref) throw new Error('drive: category not found');
  const resumesFolderId = await ensureResumesFolder(ref.category);
  const uploaded = await uploadBinaryAsNew(file.name, resumesFolderId, file);

  const resume: Resume = {
    id: newId(),
    name: file.name,
    fileId: uploaded.id,
    uploadedAt: nowIso(),
    sizeBytes: typeof uploaded.size === 'string' ? Number(uploaded.size) : file.size,
    mimeType: file.type || 'application/octet-stream',
  };

  await commitIndex((current) => ({
    ...current,
    profiles: current.profiles.map((p) => ({
      ...p,
      categories: p.categories.map((c) =>
        c.id === categoryId ? { ...c, resumes: [...c.resumes, resume] } : c,
      ),
    })),
  }));
  return resume;
}

export async function deleteResume(categoryId: string, resumeId: string): Promise<void> {
  const index = await refreshProfilesIndex();
  const ref = findCategoryRef(index, categoryId);
  if (!ref) throw new Error('drive: category not found');
  const resume = ref.category.resumes.find((r) => r.id === resumeId);
  if (!resume) throw new Error('drive: resume not found');

  await deleteFile(resume.fileId);
  await commitIndex((current) => ({
    ...current,
    profiles: current.profiles.map((p) => ({
      ...p,
      categories: p.categories.map((c) => {
        if (c.id !== categoryId) return c;
        const resumes = c.resumes.filter((r) => r.id !== resumeId);
        const defaultResumeId = c.defaultResumeId === resumeId ? null : c.defaultResumeId;
        return { ...c, resumes, defaultResumeId };
      }),
    })),
  }));
}

export async function setDefaultResume(
  categoryId: string,
  resumeId: string,
): Promise<void> {
  await commitIndex((current) => ({
    ...current,
    profiles: current.profiles.map((p) => ({
      ...p,
      categories: p.categories.map((c) => {
        if (c.id !== categoryId) return c;
        const exists = c.resumes.some((r) => r.id === resumeId);
        if (!exists) throw new Error('drive: resume not in category');
        return { ...c, defaultResumeId: resumeId };
      }),
    })),
  }));
}

export async function updateDescription(categoryId: string, body: string): Promise<void> {
  const index = await refreshProfilesIndex();
  const ref = findCategoryRef(index, categoryId);
  if (!ref) throw new Error('drive: category not found');
  let descriptionFileId = ref.category.descriptionFileId;
  if (!descriptionFileId) {
    const created = await uploadTextAsNew(
      DESCRIPTION_FILE,
      ref.category.fileId,
      MARKDOWN_MIME,
      body,
    );
    descriptionFileId = created.id;
    await commitIndex((current) => ({
      ...current,
      profiles: current.profiles.map((p) => ({
        ...p,
        categories: p.categories.map((c) =>
          c.id === categoryId ? { ...c, descriptionFileId } : c,
        ),
      })),
    }));
    return;
  }
  await patchTextFile(descriptionFileId, MARKDOWN_MIME, body);
}

export async function updateTemplate(categoryId: string, body: string): Promise<void> {
  const index = await refreshProfilesIndex();
  const ref = findCategoryRef(index, categoryId);
  if (!ref) throw new Error('drive: category not found');
  let templateFileId = ref.category.templateFileId;
  if (!templateFileId) {
    const created = await uploadTextAsNew(
      TEMPLATE_FILE,
      ref.category.fileId,
      MARKDOWN_MIME,
      body,
    );
    templateFileId = created.id;
    await commitIndex((current) => ({
      ...current,
      profiles: current.profiles.map((p) => ({
        ...p,
        categories: p.categories.map((c) =>
          c.id === categoryId ? { ...c, templateFileId } : c,
        ),
      })),
    }));
    return;
  }
  await patchTextFile(templateFileId, MARKDOWN_MIME, body);
}

export async function ensureRoot(): Promise<{
  rootFolderId: string;
  profilesIndex: ProfileIndex;
  profilesIndexFileId: string;
}> {
  const cached = await chrome.storage.local.get([
    ROOT_KEY,
    INDEX_FILE_KEY,
    PROFILES_FOLDER_KEY,
  ]);
  let rootFolderId = cached[ROOT_KEY] as string | undefined;
  let profilesIndexFileId = cached[INDEX_FILE_KEY] as string | undefined;
  let profilesFolderId = cached[PROFILES_FOLDER_KEY] as string | undefined;

  if (!rootFolderId) {
    rootFolderId = await ensureFolder(ROOT_FOLDER_NAME, null);
    await chrome.storage.local.set({ [ROOT_KEY]: rootFolderId });
  }

  const metadataFolderId = await ensureFolder(METADATA_FOLDER, rootFolderId);
  if (!profilesFolderId) {
    profilesFolderId = await ensureFolder(PROFILES_FOLDER, rootFolderId);
    await chrome.storage.local.set({ [PROFILES_FOLDER_KEY]: profilesFolderId });
  }

  if (!profilesIndexFileId) {
    const existing = await findFile(PROFILES_INDEX_FILE, metadataFolderId);
    if (existing) {
      profilesIndexFileId = existing.id;
    } else {
      const seed: ProfileIndex = {
        schemaVersion: 1,
        rootFolderId,
        updatedAt: new Date().toISOString(),
        updatedBy: 'extension',
        profiles: [],
      };
      const created = await uploadJsonAsNew(PROFILES_INDEX_FILE, metadataFolderId, seed);
      profilesIndexFileId = created.id;
    }
    await chrome.storage.local.set({ [INDEX_FILE_KEY]: profilesIndexFileId });
  }

  const { value: profilesIndex, etag } = await readJson<ProfileIndex>(profilesIndexFileId);
  cachedIndexEtag = etag;
  return { rootFolderId, profilesIndex, profilesIndexFileId };
}
