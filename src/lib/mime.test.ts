import { describe, it, expect } from 'vitest';
import {
  base64UrlEncode,
  buildMime,
  encodeRfc2047,
  wrapBase64,
} from './mime';

const CRLF = '\r\n';

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function extractBoundary(text: string, header: 'mixed' | 'alternative'): string {
  const re = new RegExp(`Content-Type: multipart/${header}; boundary="([^"]+)"`);
  const m = re.exec(text);
  if (!m) throw new Error(`no boundary found for ${header}`);
  return m[1]!;
}

describe('encodeRfc2047', () => {
  it('passes ASCII through untouched', () => {
    expect(encodeRfc2047('Hello world')).toBe('Hello world');
  });

  it('encoded-words non-ASCII subjects', () => {
    const out = encodeRfc2047('résumé');
    expect(out.startsWith('=?UTF-8?B?')).toBe(true);
    expect(out.endsWith('?=')).toBe(true);
  });

  it('round-trips the encoded value back to the original via base64', () => {
    const out = encodeRfc2047('日本語のタイトル');
    const inner = out.slice('=?UTF-8?B?'.length, -2);
    const restored = new TextDecoder().decode(
      Uint8Array.from(atob(inner), (c) => c.charCodeAt(0)),
    );
    expect(restored).toBe('日本語のタイトル');
  });
});

describe('wrapBase64', () => {
  it('breaks long base64 strings every 76 chars with CRLF', () => {
    const text = 'A'.repeat(200);
    const wrapped = wrapBase64(text, 76);
    const lines = wrapped.split(CRLF);
    expect(lines.length).toBe(3);
    expect(lines[0]!.length).toBe(76);
    expect(lines[1]!.length).toBe(76);
    expect(lines[2]!.length).toBe(48);
  });

  it('returns the input untouched if already shorter than width', () => {
    expect(wrapBase64('short', 76)).toBe('short');
  });
});

describe('base64UrlEncode', () => {
  it('uses URL-safe alphabet and strips padding', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xff]);
    const out = base64UrlEncode(bytes);
    expect(out).not.toMatch(/[+/=]/);
    expect(out).toBe('-///'.replace(/\//g, '_'));
  });

  it('round-trips a known buffer', () => {
    const input = new TextEncoder().encode('hello world');
    const out = base64UrlEncode(input);
    // base64url of 'hello world' (no padding) is 'aGVsbG8gd29ybGQ'
    expect(out).toBe('aGVsbG8gd29ybGQ');
  });
});

describe('buildMime', () => {
  it('produces RFC-conformant headers for a plain text message', () => {
    const out = buildMime({
      to: 'jane@example.com',
      subject: 'Hello',
      bodyText: 'Hi Jane,',
      attachments: [],
    });
    const text = decode(out);
    expect(text.startsWith('MIME-Version: 1.0' + CRLF)).toBe(true);
    expect(text).toContain('To: jane@example.com');
    expect(text).toContain('Subject: Hello');
    expect(text).toContain('Hi Jane,');
    expect(text).toContain('Content-Type: multipart/alternative');
    expect(text).not.toContain('multipart/mixed');
  });

  it('encodes non-ASCII subjects with RFC 2047', () => {
    const out = buildMime({
      to: 'a@b.com',
      subject: 'Café résumé',
      bodyText: 'body',
      attachments: [],
    });
    const text = decode(out);
    expect(text).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  });

  it('uses CRLF line endings exclusively', () => {
    const out = buildMime({
      to: 'a@b.com',
      subject: 'CRLF',
      bodyText: 'line1\nline2',
      attachments: [],
    });
    const text = decode(out);
    // headers must be CRLF
    expect(/MIME-Version: 1\.0\r\n/.test(text)).toBe(true);
    // every \n in the headers must be preceded by \r
    const headerEnd = text.indexOf('\r\n\r\n');
    const headers = text.slice(0, headerEnd);
    expect(/[^\r]\n/.test(headers)).toBe(false);
  });

  it('wraps the html part inside multipart/alternative when bodyHtml provided', () => {
    const out = buildMime({
      to: 'a@b.com',
      subject: 's',
      bodyText: 'plain',
      bodyHtml: '<p>html</p>',
      attachments: [],
    });
    const text = decode(out);
    const altBoundary = extractBoundary(text, 'alternative');
    expect(text).toContain(`--${altBoundary}`);
    expect(text).toContain('Content-Type: text/plain');
    expect(text).toContain('Content-Type: text/html');
    expect(text).toContain('<p>html</p>');
  });

  it('emits multipart/mixed when attachments are present', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const out = buildMime({
      to: 'a@b.com',
      subject: 's',
      bodyText: 'plain',
      attachments: [{ name: 'r.pdf', mimeType: 'application/pdf', bytes }],
    });
    const text = decode(out);
    expect(text).toContain('multipart/mixed');
    const mixed = extractBoundary(text, 'mixed');
    const alt = extractBoundary(text, 'alternative');
    expect(text).toContain(`--${mixed}`);
    expect(text).toContain(`--${alt}`);
    expect(text).toContain('Content-Disposition: attachment; filename="r.pdf"');
    expect(text).toContain('Content-Transfer-Encoding: base64');
    // attachment must terminate with the closing mixed boundary
    expect(text).toContain(`--${mixed}--`);
  });

  it('wraps base64 attachment bodies at 76 chars per line', () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const out = buildMime({
      to: 'a@b.com',
      subject: 's',
      bodyText: 'b',
      attachments: [{ name: 'big.bin', mimeType: 'application/octet-stream', bytes }],
    });
    const text = decode(out);
    // Find the base64 block: between the attachment header blank line and the next boundary.
    const startMarker = 'Content-Disposition: attachment; filename="big.bin"\r\n\r\n';
    const start = text.indexOf(startMarker) + startMarker.length;
    const end = text.indexOf('\r\n--', start);
    const block = text.slice(start, end).trimEnd();
    const lines = block.split(CRLF);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
    expect(lines.length).toBeGreaterThan(1);
  });

  it('handles attachments larger than 1MB without runtime errors', () => {
    const big = new Uint8Array(1024 * 1024 + 7);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31) % 256;
    const out = buildMime({
      to: 'a@b.com',
      subject: 's',
      bodyText: 'b',
      attachments: [{ name: 'big.bin', mimeType: 'application/octet-stream', bytes: big }],
    });
    expect(out.length).toBeGreaterThan(big.length); // base64 expansion ≥ original
    const text = decode(out);
    expect(text).toContain('Content-Transfer-Encoding: base64');
  });

  it('encoded attachment filename when name is non-ASCII', () => {
    const out = buildMime({
      to: 'a@b.com',
      subject: 's',
      bodyText: 'b',
      attachments: [
        { name: 'résumé.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1]) },
      ],
    });
    const text = decode(out);
    expect(text).toMatch(/filename="=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?="/);
  });

  it('is base64url-encodable (round-trips through decoder)', () => {
    const out = buildMime({
      to: 'a@b.com',
      subject: 'rt',
      bodyText: 'rt',
      attachments: [],
    });
    const encoded = base64UrlEncode(out);
    expect(encoded).not.toMatch(/[+/=]/);
    // Decode back: pad with '=' to multiple of 4, replace - and _
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const back = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const restored = Uint8Array.from(back, (c) => c.charCodeAt(0));
    expect(restored.length).toBe(out.length);
  });
});
