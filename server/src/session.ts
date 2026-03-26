import { randomUUID } from "crypto";

export type SessionData = {
  email: string;
  imapPass: string;
  expires: number;
};

const sessions = new Map<string, SessionData>();

export function createSession(
  email: string,
  imapPass: string,
  ttlHours: number,
): string {
  const token = randomUUID();
  sessions.set(token, {
    email,
    imapPass,
    expires: Date.now() + ttlHours * 3_600_000,
  });
  return token;
}

export function getSession(token: string): SessionData | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expires) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}

// Purge expired sessions hourly
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expires) sessions.delete(token);
  }
}, 3_600_000);
