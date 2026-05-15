import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';

vi.mock('./auth', () => ({
  getAccessToken: vi.fn(async () => 'tok'),
  signOut: vi.fn(async () => undefined),
}));

import { _resetSendQueueForTests, getSendQueue } from './send-queue';
import type { SendJob } from './types';
import { HttpError, QuotaError } from './http';

const STORAGE_KEY = 'sendQueue.jobs';

interface MockStorage {
  data: Record<string, unknown>;
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

function makeStorage(): MockStorage {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }),
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  _resetSendQueueForTests();
});

async function waitForIdle(q: ReturnType<typeof _resetSendQueueForTests>): Promise<void> {
  await q.waitForIdle();
}

describe('send-queue', () => {
  it('processes a single job and emits EMAIL_SENT', async () => {
    const send = vi.fn(async () => ({ messageId: 'm1', threadId: 't1' }));
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'deadbeef');
    const storage = makeStorage();
    const q = _resetSendQueueForTests({
      send,
      log,
      hash,
      throttleMs: 1,
      storage,
    });
    const eventP = firstValueFrom(q.events());
    q.enqueue({
      to: 'jane@example.com',
      subject: 'Hi',
      bodyText: 'Body',
      profileName: 'Flutter',
      categoryName: 'Senior',
    });
    const ev = await eventP;
    expect(ev.type).toBe('EMAIL_SENT');
    expect(ev.job.status).toBe('sent');
    expect(send).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
  });

  it('processes jobs serially with throttle between them', async () => {
    const order: string[] = [];
    const send = vi.fn(async (req: { subject: string }) => {
      order.push(`start:${req.subject}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${req.subject}`);
      return { messageId: req.subject, threadId: 't' };
    });
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const storage = makeStorage();
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    const events = firstValueFrom(q.events().pipe(take(3), toArray()));
    q.enqueue({
      to: 'a@x.com',
      subject: 'A',
      bodyText: 'b',
      profileName: 'P',
      categoryName: 'C',
    });
    q.enqueue({
      to: 'b@x.com',
      subject: 'B',
      bodyText: 'b',
      profileName: 'P',
      categoryName: 'C',
    });
    q.enqueue({
      to: 'c@x.com',
      subject: 'C',
      bodyText: 'b',
      profileName: 'P',
      categoryName: 'C',
    });
    await events;
    expect(order).toEqual([
      'start:A',
      'end:A',
      'start:B',
      'end:B',
      'start:C',
      'end:C',
    ]);
  });

  it('persists pending jobs to chrome.storage.local', async () => {
    const send = vi.fn(async () => ({ messageId: 'm', threadId: 't' }));
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const storage = makeStorage();
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    q.enqueue({
      to: 'jane@example.com',
      subject: 'Hi',
      bodyText: 'Body',
      profileName: 'P',
      categoryName: 'C',
    });
    await waitForIdle(q);
    const persisted = storage.data[STORAGE_KEY] as SendJob[];
    expect(persisted).toBeDefined();
    expect(persisted.length).toBe(1);
    expect(persisted[0]!.status).toBe('sent');
  });

  it('rehydrates pending jobs after a SW restart and resumes processing', async () => {
    const storage = makeStorage();
    storage.data[STORAGE_KEY] = [
      {
        id: 'job_old_1',
        to: 'rehydrate@example.com',
        subject: 'Carryover',
        bodyText: 'b',
        profileName: 'P',
        categoryName: 'C',
        resumeName: null,
        attachments: [],
        sourceUrl: null,
        status: 'queued',
        attempts: 0,
        lastError: null,
        createdAt: '2026-05-15T00:00:00Z',
      },
    ] satisfies SendJob[];

    const send = vi.fn(async () => ({ messageId: 'rm', threadId: 'rt' }));
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    const eventP = firstValueFrom(q.events());
    await q.hydrate();
    const ev = await eventP;
    expect(ev.type).toBe('EMAIL_SENT');
    expect(send).toHaveBeenCalledOnce();
  });

  it('flips a job that was sending mid-restart back to queued on hydrate', async () => {
    const storage = makeStorage();
    storage.data[STORAGE_KEY] = [
      {
        id: 'job_old_1',
        to: 'x@example.com',
        subject: 'X',
        bodyText: 'b',
        profileName: 'P',
        categoryName: 'C',
        resumeName: null,
        attachments: [],
        sourceUrl: null,
        status: 'sending', // crashed mid-send
        attempts: 1,
        lastError: null,
        createdAt: '2026-05-15T00:00:00Z',
      },
    ] satisfies SendJob[];
    const send = vi.fn(async () => ({ messageId: 'rm', threadId: 'rt' }));
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    await q.hydrate();
    await waitForIdle(q);
    expect(send).toHaveBeenCalledOnce();
  });

  it('retries a failing send up to MAX_ATTEMPTS, then marks failed', async () => {
    const send = vi.fn(async () => {
      throw new Error('transient boom');
    });
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const storage = makeStorage();
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    const eventP = firstValueFrom(q.events());
    q.enqueue({
      to: 'fail@example.com',
      subject: 'F',
      bodyText: 'b',
      profileName: 'P',
      categoryName: 'C',
    });
    const ev = await eventP;
    expect(ev.type).toBe('EMAIL_FAILED');
    expect(ev.job.status).toBe('failed');
    expect(send).toHaveBeenCalledTimes(5);
    expect(log).not.toHaveBeenCalled();
  });

  it('marks job failed immediately on a fatal QuotaError', async () => {
    const send = vi.fn(async () => {
      throw new QuotaError('over quota');
    });
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const storage = makeStorage();
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    const eventP = firstValueFrom(q.events());
    q.enqueue({
      to: 'q@example.com',
      subject: 'Q',
      bodyText: 'b',
      profileName: 'P',
      categoryName: 'C',
    });
    const ev = await eventP;
    expect(ev.type).toBe('EMAIL_FAILED');
    expect(send).toHaveBeenCalledOnce();
  });

  it('marks job failed immediately on a fatal HttpError 401', async () => {
    const send = vi.fn(async () => {
      throw new HttpError(401, 'unauthorized', false);
    });
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const storage = makeStorage();
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    const eventP = firstValueFrom(q.events());
    q.enqueue({
      to: 'unauth@example.com',
      subject: 'U',
      bodyText: 'b',
      profileName: 'P',
      categoryName: 'C',
    });
    const ev = await eventP;
    expect(ev.type).toBe('EMAIL_FAILED');
    expect(send).toHaveBeenCalledOnce();
  });

  it('decodes base64 attachments before sending', async () => {
    const send = vi.fn(async (req: { attachments: Array<{ bytes: Uint8Array }> }) => {
      expect(req.attachments[0]!.bytes).toEqual(new Uint8Array([1, 2, 3]));
      return { messageId: 'm', threadId: 't' };
    });
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const storage = makeStorage();
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    const eventP = firstValueFrom(q.events());
    q.enqueue({
      to: 'a@example.com',
      subject: 'A',
      bodyText: 'b',
      profileName: 'P',
      categoryName: 'C',
      attachments: [
        {
          name: 'r.pdf',
          mimeType: 'application/pdf',
          bytesBase64: btoa('\x01\x02\x03'),
        },
      ],
    });
    await eventP;
    expect(send).toHaveBeenCalledOnce();
  });

  it('getSendQueue returns the same singleton instance', () => {
    _resetSendQueueForTests();
    const a = getSendQueue();
    const b = getSendQueue();
    expect(a).toBe(b);
  });

  it('tick() drives queued sends after SW wake', async () => {
    const send = vi.fn(async () => ({ messageId: 'm', threadId: 't' }));
    const log = vi.fn(async () => undefined);
    const hash = vi.fn(async () => 'aaaaaaaa');
    const storage = makeStorage();
    storage.data[STORAGE_KEY] = [
      {
        id: 'job_alarm_1',
        to: 'j@example.com',
        subject: 'A',
        bodyText: 'b',
        profileName: 'P',
        categoryName: 'C',
        resumeName: null,
        attachments: [],
        sourceUrl: null,
        status: 'queued',
        attempts: 0,
        lastError: null,
        createdAt: '2026-05-15T00:00:00Z',
      },
    ] satisfies SendJob[];
    const q = _resetSendQueueForTests({ send, log, hash, throttleMs: 1, storage });
    await q.hydrate();
    q.tick();
    await waitForIdle(q);
    expect(send).toHaveBeenCalled();
  });
});
