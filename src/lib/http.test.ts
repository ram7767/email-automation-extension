import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpError, QuotaError } from './http';

vi.mock('./auth', () => ({
  getAccessToken: vi.fn(async () => 'tok'),
  signOut: vi.fn(async () => undefined),
}));

const okJson = (body: unknown, etag = 'W/"1"') =>
  new Response(JSON.stringify(body), { status: 200, headers: { ETag: etag, 'Content-Type': 'application/json' } });

describe('http', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('attaches Authorization header and returns parsed JSON + ETag', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({ ok: true }));
    const r = await http<{ ok: boolean }>('https://www.googleapis.com/x');
    expect(r.value.ok).toBe(true);
    expect(r.etag).toBe('W/"1"');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('rejects calls to non-allowlisted hosts', async () => {
    await expect(http('https://evil.example.com/data')).rejects.toThrow(/blocked/);
  });

  it('forwards If-Match header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({}));
    await http('https://www.googleapis.com/y', { method: 'PATCH', ifMatch: 'W/"e"' });
    const headers = new Headers((fetchSpy.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get('If-Match')).toBe('W/"e"');
  });

  it('throws HttpError(412) on precondition failure (no retry)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('conflict', { status: 412 }));
    await expect(http('https://www.googleapis.com/y', { method: 'PATCH' })).rejects.toBeInstanceOf(HttpError);
  });

  it('retries on 5xx then succeeds', async () => {
    const seq = [
      new Response('boom', { status: 500 }),
      new Response('boom', { status: 500 }),
      okJson({ ok: true }),
    ];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => seq.shift()!);
    const r = await http<{ ok: boolean }>('https://www.googleapis.com/y');
    expect(r.value.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('surfaces QuotaError after exhausting retries on 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('rate', { status: 429 }));
    await expect(http('https://www.googleapis.com/y')).rejects.toBeInstanceOf(QuotaError);
  });
});
