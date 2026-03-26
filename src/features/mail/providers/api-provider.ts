/**
 * api-provider — bridges the MailFrame frontend to the bridge server (v1.3+).
 *
 * Usage in App.tsx:
 *   import { apiProvider } from "./features/mail/providers/api-provider";
 *   const provider = apiProvider;
 *
 * Configured via VITE_API_BASE_URL env var (defaults to http://localhost:4010).
 */
import type { MailProvider, MailboxQuery, SendPayload } from "../provider";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4010";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const apiProvider: MailProvider = {
  async getMailboxSnapshot(query?: MailboxQuery) {
    const params = new URLSearchParams();
    if (query?.folderId) params.set("folder", query.folderId);
    if (query?.page) params.set("page", String(query.page));
    if (query?.query) params.set("q", query.query);
    const qs = params.toString() ? `?${params}` : "";
    return apiFetch(`/mailbox${qs}`);
  },

  async getMessageDetail(messageId: string) {
    return apiFetch(`/messages/${encodeURIComponent(messageId)}`);
  },

  async moveMessages(messageIds: string[], targetFolderId: string) {
    await apiFetch("/messages/move", {
      method: "POST",
      body: JSON.stringify({ ids: messageIds, targetFolder: targetFolderId }),
    });
  },

  async deleteMessages(messageIds: string[]) {
    await apiFetch("/messages/delete", {
      method: "POST",
      body: JSON.stringify({ ids: messageIds }),
    });
  },

  async markRead(messageIds: string[], read: boolean) {
    await apiFetch("/messages/mark", {
      method: "POST",
      body: JSON.stringify({ ids: messageIds, read }),
    });
  },

  async toggleStar(messageId: string, starred: boolean) {
    await apiFetch("/messages/star", {
      method: "POST",
      body: JSON.stringify({ id: messageId, starred }),
    });
  },

  async sendMessage(payload: SendPayload) {
    await apiFetch("/messages/send", {
      method: "POST",
      body: JSON.stringify({
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        body: payload.body,
        bodyHtml: payload.bodyHtml,
        replyToId: payload.replyToId,
        attachments: payload.attachments,
      }),
    });
  },

  async emptyFolder(folderId: string) {
    await apiFetch("/messages/empty", {
      method: "POST",
      body: JSON.stringify({ folder: folderId }),
    });
  },

  async getAttachment(messageId: string, partId: string) {
    return apiFetch<{ data: string; filename: string; mimeType: string }>(
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(partId)}`,
    );
  },

  async createFolder(name: string) {
    await apiFetch("/folders/create", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async deleteFolder(folderId: string) {
    await apiFetch("/folders/delete", {
      method: "POST",
      body: JSON.stringify({ folder: folderId }),
    });
  },

  async getSettings() {
    return apiFetch<Record<string, unknown>>("/settings");
  },

  async saveSettings(data: Record<string, unknown>) {
    await apiFetch("/settings", { method: "POST", body: JSON.stringify(data) });
  },
};
