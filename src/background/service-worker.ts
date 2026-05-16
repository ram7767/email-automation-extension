/// <reference types="chrome" />
import { bootAuthStatus, signIn, signOut } from '@/lib/auth';
import { ensureRoot } from '@/lib/drive';
import * as repo from '@/lib/profiles-repository';
import type { Msg, Reply, UploadResumePayload, RuntimeEvent } from '@/lib/messages';
import { getSendQueue } from '@/lib/send-queue';
import { readLatestSentEntry } from '@/lib/sent-log';

const PROFILES_INDEX_STORAGE_KEY = 'profiles.index';
const PROCESS_QUEUE_ALARM = 'processSendQueue';

const queue = getSendQueue();
let queueWired = false;

function wireQueue(): void {
  if (queueWired) return;
  queueWired = true;
  void queue.hydrate();
  queue.events().subscribe((ev) => {
    const runtimeEvent: RuntimeEvent =
      ev.type === 'EMAIL_SENT'
        ? {
            type: 'EMAIL_SENT',
            jobId: ev.job.id,
            subject: ev.job.subject,
            sentAt: ev.job.sentAt ?? new Date().toISOString(),
          }
        : {
            type: 'EMAIL_FAILED',
            jobId: ev.job.id,
            error: ev.job.lastError ?? 'unknown',
          };
    try {
      chrome.runtime.sendMessage(runtimeEvent, () => {
        // Swallow: popup may be closed, lastError will fire — no-op.
        void chrome.runtime.lastError;
      });
    } catch {
      /* popup not open */
    }
  });
}

try {
  wireQueue();
} catch (e) {
  console.warn('[EmailAutomation] queue wiring deferred:', e);
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    void chrome.storage.local.set({ installedAt: new Date().toISOString() });
  }
  if (chrome.alarms?.create) {
    chrome.alarms.create(PROCESS_QUEUE_ALARM, { periodInMinutes: 1 });
  }
});

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PROCESS_QUEUE_ALARM) {
      void queue.hydrate().then(() => queue.tick());
    }
  });
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function payloadToFile(payload: UploadResumePayload): File {
  const bytes = base64ToUint8Array(payload.dataBase64);
  return new File([bytes.buffer as ArrayBuffer], payload.fileName, {
    type: payload.mimeType || 'application/octet-stream',
  });
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse: (r: Reply) => void) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'PING':
          sendResponse({ type: 'PING', ok: true, ts: Date.now() });
          break;
        case 'BOOT_AUTH': {
          const status = await bootAuthStatus();
          sendResponse({ type: 'BOOT_AUTH', status });
          break;
        }
        case 'SIGN_IN': {
          const ok = await signIn();
          sendResponse({ type: 'SIGN_IN', ok });
          break;
        }
        case 'SIGN_OUT': {
          await signOut();
          sendResponse({ type: 'SIGN_OUT', ok: true });
          break;
        }
        case 'BOOTSTRAP_DRIVE': {
          const r = await ensureRoot();
          await chrome.storage.local.set({ [PROFILES_INDEX_STORAGE_KEY]: r.profilesIndex });
          sendResponse({
            type: 'BOOTSTRAP_DRIVE',
            ok: true,
            rootFolderId: r.rootFolderId,
            profiles: r.profilesIndex,
          });
          break;
        }
        case 'REFRESH_PROFILES': {
          const profiles = await repo.refresh();
          await chrome.storage.local.set({ [PROFILES_INDEX_STORAGE_KEY]: profiles });
          sendResponse({ type: 'REFRESH_PROFILES', ok: true, profiles });
          break;
        }
        case 'CREATE_PROFILE': {
          const profile = await repo.createProfile(msg.payload.name);
          await chrome.storage.local.set({
            [PROFILES_INDEX_STORAGE_KEY]: await repo.refresh(),
          });
          sendResponse({ type: 'CREATE_PROFILE', ok: true, profile });
          break;
        }
        case 'CREATE_CATEGORY': {
          const category = await repo.createCategory(msg.payload.profileId, msg.payload.name);
          await chrome.storage.local.set({
            [PROFILES_INDEX_STORAGE_KEY]: await repo.refresh(),
          });
          sendResponse({ type: 'CREATE_CATEGORY', ok: true, category });
          break;
        }
        case 'UPLOAD_RESUME': {
          const file = payloadToFile(msg.payload);
          const resume = await repo.uploadResume(msg.payload.categoryId, file);
          await chrome.storage.local.set({
            [PROFILES_INDEX_STORAGE_KEY]: await repo.refresh(),
          });
          sendResponse({ type: 'UPLOAD_RESUME', ok: true, resume });
          break;
        }
        case 'DELETE_RESUME': {
          await repo.deleteResume(msg.payload.categoryId, msg.payload.resumeId);
          await chrome.storage.local.set({
            [PROFILES_INDEX_STORAGE_KEY]: await repo.refresh(),
          });
          sendResponse({ type: 'DELETE_RESUME', ok: true });
          break;
        }
        case 'SET_DEFAULT_RESUME': {
          await repo.setDefaultResume(msg.payload.categoryId, msg.payload.resumeId);
          await chrome.storage.local.set({
            [PROFILES_INDEX_STORAGE_KEY]: await repo.refresh(),
          });
          sendResponse({ type: 'SET_DEFAULT_RESUME', ok: true });
          break;
        }
        case 'UPDATE_DESCRIPTION': {
          await repo.updateDescription(msg.payload.categoryId, msg.payload.body);
          await chrome.storage.local.set({
            [PROFILES_INDEX_STORAGE_KEY]: await repo.refresh(),
          });
          sendResponse({ type: 'UPDATE_DESCRIPTION', ok: true });
          break;
        }
        case 'UPDATE_TEMPLATE': {
          await repo.updateTemplate(msg.payload.categoryId, msg.payload.body);
          await chrome.storage.local.set({
            [PROFILES_INDEX_STORAGE_KEY]: await repo.refresh(),
          });
          sendResponse({ type: 'UPDATE_TEMPLATE', ok: true });
          break;
        }
        case 'QUEUE_SEND': {
          await queue.hydrate();
          const job = queue.enqueue({
            to: msg.payload.to,
            subject: msg.payload.subject,
            bodyText: msg.payload.bodyText,
            ...(msg.payload.bodyHtml !== undefined ? { bodyHtml: msg.payload.bodyHtml } : {}),
            profileName: msg.payload.profileName,
            categoryName: msg.payload.categoryName,
            resumeName: msg.payload.resumeName ?? null,
            attachments: msg.payload.attachments ?? [],
            sourceUrl: msg.payload.sourceUrl ?? null,
          });
          sendResponse({ type: 'QUEUE_SEND', ok: true, jobId: job.id });
          break;
        }
        case 'GET_QUEUE_STATUS': {
          await queue.hydrate();
          sendResponse({ type: 'GET_QUEUE_STATUS', ok: true, jobs: queue.jobs });
          break;
        }
        case 'GET_LAST_SENT': {
          const latest = await readLatestSentEntry();
          sendResponse({
            type: 'GET_LAST_SENT',
            ok: true,
            sent: latest
              ? { subject: latest.subject, sentAt: latest.sentAt }
              : null,
          });
          break;
        }
        case 'LIST_PROFILES_FOR_SEND': {
          const cached = await chrome.storage.local.get('profiles.index');
          const profiles = (cached['profiles.index'] as import('@/lib/types').ProfileIndex | undefined) ?? null;
          sendResponse({ type: 'LIST_PROFILES_FOR_SEND', ok: true, profiles });
          break;
        }
      }
    } catch (e) {
      sendResponse({ type: 'ERROR', message: e instanceof Error ? e.message : String(e) });
    }
  })();
  return true;
});
