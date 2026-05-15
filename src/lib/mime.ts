const CRLF = '\r\n';

export interface MimeAttachment {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface MimeRequest {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: MimeAttachment[];
}

const ASCII_MAX = 0x7e;

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > ASCII_MAX) return false;
  }
  return true;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function wrapBase64(b64: string, width = 76): string {
  if (width <= 0) return b64;
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += width) {
    lines.push(b64.slice(i, Math.min(i + width, b64.length)));
  }
  return lines.join(CRLF);
}

export function encodeRfc2047(text: string): string {
  if (isAscii(text)) return text;
  const utf8 = new TextEncoder().encode(text);
  return `=?UTF-8?B?${bytesToBase64(utf8)}?=`;
}

function randomBoundary(prefix: string): string {
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `=_${prefix}_${rand}`;
}

function makeBuilder(): {
  push: (chunk: string) => void;
  pushRaw: (chunk: string) => void;
  build: () => Uint8Array;
} {
  const parts: string[] = [];
  return {
    push(chunk: string) {
      parts.push(chunk + CRLF);
    },
    pushRaw(chunk: string) {
      parts.push(chunk);
    },
    build() {
      const joined = parts.join('');
      return new TextEncoder().encode(joined);
    },
  };
}

function appendAlternativePart(
  b: ReturnType<typeof makeBuilder>,
  altBoundary: string,
  bodyText: string,
  bodyHtml: string | undefined,
): void {
  b.push(`--${altBoundary}`);
  b.push('Content-Type: text/plain; charset="UTF-8"');
  b.push('Content-Transfer-Encoding: 8bit');
  b.push('');
  b.push(bodyText);

  if (bodyHtml !== undefined) {
    b.push(`--${altBoundary}`);
    b.push('Content-Type: text/html; charset="UTF-8"');
    b.push('Content-Transfer-Encoding: 8bit');
    b.push('');
    b.push(bodyHtml);
  }
  b.push(`--${altBoundary}--`);
}

function appendAttachmentPart(
  b: ReturnType<typeof makeBuilder>,
  mixedBoundary: string,
  attachment: MimeAttachment,
): void {
  const safeName = encodeRfc2047(attachment.name);
  const wrapped = wrapBase64(bytesToBase64(attachment.bytes));
  b.push(`--${mixedBoundary}`);
  b.push(`Content-Type: ${attachment.mimeType}; name="${safeName}"`);
  b.push('Content-Transfer-Encoding: base64');
  b.push(`Content-Disposition: attachment; filename="${safeName}"`);
  b.push('');
  b.pushRaw(wrapped + CRLF);
}

export function buildMime(req: MimeRequest): Uint8Array {
  const mixedBoundary = randomBoundary('mixed');
  const altBoundary = randomBoundary('alt');
  const b = makeBuilder();

  b.push('MIME-Version: 1.0');
  b.push(`To: ${req.to}`);
  b.push(`Subject: ${encodeRfc2047(req.subject)}`);

  const hasAttachments = req.attachments.length > 0;
  if (hasAttachments) {
    b.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    b.push('');
    b.push(`--${mixedBoundary}`);
    b.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    b.push('');
    appendAlternativePart(b, altBoundary, req.bodyText, req.bodyHtml);
    for (const att of req.attachments) {
      appendAttachmentPart(b, mixedBoundary, att);
    }
    b.push(`--${mixedBoundary}--`);
  } else {
    b.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    b.push('');
    appendAlternativePart(b, altBoundary, req.bodyText, req.bodyHtml);
  }
  return b.build();
}
