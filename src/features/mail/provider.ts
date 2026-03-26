import type { MailboxSnapshot, MailMessageDetail } from "../../lib/mail-types";

export type MailboxQuery = {
  folderId?: string;
  page?: number;
  query?: string;
  refreshToken?: number;
};

export type SendPayload = {
  to: string;
  subject: string;
  body: string;
  replyToId?: string;
  forwardOfId?: string;
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
};
