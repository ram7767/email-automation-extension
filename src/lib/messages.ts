import type { Category, Profile, ProfileIndex, Resume } from './types';

export interface UploadResumePayload {
  categoryId: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

export type Msg =
  | { type: 'PING' }
  | { type: 'BOOT_AUTH' }
  | { type: 'SIGN_IN' }
  | { type: 'SIGN_OUT' }
  | { type: 'BOOTSTRAP_DRIVE' }
  | { type: 'REFRESH_PROFILES' }
  | { type: 'CREATE_PROFILE'; payload: { name: string } }
  | { type: 'CREATE_CATEGORY'; payload: { profileId: string; name: string } }
  | { type: 'UPLOAD_RESUME'; payload: UploadResumePayload }
  | { type: 'DELETE_RESUME'; payload: { categoryId: string; resumeId: string } }
  | { type: 'SET_DEFAULT_RESUME'; payload: { categoryId: string; resumeId: string } }
  | { type: 'UPDATE_DESCRIPTION'; payload: { categoryId: string; body: string } }
  | { type: 'UPDATE_TEMPLATE'; payload: { categoryId: string; body: string } };

export type Reply =
  | { type: 'PING'; ok: true; ts: number }
  | { type: 'BOOT_AUTH'; status: 'signed-in' | 'signed-out' }
  | { type: 'SIGN_IN'; ok: boolean }
  | { type: 'SIGN_OUT'; ok: boolean }
  | { type: 'BOOTSTRAP_DRIVE'; ok: true; rootFolderId: string; profiles: ProfileIndex }
  | { type: 'REFRESH_PROFILES'; ok: true; profiles: ProfileIndex }
  | { type: 'CREATE_PROFILE'; ok: true; profile: Profile }
  | { type: 'CREATE_CATEGORY'; ok: true; category: Category }
  | { type: 'UPLOAD_RESUME'; ok: true; resume: Resume }
  | { type: 'DELETE_RESUME'; ok: true }
  | { type: 'SET_DEFAULT_RESUME'; ok: true }
  | { type: 'UPDATE_DESCRIPTION'; ok: true }
  | { type: 'UPDATE_TEMPLATE'; ok: true }
  | { type: 'ERROR'; message: string };

export async function send<M extends Msg>(msg: M): Promise<Reply> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (reply: Reply | undefined) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!reply) return reject(new Error('no reply'));
      resolve(reply);
    });
  });
}
