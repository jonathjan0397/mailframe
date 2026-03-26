import { ImapFlow } from "imapflow";
import { encodeMessageId } from "./encode.js";

const PAGE_SIZE = 25;

function buildClient(): ImapFlow {
  return new ImapFlow({
    host: process.env.IMAP_HOST ?? "",
    port: parseInt(process.env.IMAP_PORT ?? "993", 10),
    secure: process.env.IMAP_SECURE !== "false",
    auth: {
      user: process.env.IMAP_USER ?? "",
      pass: process.env.IMAP_PASS ?? "",
    },
    logger: false,
  });
}

function formatTimestamp(date: Date | undefined): string {
  if (!date) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameDay) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameYear) return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/** Display name only — used in message list rows. */
function formatSender(address: { name?: string; address?: string } | undefined): string {
  if (!address) return "Unknown";
  if (address.name) return address.name;
  return address.address ?? "Unknown";
}

/** Full "Name <email>" format — used in detail view and reply-to. */
function formatAddress(address: { name?: string; address?: string } | undefined): string {
  if (!address) return "Unknown";
  if (address.name && address.address) return `${address.name} <${address.address}>`;
  return address.address ?? address.name ?? "Unknown";
}

function folderLabel(name: string): string {
  const map: Record<string, string> = {
    INBOX: "Inbox", Sent: "Sent", "Sent Items": "Sent", Drafts: "Drafts",
    Trash: "Trash", Junk: "Spam", Spam: "Spam", Archive: "Archive",
  };
  if (map[name]) return map[name];
  const parts = name.split(/[./]/);
  return parts[parts.length - 1]
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkForAttachments(node: any, result: Array<{ partId: string; filename: string; mimeType: string; size: number }>): void {
  if (!node) return;
  if (node.childNodes?.length) {
    for (const child of node.childNodes) walkForAttachments(child, result);
    return;
  }
  const disp = (node.disposition?.type ?? "").toLowerCase();
  const filename =
    node.disposition?.parameters?.get?.("filename") ??
    node.parameters?.get?.("name") ??
    node.parameters?.get?.("filename");
  if (filename && (disp === "attachment" || disp === "inline")) {
    result.push({
      partId: node.part ?? "1",
      filename,
      mimeType: (node.type ?? "application/octet-stream").toLowerCase(),
      size: node.size ?? 0,
    });
  }
}

export async function getFolders() {
  const client = buildClient();
  await client.connect();
  try {
    const list = await client.list();
    const folders = await Promise.all(
      list
        .filter((f) => !f.flags.has("\\Noselect"))
        .map(async (f) => {
          const status = await client.status(f.path, { messages: true, unseen: true });
          return {
            id: f.path,
            label: folderLabel(f.path),
            count: status.messages ?? 0,
            unreadCount: status.unseen ?? 0,
          };
        })
    );
    return folders;
  } finally {
    await client.logout();
  }
}

type SearchFilters = {
  text: string;
  from?: string;
  subject?: string;
  unreadOnly: boolean;
  starredOnly: boolean;
};

function parseSearchFilters(q: string): SearchFilters {
  let text = q;
  let from: string | undefined;
  let subject: string | undefined;
  let unreadOnly = false;
  let starredOnly = false;
  text = text.replace(/\bfrom:(\S+)/gi, (_, v) => { from = v.toLowerCase(); return ""; });
  text = text.replace(/\bsubject:(\S+)/gi, (_, v) => { subject = v.toLowerCase(); return ""; });
  text = text.replace(/\bis:unread\b/gi, () => { unreadOnly = true; return ""; });
  text = text.replace(/\bis:starred\b/gi, () => { starredOnly = true; return ""; });
  return { text: text.trim(), from, subject, unreadOnly, starredOnly };
}

function extractPreview(bodyParts: Map<string, Buffer> | undefined): string {
  if (!bodyParts) return "";
  for (const [, content] of bodyParts) {
    const raw = content.toString("utf8", 0, Math.min(content.length, 1000)).trim();
    if (!raw) continue;
    const lower = raw.slice(0, 100).toLowerCase();
    const looksHtml = lower.includes("<!doctype") || lower.includes("<html") ||
                      lower.includes("<body");
    if (looksHtml) return "(HTML email)";
    return raw.replace(/\s+/g, " ").slice(0, 120);
  }
  return "";
}

export async function getMailbox(mailbox: string, page: number, query: string) {
  const client = buildClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const status = await client.status(mailbox, { messages: true, unseen: true });
      const total = status.messages ?? 0;

      if (total === 0) {
        return { messages: [], total: 0, hasNextPage: false };
      }

      const filters = parseSearchFilters(query);

      // Fetch newest first — calculate UID range for page
      const start = Math.max(1, total - (page * PAGE_SIZE) + 1);
      const end = Math.max(1, total - ((page - 1) * PAGE_SIZE));
      const range = `${start}:${end}`;

      const messages: Array<{
        id: string; sender: string; subject: string;
        preview: string; timestamp: string; unread: boolean; starred: boolean;
      }> = [];

      for await (const msg of client.fetch(range, {
        uid: true, envelope: true, flags: true, bodyStructure: true,
        bodyParts: ["1", "1.1", "TEXT"],
      })) {
        const sender = formatSender(msg.envelope?.from?.[0]);
        const subject = msg.envelope?.subject ?? "(No subject)";
        const timestamp = formatTimestamp(msg.envelope?.date);
        const unread = !msg.flags?.has("\\Seen");
        const starred = msg.flags?.has("\\Flagged") ?? false;

        // Apply search filters
        if (filters.text) {
          const q = filters.text.toLowerCase();
          if (!sender.toLowerCase().includes(q) && !subject.toLowerCase().includes(q)) continue;
        }
        if (filters.from && !sender.toLowerCase().includes(filters.from)) continue;
        if (filters.subject && !subject.toLowerCase().includes(filters.subject)) continue;
        if (filters.unreadOnly && !unread) continue;
        if (filters.starredOnly && !starred) continue;

        const preview = extractPreview(msg.bodyParts) || "(No preview)";

        messages.push({
          id: encodeMessageId(msg.uid, mailbox),
          sender, subject, preview, timestamp, unread, starred,
        });
      }

      messages.reverse();
      const hasNextPage = start > 1;
      return { messages, total, hasNextPage };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function getMessage(uid: number, mailbox: string) {
  const client = buildClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      // Fetch common text and HTML MIME parts plus body structure
      const msg = await client.fetchOne(`${uid}`, {
        uid: true, envelope: true, flags: true,
        bodyParts: ["1", "1.1", "1.2", "2", "TEXT"],
        bodyStructure: true,
      }, { uid: true });

      if (!msg) throw new Error("Message not found.");

      // Mark as read
      await client.messageFlagsAdd(`${uid}`, ["\\Seen"], { uid: true });

      const sender = formatAddress(msg.envelope?.from?.[0]);
      const subject = msg.envelope?.subject ?? "(No subject)";
      const timestamp = formatTimestamp(msg.envelope?.date);
      const toAddresses = (msg.envelope?.to ?? []).map(formatAddress);
      const ccAddresses = (msg.envelope?.cc ?? []).map(formatAddress);

      // Separate HTML and plain-text parts
      let bodyText = "";
      let bodyHtml = "";
      for (const [, content] of msg.bodyParts ?? new Map()) {
        const raw = content.toString("utf8").trim();
        if (!raw) continue;
        const lower = raw.slice(0, 512).toLowerCase();
        const looksHtml = lower.includes("<!doctype") || lower.includes("<html") ||
                          lower.includes("<body") || lower.includes("<p>") ||
                          lower.includes("<div") || lower.includes("<table");
        if (looksHtml && !bodyHtml) {
          bodyHtml = raw;
        } else if (!looksHtml && !bodyText) {
          bodyText = raw;
        }
      }

      const paragraphs = bodyText.trim()
        ? bodyText.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)
        : bodyHtml ? [] : ["Message body could not be extracted."];

      // Collect attachment metadata from body structure
      const attachmentList: Array<{ partId: string; filename: string; mimeType: string; size: number }> = [];
      if (msg.bodyStructure) walkForAttachments(msg.bodyStructure, attachmentList);

      return {
        id: encodeMessageId(uid, mailbox),
        sender, subject, timestamp,
        to: toAddresses.length > 0 ? toAddresses : undefined,
        cc: ccAddresses.length > 0 ? ccAddresses : undefined,
        body: paragraphs,
        bodyHtml: bodyHtml || undefined,
        attachments: attachmentList.length > 0 ? attachmentList : undefined,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function getAttachment(uid: number, mailbox: string, partId: string) {
  const client = buildClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(`${uid}`, {
        uid: true,
        bodyParts: [partId],
        bodyStructure: true,
      }, { uid: true });

      if (!msg) throw new Error("Message not found.");
      const content = msg.bodyParts?.get(partId);
      if (!content) throw new Error(`Part ${partId} not found.`);

      let filename = "attachment";
      let mimeType = "application/octet-stream";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function findPart(node: any): boolean {
        if (node.part === partId) {
          mimeType = (node.type ?? mimeType).toLowerCase();
          filename =
            node.disposition?.parameters?.get?.("filename") ??
            node.parameters?.get?.("name") ??
            node.parameters?.get?.("filename") ??
            filename;
          return true;
        }
        return node.childNodes?.some?.(findPart) ?? false;
      }
      if (msg.bodyStructure) findPart(msg.bodyStructure);

      return { data: content.toString("base64"), filename, mimeType };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function moveMessages(uids: number[], mailbox: string, targetMailbox: string) {
  const client = buildClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageMove(uids.map(String).join(","), targetMailbox, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function deleteMessages(uids: number[], mailbox: string) {
  const client = buildClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageDelete(uids.map(String).join(","), { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function createFolder(name: string) {
  const client = buildClient();
  await client.connect();
  try {
    await client.mailboxCreate(name);
  } finally {
    await client.logout();
  }
}

export async function deleteFolder(path: string) {
  const client = buildClient();
  await client.connect();
  try {
    await client.mailboxDelete(path);
  } finally {
    await client.logout();
  }
}

export async function emptyFolder(mailbox: string) {
  const client = buildClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const status = await client.status(mailbox, { messages: true });
      if ((status.messages ?? 0) === 0) return;
      await client.messageDelete("1:*", { uid: false });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function markMessages(uids: number[], mailbox: string, read: boolean) {
  const client = buildClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const uidSet = uids.map(String).join(",");
      if (read) {
        await client.messageFlagsAdd(uidSet, ["\\Seen"], { uid: true });
      } else {
        await client.messageFlagsRemove(uidSet, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function starMessage(uid: number, mailbox: string, starred: boolean) {
  const client = buildClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      if (starred) {
        await client.messageFlagsAdd(`${uid}`, ["\\Flagged"], { uid: true });
      } else {
        await client.messageFlagsRemove(`${uid}`, ["\\Flagged"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
