import type { ProfileIndex } from './types';

export type Msg =
  | { type: 'PING' }
  | { type: 'BOOT_AUTH' }
  | { type: 'SIGN_IN' }
  | { type: 'SIGN_OUT' }
  | { type: 'BOOTSTRAP_DRIVE' };

export type Reply =
  | { type: 'PING'; ok: true; ts: number }
  | { type: 'BOOT_AUTH'; status: 'signed-in' | 'signed-out' }
  | { type: 'SIGN_IN'; ok: boolean }
  | { type: 'SIGN_OUT'; ok: boolean }
  | { type: 'BOOTSTRAP_DRIVE'; ok: true; rootFolderId: string; profiles: ProfileIndex }
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
