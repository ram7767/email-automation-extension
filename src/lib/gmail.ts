import { http } from './http';
import { base64UrlEncode, buildMime, type MimeAttachment } from './mime';

export interface SendApplicationEmailRequest {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: MimeAttachment[];
  profileName: string;
  categoryName: string;
  sourceUrl?: string;
}

export interface SendApplicationEmailResult {
  messageId: string;
  threadId: string;
}

interface GmailSendResponse {
  id: string;
  threadId: string;
}

const GMAIL_SEND_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';

export async function hashRecipient(recipient: string): Promise<string> {
  const normalized = recipient.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 4; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

export async function sendApplicationEmail(
  req: SendApplicationEmailRequest,
): Promise<SendApplicationEmailResult> {
  const mime = buildMime({
    to: req.to,
    subject: req.subject,
    bodyText: req.bodyText,
    ...(req.bodyHtml !== undefined ? { bodyHtml: req.bodyHtml } : {}),
    attachments: req.attachments,
  });
  const raw = base64UrlEncode(mime);
  const { value } = await http<GmailSendResponse>(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  return { messageId: value.id, threadId: value.threadId };
}
