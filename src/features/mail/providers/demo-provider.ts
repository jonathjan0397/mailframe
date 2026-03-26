import { demoFolders, demoMessages, demoMessageBodies } from "../../../lib/demo-data";
import type { MailProvider } from "../provider";

export const demoProvider: MailProvider = {
  async getMailboxSnapshot(query) {
    const folderId = query?.folderId ?? "INBOX";
    const searchQuery = (query?.query ?? "").toLowerCase().trim();

    let messages = demoMessages.filter((m) => {
      const inFolder = folderId === "INBOX" || m.id.startsWith("msg");
      const matchesSearch =
        !searchQuery ||
        m.sender.toLowerCase().includes(searchQuery) ||
        m.subject.toLowerCase().includes(searchQuery) ||
        m.preview.toLowerCase().includes(searchQuery);
      return inFolder && matchesSearch;
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
