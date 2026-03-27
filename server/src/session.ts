import { randomUUID } from "crypto";

export type AccountEntry = { email: string; imapPass: string };

export type SessionData = {
  primary: string;          // first account logged in; never changes; used as persistence key
  active: string;
  accounts: Map<string, AccountEntry>;
  expires: number;
};

const sessions = new Map<string, SessionData>();

export function createSession(email: string, imapPass: string, ttlHours: number): string {
  const token = randomUUID();
  const accounts = new Map<string, AccountEntry>();
  accounts.set(email, { email, imapPass });
  sessions.set(token, {
    primary: email,
    active: email,
    accounts,
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

export function addAccountToSession(token: string, email: string, imapPass: string): string[] | null {
  const session = getSession(token);
  if (!session) return null;
  session.accounts.set(email, { email, imapPass });
  return [...session.accounts.keys()];
}

export function switchSessionAccount(token: string, email: string): boolean {
  const session = getSession(token);
  if (!session || !session.accounts.has(email)) return false;
  session.active = email;
  return true;
}

export function removeAccountFromSession(
  token: string,
  email: string,
): { accounts: string[]; active: string | null } | null {
  const session = getSession(token);
  if (!session) return null;
  session.accounts.delete(email);
  if (session.accounts.size === 0) {
    sessions.delete(token);
    return { accounts: [], active: null };
  }
  if (session.active === email) {
    session.active = session.accounts.keys().next().value!;
  }
  return { accounts: [...session.accounts.keys()], active: session.active };
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
