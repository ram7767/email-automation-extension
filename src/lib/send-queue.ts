import { BehaviorSubject, Subject, concatMap, filter, from, of, take, timer } from 'rxjs';
import { sendApplicationEmail, hashRecipient } from './gmail';
import { appendSent, type SentEntry } from './sent-log';
import { QuotaError, HttpError } from './http';
import type { SendJob, SendJobAttachment } from './types';

const STORAGE_KEY = 'sendQueue.jobs';
const MAX_ATTEMPTS = 5;
const THROTTLE_MS = 600;

export interface EnqueueRequest {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  profileName: string;
  categoryName: string;
  resumeName?: string | null;
  attachments?: SendJobAttachment[];
  sourceUrl?: string | null;
}

export interface SendQueueEvent {
  type: 'EMAIL_SENT' | 'EMAIL_FAILED';
  job: SendJob;
}

export interface SendQueueStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface SendQueueDeps {
  send: typeof sendApplicationEmail;
  log: typeof appendSent;
  hash: typeof hashRecipient;
  throttleMs: number;
  storage: SendQueueStorage;
}

const browserStorage: SendQueueStorage = {
  async get(key: string) {
    return (await chrome.storage.local.get(key)) as Record<string, unknown>;
  },
  async set(items: Record<string, unknown>) {
    await chrome.storage.local.set(items);
  },
};

const defaultDeps = (): SendQueueDeps => ({
  send: sendApplicationEmail,
  log: appendSent,
  hash: hashRecipient,
  throttleMs: THROTTLE_MS,
  storage: browserStorage,
});

class SendQueue {
  private readonly jobs$: BehaviorSubject<SendJob[]>;
  private readonly events$: Subject<SendQueueEvent>;
  private readonly trigger$: Subject<void>;
  private deps: SendQueueDeps;
  private processing = false;
  private hydrated = false;

  constructor(deps: Partial<SendQueueDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
    this.jobs$ = new BehaviorSubject<SendJob[]>([]);
    this.events$ = new Subject<SendQueueEvent>();
    this.trigger$ = new Subject<void>();
    this.trigger$
      .pipe(
        concatMap(() => from(this.processOnce()).pipe(concatMap(() => timer(this.deps.throttleMs)))),
      )
      .subscribe();
  }

  setDeps(deps: Partial<SendQueueDeps>): void {
    this.deps = { ...this.deps, ...deps };
  }

  get jobs(): SendJob[] {
    return this.jobs$.value;
  }

  events(): Subject<SendQueueEvent> {
    return this.events$;
  }

  observePending(): BehaviorSubject<SendJob[]> {
    return this.jobs$;
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const stored = await this.deps.storage.get(STORAGE_KEY);
    const jobs = (stored?.[STORAGE_KEY] as SendJob[] | undefined) ?? [];
    // Reset any in-flight jobs back to queued so they can be picked up.
    const fresh = jobs.map((j) => (j.status === 'sending' ? { ...j, status: 'queued' as const } : j));
    this.jobs$.next(fresh);
    this.hydrated = true;
    if (fresh.some((j) => j.status === 'queued')) {
      this.kick();
    }
  }

  enqueue(req: EnqueueRequest): SendJob {
    const job: SendJob = {
      id: newJobId(),
      to: req.to,
      subject: req.subject,
      bodyText: req.bodyText,
      ...(req.bodyHtml !== undefined ? { bodyHtml: req.bodyHtml } : {}),
      profileName: req.profileName,
      categoryName: req.categoryName,
      resumeName: req.resumeName ?? null,
      attachments: req.attachments ?? [],
      sourceUrl: req.sourceUrl ?? null,
      status: 'queued',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    };
    this.jobs$.next([...this.jobs$.value, job]);
    void this.persist();
    this.kick();
    return job;
  }

  tick(): void {
    this.kick();
  }

  private kick(): void {
    this.trigger$.next();
  }

  private async persist(): Promise<void> {
    await this.deps.storage.set({ [STORAGE_KEY]: this.jobs$.value });
  }

  private async processOnce(): Promise<void> {
    if (this.processing) return;
    const next = this.jobs$.value.find((j) => j.status === 'queued');
    if (!next) return;
    this.processing = true;
    try {
      this.update(next.id, (j) => ({ ...j, status: 'sending', attempts: j.attempts + 1 }));
      await this.persist();
      const attachments = next.attachments.map((a) => ({
        name: a.name,
        mimeType: a.mimeType,
        bytes: base64ToBytes(a.bytesBase64),
      }));
      const result = await this.deps.send({
        to: next.to,
        subject: next.subject,
        bodyText: next.bodyText,
        ...(next.bodyHtml !== undefined ? { bodyHtml: next.bodyHtml } : {}),
        attachments,
        profileName: next.profileName,
        categoryName: next.categoryName,
        ...(next.sourceUrl ? { sourceUrl: next.sourceUrl } : {}),
      });
      const recipientHash = await this.deps.hash(next.to);
      const entry: SentEntry = {
        id: cryptoUuid(),
        sentAt: new Date().toISOString(),
        profileName: next.profileName,
        categoryName: next.categoryName,
        recipientHash,
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
        client: 'extension',
        ...(next.subject ? { subject: next.subject.slice(0, 200) } : {}),
        ...(next.resumeName !== undefined ? { resumeName: next.resumeName } : {}),
        ...(next.sourceUrl ? { sourceUrl: next.sourceUrl } : {}),
      };
      await this.deps.log(entry);
      const sentAt = entry.sentAt;
      const sentJob = this.update(next.id, (j) => ({
        ...j,
        status: 'sent',
        sentAt,
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
        lastError: null,
      }));
      await this.persist();
      if (sentJob) this.events$.next({ type: 'EMAIL_SENT', job: sentJob });
    } catch (e) {
      const reachedMax = (next.attempts + 1) >= MAX_ATTEMPTS || isFatal(e);
      const errMsg = e instanceof Error ? e.message : String(e);
      const failedJob = this.update(next.id, (j) => ({
        ...j,
        status: reachedMax ? 'failed' : 'queued',
        lastError: errMsg,
      }));
      await this.persist();
      if (reachedMax && failedJob) {
        this.events$.next({ type: 'EMAIL_FAILED', job: failedJob });
      } else {
        this.kick();
      }
    } finally {
      this.processing = false;
      // chain another tick to drain remaining queued items
      const more = this.jobs$.value.some((j) => j.status === 'queued');
      if (more) this.kick();
    }
  }

  private update(id: string, mutator: (j: SendJob) => SendJob): SendJob | undefined {
    let updated: SendJob | undefined;
    const next = this.jobs$.value.map((j) => {
      if (j.id !== id) return j;
      updated = mutator(j);
      return updated;
    });
    this.jobs$.next(next);
    return updated;
  }

  async waitForIdle(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.jobs$
        .pipe(
          filter(
            (jobs) => !jobs.some((j) => j.status === 'queued' || j.status === 'sending'),
          ),
          take(1),
          concatMap(() => of(undefined)),
        )
        .subscribe(() => resolve());
    });
  }

}

function isFatal(e: unknown): boolean {
  if (e instanceof QuotaError) return true; // already exhausted internal retries
  if (e instanceof HttpError) {
    if (e.status === 401 || e.status === 403 || e.status === 400) return true;
  }
  return false;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function newJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cryptoUuid(): string {
  return crypto.randomUUID();
}

let singleton: SendQueue | null = null;

export function getSendQueue(): SendQueue {
  if (!singleton) singleton = new SendQueue();
  return singleton;
}

export function _resetSendQueueForTests(deps?: Partial<SendQueueDeps>): SendQueue {
  singleton = new SendQueue(deps);
  return singleton;
}

export type { SendQueue };
