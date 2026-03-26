import type { MailboxSnapshot, MailMessageDetail } from "../../lib/mail-types";

export type MailboxQuery = {
  folderId?: string;
  page?: number;
  query?: string;
  refreshToken?: number;
};

export type AttachmentPayload = {
  filename: string;
  mimeType: string;
  /** Base64-encoded file content. */
  data: string;
};

export type SendPayload = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  /** Plain-text body (always present as fallback). */
  body: string;
  /** HTML body; when present the server sends multipart/alternative. */
  bodyHtml?: string;
  replyToId?: string;
  forwardOfId?: string;
  attachments?: AttachmentPayload[];
};

/**
 * Provider contract. Any backend that implements this interface
 * can power the frontend. Read methods are required. Write methods
 * are optional — the UI disables actions the provider does not support.
 */
export type MailProvider = {
  // Read
  getMailboxSnapshot: (query?: MailboxQuery) => Promise<MailboxSnapshot>;
  getMessageDetail: (messageId: string) => Promise<MailMessageDetail>;

  // Write (optional)
  moveMessages?: (messageIds: string[], targetFolderId: string) => Promise<void>;
  deleteMessages?: (messageIds: string[]) => Promise<void>;
  markRead?: (messageIds: string[], read: boolean) => Promise<void>;
  toggleStar?: (messageId: string, starred: boolean) => Promise<void>;
  sendMessage?: (payload: SendPayload) => Promise<void>;
  /** Empty all messages from a folder (e.g., Trash). */
  emptyFolder?: (folderId: string) => Promise<void>;
  /** Fetch a message attachment as base64. */
  getAttachment?: (messageId: string, partId: string) => Promise<{ data: string; filename: string; mimeType: string }>;
  /** Create a new folder. */
  createFolder?: (name: string) => Promise<void>;
  /** Delete a folder. */
  deleteFolder?: (folderId: string) => Promise<void>;
  /** Load persisted user settings from the server. */
  getSettings?: () => Promise<Record<string, unknown>>;
  /** Persist user settings to the server (merged server-side). */
  saveSettings?: (data: Record<string, unknown>) => Promise<void>;
};
