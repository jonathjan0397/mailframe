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

export type MailMessageDetail = {
  id: string;
  sender: string;
  subject: string;
  timestamp: string;
  body: string[];
  /** Sanitized HTML body, if the message contains an HTML part. */
  bodyHtml?: string;
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
