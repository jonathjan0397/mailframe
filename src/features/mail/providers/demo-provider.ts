import { demoFolders, demoMessages, demoMessageBodies } from "../../../lib/demo-data";
import type { MailProvider } from "../provider";

function parseDemoFilters(raw: string) {
  let text = raw;
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

export const demoProvider: MailProvider = {
  async getMailboxSnapshot(query) {
    const folderId = query?.folderId ?? "INBOX";
    const filters = parseDemoFilters(query?.query ?? "");

    let messages = demoMessages.filter((m) => {
      const inFolder = folderId === "INBOX" || m.id.startsWith("msg");
      if (!inFolder) return false;
      if (filters.text) {
        const q = filters.text.toLowerCase();
        if (
          !m.sender.toLowerCase().includes(q) &&
          !m.subject.toLowerCase().includes(q) &&
          !m.preview.toLowerCase().includes(q)
        ) return false;
      }
      if (filters.from && !m.sender.toLowerCase().includes(filters.from)) return false;
      if (filters.subject && !m.subject.toLowerCase().includes(filters.subject)) return false;
      if (filters.unreadOnly && !m.unread) return false;
      if (filters.starredOnly && !m.starred) return false;
      return true;
    });

    return {
      folders: demoFolders,
      messages,
      meta: {
        folder: folderId,
        page: 1,
        pageSize: 25,
        totalResults: messages.length,
        hasNextPage: false,
      },
    };
  },

  async getMessageDetail(messageId) {
    const message = demoMessages.find((m) => m.id === messageId);
    if (!message) throw new Error("Message not found.");

    return {
      id: message.id,
      sender: message.sender,
      subject: message.subject,
      timestamp: message.timestamp,
      body: demoMessageBodies[message.id] ?? ["No content available."],
    };
  },

  async moveMessages(messageIds, targetFolderId) {
    console.info(`[demo] Move ${messageIds.join(", ")} → ${targetFolderId}`);
  },

  async deleteMessages(messageIds) {
    console.info(`[demo] Delete ${messageIds.join(", ")}`);
  },

  async markRead(messageIds, read) {
    console.info(`[demo] Mark ${messageIds.join(", ")} read=${read}`);
  },

  async toggleStar(messageId, starred) {
    console.info(`[demo] Star ${messageId} starred=${starred}`);
  },
};
