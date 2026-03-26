/**
 * Encode/decode opaque message IDs used in the API.
 * Format: {uid}:{base64url(mailbox)}
 */

export function encodeMessageId(uid: number, mailbox: string): string {
  const encoded = Buffer.from(mailbox, "utf8").toString("base64url");
  return `${uid}:${encoded}`;
}

export function decodeMessageId(id: string): { uid: number; mailbox: string } | null {
  const parts = id.split(":");
  if (parts.length < 2) return null;
  const uid = parseInt(parts[0], 10);
  if (isNaN(uid)) return null;
  try {
    const mailbox = Buffer.from(parts.slice(1).join(":"), "base64url").toString("utf8");
    return { uid, mailbox };
  } catch {
    return null;
  }
}
