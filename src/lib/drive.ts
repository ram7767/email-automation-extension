import { http } from './http';
import type { ProfileIndex } from './types';

const ROOT_FOLDER_NAME = 'EmailAutomation';
const METADATA_FOLDER = 'metadata';
const PROFILES_INDEX_FILE = 'profiles_index.json';
const ROOT_KEY = 'drive.rootFolderId';
const INDEX_FILE_KEY = 'drive.profilesIndexFileId';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
}

async function findFile(name: string, parentId: string | null, mimeType?: string): Promise<DriveFile | null> {
  const safeName = name.replace(/'/g, "\\'");
  const filters = [`name='${safeName}'`, 'trashed=false'];
  if (mimeType) filters.push(`mimeType='${mimeType}'`);
  if (parentId) filters.push(`'${parentId}' in parents`);
  const { value } = await http<{ files: DriveFile[] }>(
    'https://www.googleapis.com/drive/v3/files',
    { query: { q: filters.join(' and '), fields: 'files(id,name,mimeType,parents)', spaces: 'drive', pageSize: 10 } },
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

async function uploadJsonAsNew<T>(name: string, parentId: string, value: T): Promise<DriveFile> {
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

export async function readJson<T>(fileId: string): Promise<{ value: T; etag: string | null }> {
  return http<T>(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    query: { alt: 'media' },
  });
}

export async function writeJson<T>(fileId: string, value: T, ifMatch?: string): Promise<string | null> {
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

export async function ensureRoot(): Promise<{ rootFolderId: string; profilesIndex: ProfileIndex; profilesIndexFileId: string }> {
  const cached = await chrome.storage.local.get([ROOT_KEY, INDEX_FILE_KEY]);
  let rootFolderId = cached[ROOT_KEY] as string | undefined;
  let profilesIndexFileId = cached[INDEX_FILE_KEY] as string | undefined;

  if (!rootFolderId) {
    rootFolderId = await ensureFolder(ROOT_FOLDER_NAME, null);
    await chrome.storage.local.set({ [ROOT_KEY]: rootFolderId });
  }

  const metadataFolderId = await ensureFolder(METADATA_FOLDER, rootFolderId);
  await ensureFolder('profiles', rootFolderId);

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

  const { value: profilesIndex } = await readJson<ProfileIndex>(profilesIndexFileId);
  return { rootFolderId, profilesIndex, profilesIndexFileId };
}
