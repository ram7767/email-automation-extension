import { beforeEach, describe, expect, it, vi } from 'vitest';
import { send } from './messages';

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime as unknown as { lastError: undefined | { message: string } }).lastError = undefined;
});

describe('send', () => {
  it('forwards the message and resolves with the reply', async () => {
    (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, cb: (r: unknown) => void) => cb({ type: 'PING', ok: true, ts: 1 }),
    );
    const reply = await send({ type: 'PING' });
    expect(reply).toEqual({ type: 'PING', ok: true, ts: 1 });
  });

  it('rejects when chrome.runtime.lastError is set', async () => {
    (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, cb: (r: unknown) => void) => {
        (chrome.runtime as unknown as { lastError: { message: string } }).lastError = {
          message: 'ext gone',
        };
        cb(undefined);
      },
    );
    await expect(send({ type: 'PING' })).rejects.toThrow(/ext gone/);
  });

  it('rejects when no reply is returned', async () => {
    (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, cb: (r: unknown) => void) => cb(undefined),
    );
    await expect(send({ type: 'PING' })).rejects.toThrow(/no reply/);
  });
});
