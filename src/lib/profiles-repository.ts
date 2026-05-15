import * as drive from './drive';
import { profiles$ } from './state';
import type { Category, Profile, ProfileIndex, Resume } from './types';

type Task<T> = () => Promise<T>;

let chain: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: Task<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.catch(() => undefined);
  return next;
}

async function syncSignal(): Promise<ProfileIndex> {
  const fresh = await drive.refreshProfilesIndex();
  profiles$.value = fresh;
  return fresh;
}

export async function bootstrap(): Promise<ProfileIndex> {
  return enqueue(async () => {
    const r = await drive.ensureRoot();
    profiles$.value = r.profilesIndex;
    return r.profilesIndex;
  });
}

export async function refresh(): Promise<ProfileIndex> {
  return enqueue(syncSignal);
}

export async function createProfile(name: string): Promise<Profile> {
  return enqueue(async () => {
    const profile = await drive.createProfile(name);
    await syncSignal();
    return profile;
  });
}

export async function createCategory(profileId: string, name: string): Promise<Category> {
  return enqueue(async () => {
    const category = await drive.createCategory(profileId, name);
    await syncSignal();
    return category;
  });
}

export async function uploadResume(categoryId: string, file: File): Promise<Resume> {
  return enqueue(async () => {
    const resume = await drive.uploadResume(categoryId, file);
    await syncSignal();
    return resume;
  });
}

export async function deleteResume(categoryId: string, resumeId: string): Promise<void> {
  return enqueue(async () => {
    await drive.deleteResume(categoryId, resumeId);
    await syncSignal();
  });
}

export async function setDefaultResume(
  categoryId: string,
  resumeId: string,
): Promise<void> {
  return enqueue(async () => {
    await drive.setDefaultResume(categoryId, resumeId);
    await syncSignal();
  });
}

export async function updateDescription(categoryId: string, body: string): Promise<void> {
  return enqueue(async () => {
    await drive.updateDescription(categoryId, body);
    await syncSignal();
  });
}

export async function updateTemplate(categoryId: string, body: string): Promise<void> {
  return enqueue(async () => {
    await drive.updateTemplate(categoryId, body);
    await syncSignal();
  });
}

export function _resetQueueForTests(): void {
  chain = Promise.resolve();
}
