/**
 * imap-notify — IMAP IDLE watcher for real-time new-mail detection.
 *
 * Uses IMAP IDLE (RFC 2177) to receive server-push EXISTS notifications
 * instead of polling. Falls back gracefully if the server doesn't support IDLE.
 *
 * Usage:
 *   const ac = new AbortController();
 *   watchAccount(creds, (msgs) => sendSseEvent(msgs), ac.signal);
 *   // later:
 *   ac.abort(); // stops watching
 */

import { ImapFlow } from "imapflow";
import { config } from "./config.js";
import { encodeMessageId } from "./encode.js";
import type { ImapCredentials } from "./imap.js";

export type NotifMessage = {
  id: string;
  sender: string;
  subject: string;
  unread: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildNotifyClient(creds: ImapCredentials): ImapFlow {
  return new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: creds.user, pass: creds.pass },
    tls: config.imap.tls as Record<string, boolean> | undefined,
    logger: false,
    // No maxIdleTime — we manage the restart loop ourselves so we can
    // fetch messages between IDLE cycles without fighting the internal timer.
  });
}

function formatNotifSender(
  address: { name?: string; address?: string } | undefined,
): string {
  if (!address) return "Unknown";
  return address.name ?? address.address ?? "Unknown";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Request IDLE to break so the connection is free for other commands. */
function breakIdle(client: ImapFlow): void {
  const c = client as unknown as { preCheck?: () => Promise<void>; close?: () => void };
  if (typeof c.preCheck === "function") {
    c.preCheck().catch(() => {});
  } else {
    // Connection isn't idling — no-op (or force-close as last resort)
    c.close?.();
  }
}

// ── Core IDLE session ──────────────────────────────────────────────────────

/**
 * Runs one IDLE session: connects, watches INBOX, fetches new messages
 * when EXISTS fires, then loops back into IDLE.  Throws on fatal errors
 * (caller is responsible for reconnect).
 */
async function runIdleSession(
  creds: ImapCredentials,
  onNewMail: (msgs: NotifMessage[]) => void,
  signal: AbortSignal,
): Promise<void> {
  const client = buildNotifyClient(creds);
  await client.connect();

  const lock = await client.getMailboxLock("INBOX");
  const { messages: initialTotal } = await client.status("INBOX", { messages: true });
  let prevCount = initialTotal ?? 0;
  let pendingCount = 0;

  const onExists = (data: { count: number }) => {
    if (data.count > prevCount) {
      pendingCount += data.count - prevCount;
      prevCount = data.count;
      // Break IDLE so the while-loop can run the fetch and re-enter IDLE.
      breakIdle(client);
    }
  };

  client.on("exists", onExists);

  // When the signal fires, break IDLE so idle() resolves and the loop exits.
  const abortHandler = () => breakIdle(client);
  signal.addEventListener("abort", abortHandler, { once: true });

  try {
    while (!signal.aborted) {
      // Safety: most IMAP servers drop IDLE after ~29 min. Break and restart
      // after 25 min so the connection stays alive indefinitely.
      let safetyTimer: ReturnType<typeof setTimeout> | null = setTimeout(
        () => breakIdle(client),
        25 * 60 * 1000,
      );

      try {
        await client.idle(); // blocks until preCheck breaks it, or connection closes
      } finally {
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
      }

      if (signal.aborted) break;

      // Fetch any new messages that triggered the IDLE break.
      if (pendingCount > 0) {
        const count = pendingCount;
        pendingCount = 0;

        const range = `${Math.max(1, prevCount - count + 1)}:${prevCount}`;
        const msgs: NotifMessage[] = [];

        try {
          for await (const msg of client.fetch(range, {
            uid: true,
            envelope: true,
            flags: true,
          })) {
            msgs.push({
              id: encodeMessageId(msg.uid, "INBOX"),
              sender: formatNotifSender(msg.envelope?.from?.[0]),
              subject: msg.envelope?.subject ?? "(No subject)",
              unread: !msg.flags?.has("\\Seen"),
            });
          }
        } catch { /* fetch errors are non-fatal; loop back to IDLE */ }

        if (msgs.length > 0) onNewMail(msgs);
      }
      // Loop → idle() is called again at the top of the while
    }
  } finally {
    signal.removeEventListener("abort", abortHandler);
    client.off("exists", onExists);
    lock.release();
    await client.logout().catch(() => {});
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Watches an account's INBOX for new mail using IMAP IDLE.
 * Reconnects automatically on network errors.
 * Resolves when signal is aborted.
 */
export async function watchAccount(
  creds: ImapCredentials,
  onNewMail: (msgs: NotifMessage[]) => void,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await runIdleSession(creds, onNewMail, signal);
    } catch {
      // Wait before reconnecting to avoid hammering the server on persistent errors.
      if (!signal.aborted) await sleep(10_000);
    }
  }
}
