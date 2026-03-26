export type MailFolder = {
  id: string;
  label: string;
  count: number;
  unreadCount?: number;
};

export type MailItem = {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  timestamp: string;
  unread?: boolean;
  starred?: boolean;
};

export type MailAttachment = {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type MailMessageDetail = {
  id: string;
  sender: string;
  /** All To recipients (full "Name <email>" format when available). */
  to?: string[];
  /** CC recipients. */
  cc?: string[];
  subject: string;
  timestamp: string;
  body: string[];
  /** Sanitized HTML body, if the message contains an HTML part. */
  bodyHtml?: string;
  /** Attachment metadata list. */
  attachments?: MailAttachment[];
  /** Inline image parts (multipart/related CID references). */
  inlineParts?: Array<{ cid: string; partId: string; mimeType: string }>;
};

export type MailboxSnapshot = {
  folders: MailFolder[];
  messages: MailItem[];
  meta?: {
    folder?: string;
    page?: number;
    pageSize?: number;
    query?: string;
    totalResults?: number;
    hasNextPage?: boolean;
  };
};
