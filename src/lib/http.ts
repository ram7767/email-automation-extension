import { getAccessToken, signOut } from './auth';

const ALLOWED_HOSTS = new Set([
  'www.googleapis.com',
  'oauth2.googleapis.com',
  'accounts.google.com',
]);

export class HttpError extends Error {
  constructor(public status: number, public body: string, public retryable: boolean) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
  }
}

export class QuotaError extends HttpError {
  constructor(body: string) {
    super(403, body, true);
    this.name = 'QuotaError';
  }
}

interface RequestOpts extends RequestInit {
  query?: Record<string, string | number | undefined>;
  ifMatch?: string;
}

const MAX_RETRIES = 4;
const BACKOFFS_MS = [500, 1000, 2000, 4000];

function buildUrl(url: string, query?: RequestOpts['query']): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

function assertHostAllowed(url: string): void {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`http: blocked outbound to ${host}`);
  }
}

async function authedFetch(url: string, init: RequestInit, attempt: number): Promise<Response> {
  const token = await getAccessToken(false);
  if (!token) throw new HttpError(401, 'no token', false);

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && attempt === 0) {
    await signOut();
    const retryToken = await getAccessToken(true);
    if (!retryToken) throw new HttpError(401, 'reauth failed', false);
    headers.set('Authorization', `Bearer ${retryToken}`);
    return fetch(url, { ...init, headers });
  }
  return res;
}

export async function http<T>(url: string, opts: RequestOpts = {}): Promise<{ value: T; etag: string | null }> {
  const fullUrl = buildUrl(url, opts.query);
  assertHostAllowed(fullUrl);

  const headers = new Headers(opts.headers);
  if (opts.ifMatch) headers.set('If-Match', opts.ifMatch);

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await authedFetch(fullUrl, { ...opts, headers }, attempt);
    if (res.ok) {
      const etag = res.headers.get('ETag');
      const text = await res.text();
      const value = text ? (JSON.parse(text) as T) : (undefined as T);
      return { value, etag };
    }

    const body = await res.text();
    if (res.status === 412) throw new HttpError(412, body, false);
    if (res.status === 404) throw new HttpError(404, body, false);
    if (res.status === 429 || (res.status === 403 && /quota|rateLimit/i.test(body))) {
      if (attempt === MAX_RETRIES - 1) throw new QuotaError(body);
    } else if (res.status >= 500 && res.status < 600) {
      // retry
    } else {
      throw new HttpError(res.status, body, false);
    }
    lastErr = new HttpError(res.status, body, true);
    await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt] ?? 4000));
  }
  throw lastErr ?? new HttpError(500, 'unreachable', false);
}
