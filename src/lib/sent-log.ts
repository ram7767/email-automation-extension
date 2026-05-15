import {
  createMetadataJson,
  findMetadataFile,
  readJson,
  writeJson,
} from './drive';
import { HttpError } from './http';

export type SentClient = 'extension' | 'flutter-app';

export interface SentEntry {
  id: string;
  sentAt: string;
  profileName: string;
  categoryName: string;
  recipientHash: string;
  subject?: string;
  resumeName?: string | null;
  gmailMessageId: string;
  gmailThreadId?: string;
  client: SentClient;
  sourceUrl?: string | null;
}

export interface SentEmailsLog {
  schemaVersion: 1;
  currentShard: string;
  entries: SentEntry[];
}

const ROOT_FILE = 'sent_emails.json';
const SHARD_LIMIT = 500;
const MAX_RETRIES = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^[a-f0-9]{8}$/;

export class SentLogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SentLogValidationError';
  }
}

export function validateSentLog(value: unknown): asserts value is SentEmailsLog {
  if (!value || typeof value !== 'object') {
    throw new SentLogValidationError('sent log must be an object');
  }
  const v = value as Partial<SentEmailsLog>;
  if (v.schemaVersion !== 1) throw new SentLogValidationError('schemaVersion must be 1');
  if (typeof v.currentShard !== 'string' || !v.currentShard) {
    throw new SentLogValidationError('currentShard must be a non-empty string');
  }
  if (!Array.isArray(v.entries)) throw new SentLogValidationError('entries must be an array');
  v.entries.forEach((e, i) => validateEntry(e, i));
}

function validateEntry(entry: unknown, index: number): void {
  if (!entry || typeof entry !== 'object') {
    throw new SentLogValidationError(`entries[${index}] must be an object`);
  }
  const e = entry as Partial<SentEntry>;
  if (typeof e.id !== 'string' || !UUID_RE.test(e.id)) {
    throw new SentLogValidationError(`entries[${index}].id must be a uuid`);
  }
  if (typeof e.sentAt !== 'string' || Number.isNaN(Date.parse(e.sentAt))) {
    throw new SentLogValidationError(`entries[${index}].sentAt must be a date-time`);
  }
  if (typeof e.profileName !== 'string') {
    throw new SentLogValidationError(`entries[${index}].profileName must be string`);
  }
  if (typeof e.categoryName !== 'string') {
    throw new SentLogValidationError(`entries[${index}].categoryName must be string`);
  }
  if (typeof e.recipientHash !== 'string' || !HASH_RE.test(e.recipientHash)) {
    throw new SentLogValidationError(`entries[${index}].recipientHash must be 8 hex chars`);
  }
  if (typeof e.gmailMessageId !== 'string') {
    throw new SentLogValidationError(`entries[${index}].gmailMessageId must be string`);
  }
  if (e.client !== 'extension' && e.client !== 'flutter-app') {
    throw new SentLogValidationError(`entries[${index}].client must be extension|flutter-app`);
  }
  if (e.subject !== undefined && (typeof e.subject !== 'string' || e.subject.length > 200)) {
    throw new SentLogValidationError(`entries[${index}].subject too long`);
  }
}

function shardName(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `sent_emails_${y}-${m}.json`;
}

function emptyLog(currentShard: string): SentEmailsLog {
  return { schemaVersion: 1, currentShard, entries: [] };
}

async function ensureRootFile(): Promise<{ fileId: string; created: boolean }> {
  const existing = await findMetadataFile(ROOT_FILE);
  if (existing) return { fileId: existing, created: false };
  const seedShard = shardName(new Date());
  const fileId = await createMetadataJson(ROOT_FILE, emptyLog(seedShard));
  return { fileId, created: true };
}

async function ensureShardFile(name: string): Promise<{ fileId: string; created: boolean }> {
  const existing = await findMetadataFile(name);
  if (existing) return { fileId: existing, created: false };
  const fileId = await createMetadataJson(name, emptyLog(name));
  return { fileId, created: true };
}

interface ResolvedFile<T> {
  fileId: string;
  value: T;
  etag: string | null;
}

async function readWithFallback<T>(fileId: string, fallback: T): Promise<ResolvedFile<T>> {
  try {
    const r = await readJson<T>(fileId);
    return { fileId, value: r.value, etag: r.etag };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      return { fileId, value: fallback, etag: null };
    }
    throw e;
  }
}

async function writeWithRetry<T>(
  fileId: string,
  next: T,
  initialEtag: string | null,
  rebuild: () => Promise<T>,
): Promise<void> {
  let etag = initialEtag;
  let attempt = 0;
  let pending = next;
  while (attempt < MAX_RETRIES) {
    try {
      await writeJson(fileId, pending, etag ?? undefined);
      return;
    } catch (e) {
      if (e instanceof HttpError && e.status === 412) {
        attempt++;
        if (attempt >= MAX_RETRIES) break;
        pending = await rebuild();
        etag = null;
        continue;
      }
      throw e;
    }
  }
  throw new Error('sent-log: write failed after retries');
}

export async function appendSent(entry: SentEntry): Promise<void> {
  validateEntry(entry, 0);
  const root = await ensureRootFile();
  const rootRead = await readWithFallback<SentEmailsLog>(
    root.fileId,
    emptyLog(shardName(new Date())),
  );

  const targetShardName = rootRead.value.currentShard || shardName(new Date());
  const ensuredShard = await ensureShardFile(targetShardName);
  const shardRead = ensuredShard.created
    ? { value: emptyLog(targetShardName), etag: null as string | null }
    : await readJson<SentEmailsLog>(ensuredShard.fileId);

  if (shardRead.value.entries.length >= SHARD_LIMIT) {
    const newShardName = nextShardName(targetShardName);
    const newShard: SentEmailsLog = {
      schemaVersion: 1,
      currentShard: newShardName,
      entries: [entry],
    };
    validateSentLog(newShard);
    await createMetadataJson(newShardName, newShard);
    const updatedRoot: SentEmailsLog = {
      schemaVersion: 1,
      currentShard: newShardName,
      entries: [],
    };
    validateSentLog(updatedRoot);
    await writeWithRetry<SentEmailsLog>(
      root.fileId,
      updatedRoot,
      rootRead.etag,
      async () => updatedRoot,
    );
    return;
  }

  const updatedShard: SentEmailsLog = {
    schemaVersion: 1,
    currentShard: targetShardName,
    entries: [...shardRead.value.entries, entry],
  };
  validateSentLog(updatedShard);
  await writeWithRetry<SentEmailsLog>(
    ensuredShard.fileId,
    updatedShard,
    shardRead.etag,
    async () => {
      const fresh = await readJson<SentEmailsLog>(ensuredShard.fileId);
      return {
        schemaVersion: 1,
        currentShard: targetShardName,
        entries: [...fresh.value.entries, entry],
      };
    },
  );
}

function nextShardName(current: string): string {
  const fresh = shardName(new Date());
  if (fresh !== current) return fresh;
  const stamp = Date.now().toString(36).slice(-4);
  return fresh.replace(/\.json$/, `_${stamp}.json`);
}

export async function readLatestSentEntry(): Promise<SentEntry | null> {
  const rootFileId = await findMetadataFile(ROOT_FILE);
  if (!rootFileId) return null;
  const { value: root } = await readJson<SentEmailsLog>(rootFileId);
  let shard: SentEmailsLog = root;
  if (root.currentShard && root.currentShard !== ROOT_FILE) {
    const shardId = await findMetadataFile(root.currentShard);
    if (shardId) {
      const { value } = await readJson<SentEmailsLog>(shardId);
      shard = value;
    }
  }
  if (!shard.entries.length) return null;
  return shard.entries[shard.entries.length - 1] ?? null;
}
