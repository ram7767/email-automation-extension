import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeFile {
  id: string;
  name: string;
  value: unknown;
  etag: string;
}

const state = {
  files: [] as FakeFile[],
  nextId: 0,
  etagCounter: 0,
  patchPreconditionFailures: 0,
};

function makeId(): string {
  state.nextId++;
  return `file-${state.nextId}`;
}

function makeEtag(): string {
  state.etagCounter++;
  return `W/"${state.etagCounter}"`;
}

vi.mock('./drive', () => ({
  findMetadataFile: vi.fn(async (name: string) => {
    return state.files.find((f) => f.name === name)?.id ?? null;
  }),
  createMetadataJson: vi.fn(async (name: string, value: unknown) => {
    const file: FakeFile = { id: makeId(), name, value, etag: makeEtag() };
    state.files.push(file);
    return file.id;
  }),
  readJson: vi.fn(async (fileId: string) => {
    const file = state.files.find((f) => f.id === fileId);
    if (!file) {
      const { HttpError } = await import('./http');
      throw new HttpError(404, 'not found', false);
    }
    return { value: structuredClone(file.value), etag: file.etag };
  }),
  writeJson: vi.fn(async (fileId: string, value: unknown, ifMatch?: string) => {
    if (state.patchPreconditionFailures > 0) {
      state.patchPreconditionFailures--;
      const { HttpError } = await import('./http');
      throw new HttpError(412, 'precondition failed', false);
    }
    const file = state.files.find((f) => f.id === fileId);
    if (!file) {
      const { HttpError } = await import('./http');
      throw new HttpError(404, 'not found', false);
    }
    if (ifMatch && ifMatch !== file.etag) {
      const { HttpError } = await import('./http');
      throw new HttpError(412, 'etag mismatch', false);
    }
    file.value = value;
    file.etag = makeEtag();
    return file.etag;
  }),
}));

import {
  appendSent,
  readLatestSentEntry,
  validateSentLog,
  SentLogValidationError,
  type SentEmailsLog,
  type SentEntry,
} from './sent-log';

function entry(over: Partial<SentEntry> = {}): SentEntry {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    sentAt: '2026-05-15T12:00:00.000Z',
    profileName: 'Flutter',
    categoryName: 'Senior',
    recipientHash: 'deadbeef',
    gmailMessageId: 'mid',
    gmailThreadId: 'tid',
    client: 'extension',
    subject: 'Hello',
    ...over,
  };
}

beforeEach(() => {
  state.files = [];
  state.nextId = 0;
  state.etagCounter = 0;
  state.patchPreconditionFailures = 0;
  vi.clearAllMocks();
});

describe('validateSentLog', () => {
  it('accepts a well-formed log', () => {
    const log: SentEmailsLog = {
      schemaVersion: 1,
      currentShard: 'sent_emails_2026-05.json',
      entries: [entry()],
    };
    expect(() => validateSentLog(log)).not.toThrow();
  });

  it('rejects bad schemaVersion', () => {
    expect(() => validateSentLog({ schemaVersion: 2, currentShard: 'x', entries: [] })).toThrow(
      SentLogValidationError,
    );
  });

  it('rejects bad recipientHash', () => {
    const bad: SentEmailsLog = {
      schemaVersion: 1,
      currentShard: 'sent_emails_2026-05.json',
      entries: [entry({ recipientHash: 'NOT-HEX' })],
    };
    expect(() => validateSentLog(bad)).toThrow(/recipientHash/);
  });

  it('rejects entries missing required fields', () => {
    expect(() =>
      validateSentLog({
        schemaVersion: 1,
        currentShard: 'x',
        entries: [{ id: 'not-uuid' }],
      }),
    ).toThrow();
  });
});

describe('appendSent — file lifecycle', () => {
  it('creates the root file and a new shard on the first append', async () => {
    await appendSent(entry());
    expect(state.files.find((f) => f.name === 'sent_emails.json')).toBeDefined();
    const root = state.files.find((f) => f.name === 'sent_emails.json')!.value as SentEmailsLog;
    expect(root.currentShard).toMatch(/^sent_emails_\d{4}-\d{2}\.json$/);
    expect(root.entries.length).toBe(0);
    const shard = state.files.find((f) => f.name === root.currentShard)!.value as SentEmailsLog;
    expect(shard.entries.length).toBe(1);
    expect(shard.entries[0]!.gmailMessageId).toBe('mid');
  });

  it('appends to the existing shard on subsequent calls', async () => {
    await appendSent(entry({ id: '11111111-2222-3333-4444-555555555555', gmailMessageId: 'a' }));
    await appendSent(entry({ id: '22222222-3333-4444-5555-666666666666', gmailMessageId: 'b' }));
    await appendSent(entry({ id: '33333333-4444-5555-6666-777777777777', gmailMessageId: 'c' }));
    const root = state.files.find((f) => f.name === 'sent_emails.json')!.value as SentEmailsLog;
    const shard = state.files.find((f) => f.name === root.currentShard)!.value as SentEmailsLog;
    expect(shard.entries.map((e) => e.gmailMessageId)).toEqual(['a', 'b', 'c']);
  });
});

describe('appendSent — ETag merge on 412', () => {
  it('retries up to 3 times on a 412 then succeeds', async () => {
    await appendSent(entry({ gmailMessageId: 'a' }));
    state.patchPreconditionFailures = 2;
    await appendSent(entry({ id: '22222222-3333-4444-5555-666666666666', gmailMessageId: 'b' }));
    const root = state.files.find((f) => f.name === 'sent_emails.json')!.value as SentEmailsLog;
    const shard = state.files.find((f) => f.name === root.currentShard)!.value as SentEmailsLog;
    expect(shard.entries.map((e) => e.gmailMessageId)).toContain('b');
  });

  it('throws when 412 persists past the retry budget', async () => {
    await appendSent(entry({ gmailMessageId: 'first' }));
    state.patchPreconditionFailures = 99;
    await expect(
      appendSent(entry({ id: '99999999-9999-9999-9999-999999999999', gmailMessageId: 'doomed' })),
    ).rejects.toThrow();
  });
});

describe('appendSent — shard rollover', () => {
  it('rolls into a new shard when entries.length >= 500', async () => {
    // Seed shard with 500 entries.
    await appendSent(entry({ gmailMessageId: 'seed' }));
    const root = state.files.find((f) => f.name === 'sent_emails.json')!.value as SentEmailsLog;
    const shardFile = state.files.find((f) => f.name === root.currentShard)!;
    const big: SentEntry[] = [];
    for (let i = 0; i < 500; i++) {
      big.push(
        entry({
          id: `${(i + 100).toString(16).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`,
          gmailMessageId: `m${i}`,
        }),
      );
    }
    shardFile.value = { schemaVersion: 1, currentShard: root.currentShard, entries: big };

    // Now append; we expect a new shard to be created and the root pointer to update.
    await appendSent(
      entry({
        id: 'fffffff0-aaaa-bbbb-cccc-dddddddddddd',
        gmailMessageId: 'overflow',
      }),
    );
    const newRoot = state.files.find((f) => f.name === 'sent_emails.json')!.value as SentEmailsLog;
    expect(newRoot.currentShard).not.toBe(root.currentShard);
    const newShard = state.files.find((f) => f.name === newRoot.currentShard)!.value as SentEmailsLog;
    expect(newShard.entries.length).toBe(1);
    expect(newShard.entries[0]!.gmailMessageId).toBe('overflow');
    // Old shard untouched
    const oldShard = state.files.find((f) => f.name === root.currentShard)!.value as SentEmailsLog;
    expect(oldShard.entries.length).toBe(500);
  });
});

describe('readLatestSentEntry', () => {
  it('returns null before any sends', async () => {
    expect(await readLatestSentEntry()).toBeNull();
  });

  it('returns the most recent entry from the current shard', async () => {
    await appendSent(entry({ gmailMessageId: 'first' }));
    await appendSent(
      entry({ id: '22222222-3333-4444-5555-666666666666', gmailMessageId: 'last' }),
    );
    const latest = await readLatestSentEntry();
    expect(latest?.gmailMessageId).toBe('last');
  });
});
