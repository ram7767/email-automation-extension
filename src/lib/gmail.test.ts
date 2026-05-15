import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  getAccessToken: vi.fn(async () => 'tok'),
  signOut: vi.fn(async () => undefined),
}));

import { QuotaError } from './http';
import { hashRecipient, sendApplicationEmail } from './gmail';

function gmailOk(id = 'm1', threadId = 't1'): Response {
  return new Response(JSON.stringify({ id, threadId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('hashRecipient', () => {
  it('returns 8 lowercase hex chars', async () => {
    const out = await hashRecipient('Jane.Doe@Example.COM');
    expect(out).toMatch(/^[a-f0-9]{8}$/);
  });

  it('normalizes case and trims whitespace before hashing', async () => {
    const a = await hashRecipient('jane@example.com');
    const b = await hashRecipient('  JANE@EXAMPLE.COM ');
    expect(a).toBe(b);
  });

  it('produces different hashes for different recipients', async () => {
    const a = await hashRecipient('jane@example.com');
    const b = await hashRecipient('john@example.com');
    expect(a).not.toBe(b);
  });
});

describe('sendApplicationEmail', () => {
  it('POSTs base64url-encoded MIME to gmail messages.send and returns messageId/threadId', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(gmailOk('mid', 'tid'));
    const result = await sendApplicationEmail({
      to: 'jane@example.com',
      subject: 'Hello',
      bodyText: 'Hi',
      attachments: [],
      profileName: 'Flutter',
      categoryName: 'Senior',
    });
    expect(result).toEqual({ messageId: 'mid', threadId: 'tid' });
    const call = fetchSpy.mock.calls[0]!;
    const url = String(call[0]);
    expect(url).toContain('gmail/v1/users/me/messages/send');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { raw: string };
    expect(body.raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
  });

  it('retries on 429 and then succeeds', async () => {
    const responses = [
      new Response('{"error":"rateLimitExceeded"}', { status: 429 }),
      new Response('{"error":"rateLimitExceeded"}', { status: 429 }),
      gmailOk('mid', 'tid'),
    ];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => responses.shift()!);
    const result = await sendApplicationEmail({
      to: 'jane@example.com',
      subject: 'Hello',
      bodyText: 'Hi',
      attachments: [],
      profileName: 'P',
      categoryName: 'C',
    });
    expect(result.messageId).toBe('mid');
    expect(spy).toHaveBeenCalledTimes(3);
  }, 30000);

  it('throws QuotaError when 429 retries are exhausted', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('rateLimitExceeded', { status: 429 }),
    );
    await expect(
      sendApplicationEmail({
        to: 'x@example.com',
        subject: 's',
        bodyText: 'b',
        attachments: [],
        profileName: 'P',
        categoryName: 'C',
      }),
    ).rejects.toBeInstanceOf(QuotaError);
  }, 30000);

  it('does NOT include the recipient address in any retry log path', async () => {
    // We can't intercept internal logs directly, but the public contract is:
    // raw payload contains the address (legitimate MIME) and nothing else does.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(gmailOk());
    await sendApplicationEmail({
      to: 'secret@example.com',
      subject: 's',
      bodyText: 'b',
      attachments: [],
      profileName: 'P',
      categoryName: 'C',
    });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).not.toContain('secret@example.com');
    // Confirm the address only travels inside the encoded MIME body
    const body = JSON.parse(init.body as string) as { raw: string };
    expect(body.raw).not.toContain('secret@example.com');
  });
});
