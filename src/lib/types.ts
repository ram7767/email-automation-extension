export interface Resume {
  id: string;
  name: string;
  fileId: string;
  uploadedAt: string;
  sizeBytes: number;
  mimeType?: string;
}

export interface Category {
  id: string;
  name: string;
  fileId: string;
  createdAt: string;
  defaultResumeId: string | null;
  descriptionFileId: string | null;
  templateFileId: string | null;
  resumes: Resume[];
}

export interface Profile {
  id: string;
  name: string;
  fileId: string;
  createdAt: string;
  icon?: string;
  categories: Category[];
}

export interface ProfileIndex {
  schemaVersion: 1;
  rootFolderId: string;
  updatedAt: string;
  updatedBy?: 'extension' | 'flutter-app';
  profiles: Profile[];
}

export interface SendJobAttachment {
  name: string;
  mimeType: string;
  bytesBase64: string;
}

export interface SendJob {
  id: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  profileName: string;
  categoryName: string;
  resumeName: string | null;
  attachments: SendJobAttachment[];
  sourceUrl?: string | null;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
}
