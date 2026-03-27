import "dotenv/config";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import {
  createSession, getSession, deleteSession,
  addAccountToSession, switchSessionAccount, removeAccountFromSession,
} from "./session.js";
import { decodeMessageId } from "./encode.js";
import {
  getFolders, getMailbox, getMessage, getAttachment,
  moveMessages, deleteMessages, emptyFolder, markMessages,
  starMessage, createFolder, deleteFolder,
  type ImapCredentials,
} from "./imap.js";
import { sendMail } from "./smtp.js";
import type { SmtpCredentials } from "./smtp.js";

const app = express();
const port = parseInt(process.env.PORT ?? "4010", 10);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json());

// ── Cookie helpers ─────────────────────────────────────────────────────────
function getCookieToken(req: express.Request): string | null {
  const cookieHeader = req.headers.cookie ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)mf_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setSessionCookie(res: express.Response, token: string) {
  const maxAge = config.app.sessionTtlHours * 3600;
  res.setHeader(
    "Set-Cookie",
    `mf_session=${token}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Path=/`,
  );
}

function clearSessionCookie(res: express.Response) {
  res.setHeader("Set-Cookie", "mf_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/");
}

// ── Auth middleware ────────────────────────────────────────────────────────
interface AuthedRequest extends express.Request {
  creds: ImapCredentials & SmtpCredentials;
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const token = getCookieToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated." }); return; }
  const session = getSession(token);
  if (!session) { res.status(401).json({ error: "Session expired." }); return; }
  const active = session.accounts.get(session.active);
  if (!active) { res.status(401).json({ error: "Session error." }); return; }
  (req as AuthedRequest).creds = { user: active.email, pass: active.imapPass };
  next();
}

function err(res: express.Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function groupByMailbox(ids: string[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const id of ids) {
    const decoded = decodeMessageId(id);
    if (!decoded) continue;
    const existing = groups.get(decoded.mailbox) ?? [];
    existing.push(decoded.uid);
    groups.set(decoded.mailbox, existing);
  }
  return groups;
}

// ── Auth endpoints ─────────────────────────────────────────────────────────

// POST /auth/login
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email?.trim() || !password) { err(res, 400, "email and password required."); return; }

  const domain = email.split("@")[1] ?? "";
  const allowed = config.app.allowedDomains ?? [];
  if (allowed.length > 0 && !allowed.includes(domain)) {
    err(res, 403, "Email domain not permitted."); return;
  }

  const creds: ImapCredentials = { user: email.trim(), pass: password };
  try {
    // Validate credentials by briefly connecting to IMAP
    const folders = await getFolders(creds);
    if (!folders.length) throw new Error("No folders found.");

    const existingToken = getCookieToken(req);
    const existingSession = existingToken ? getSession(existingToken) : null;
    if (existingSession && existingToken) {
      // Add to existing session (multi-account)
      addAccountToSession(existingToken, email.trim(), password);
      const accounts = [...existingSession.accounts.keys()];
      res.json({ ok: true, email: existingSession.active, accounts, name: config.app.name });
    } else {
      const token = createSession(email.trim(), password, config.app.sessionTtlHours);
      setSessionCookie(res, token);
      res.json({ ok: true, email: email.trim(), accounts: [email.trim()], name: config.app.name });
    }
  } catch (e) {
    err(res, 401, e instanceof Error ? e.message : "Authentication failed.");
  }
});

// GET /auth/me
app.get("/auth/me", (req, res) => {
  const token = getCookieToken(req);
  if (!token) { res.status(401).json({ ok: false }); return; }
  const session = getSession(token);
  if (!session) { res.status(401).json({ ok: false }); return; }
  const accounts = [...session.accounts.keys()];
  res.json({ ok: true, email: session.active, accounts, name: config.app.name });
});

// POST /auth/logout
app.post("/auth/logout", (req, res) => {
  const token = getCookieToken(req);
  if (token) deleteSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /auth/config — public: tells the frontend the app name
app.get("/auth/config", (_req, res) => {
  res.json({ name: config.app.name });
});

// ── Protected routes ───────────────────────────────────────────────────────

// GET /mailbox
app.get("/mailbox", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  try {
    const folder = (req.query.folder as string) ?? "INBOX";
    const page = Math.max(parseInt((req.query.page as string) ?? "1", 10), 1);
    const query = (req.query.q as string) ?? "";
    const [folders, { messages, total, hasNextPage }] = await Promise.all([
      getFolders(creds),
      getMailbox(creds, folder, page, query),
    ]);
    res.json({
      folders,
      messages,
      meta: { folder, page, pageSize: 25, totalResults: total, hasNextPage, query },
    });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Mailbox fetch failed.");
  }
});

// GET /messages/:id
app.get("/messages/:id", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const decoded = decodeMessageId(req.params.id);
  if (!decoded) return err(res, 400, "Invalid message id.");
  try {
    const detail = await getMessage(creds, decoded.uid, decoded.mailbox);
    res.json(detail);
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Message fetch failed.");
  }
});

// POST /messages/move
app.post("/messages/move", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const { ids, targetFolder } = req.body as { ids: string[]; targetFolder: string };
  if (!Array.isArray(ids) || !ids.length || !targetFolder) return err(res, 400, "ids and targetFolder required.");
  try {
    const groups = groupByMailbox(ids);
    for (const [mailbox, uids] of groups) await moveMessages(creds, uids, mailbox, targetFolder);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Move failed.");
  }
});

// POST /messages/delete
app.post("/messages/delete", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || !ids.length) return err(res, 400, "ids required.");
  try {
    const groups = groupByMailbox(ids);
    for (const [mailbox, uids] of groups) await deleteMessages(creds, uids, mailbox);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Delete failed.");
  }
});

// POST /messages/mark
app.post("/messages/mark", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const { ids, read } = req.body as { ids: string[]; read: boolean };
  if (!Array.isArray(ids) || !ids.length || typeof read !== "boolean") return err(res, 400, "ids and read required.");
  try {
    const groups = groupByMailbox(ids);
    for (const [mailbox, uids] of groups) await markMessages(creds, uids, mailbox, read);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Mark failed.");
  }
});

// POST /messages/star
app.post("/messages/star", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const { id, starred } = req.body as { id: string; starred: boolean };
  if (!id || typeof starred !== "boolean") return err(res, 400, "id and starred required.");
  const decoded = decodeMessageId(id);
  if (!decoded) return err(res, 400, "Invalid message id.");
  try {
    await starMessage(creds, decoded.uid, decoded.mailbox, starred);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Star failed.");
  }
});

// POST /messages/send
app.post("/messages/send", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const { to, cc, bcc, subject, body, bodyHtml, replyToId, attachments } = req.body as {
    to: string; cc?: string; bcc?: string; subject: string; body: string;
    bodyHtml?: string; replyToId?: string;
    attachments?: Array<{ filename: string; mimeType: string; data: string }>;
  };
  if (!to || !body) return err(res, 400, "to and body required.");
  try {
    await sendMail(creds, { to, cc, bcc, subject: subject ?? "(No subject)", body, bodyHtml, replyToId, attachments });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Send failed.");
  }
});

// GET /messages/:id/attachments/:partId
app.get("/messages/:id/attachments/:partId", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const decoded = decodeMessageId(req.params.id);
  if (!decoded) return err(res, 400, "Invalid message id.");
  try {
    const result = await getAttachment(creds, decoded.uid, decoded.mailbox, req.params.partId);
    res.json(result);
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Attachment fetch failed.");
  }
});

// POST /messages/empty
app.post("/messages/empty", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const { folder } = req.body as { folder: string };
  if (!folder) return err(res, 400, "folder required.");
  try {
    await emptyFolder(creds, folder);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Empty folder failed.");
  }
});

// POST /folders/create
app.post("/folders/create", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const { name } = req.body as { name: string };
  if (!name?.trim()) return err(res, 400, "name required.");
  try {
    await createFolder(creds, name.trim());
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Create folder failed.");
  }
});

// POST /folders/delete
app.post("/folders/delete", requireAuth, async (req, res) => {
  const { creds } = req as AuthedRequest;
  const { folder } = req.body as { folder: string };
  if (!folder) return err(res, 400, "folder required.");
  try {
    await deleteFolder(creds, folder);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Delete folder failed.");
  }
});

// POST /auth/switch — change active account within session
app.post("/auth/switch", requireAuth, (req, res) => {
  const token = getCookieToken(req)!;
  const { email } = req.body as { email?: string };
  if (!email) { err(res, 400, "email required."); return; }
  const session = getSession(token)!;
  if (!session.accounts.has(email)) { err(res, 404, "Account not found."); return; }
  switchSessionAccount(token, email);
  res.json({ email, accounts: [...session.accounts.keys()] });
});

// POST /auth/logout-account — remove one account from session
app.post("/auth/logout-account", requireAuth, (req, res) => {
  const token = getCookieToken(req)!;
  const { email } = req.body as { email?: string };
  if (!email) { err(res, 400, "email required."); return; }
  const result = removeAccountFromSession(token, email);
  if (!result) { err(res, 500, "Session error."); return; }
  if (result.accounts.length === 0) {
    clearSessionCookie(res);
    res.json({ ok: true, accounts: [], email: null });
  } else {
    res.json({ ok: true, accounts: result.accounts, email: result.active });
  }
});

// GET /mailbox/poll-all — fetch recent INBOX messages for every account in session
app.get("/mailbox/poll-all", requireAuth, async (req, res) => {
  const token = getCookieToken(req)!;
  const session = getSession(token)!;
  const settled = await Promise.allSettled(
    [...session.accounts.values()].map(async (acct) => {
      const creds: ImapCredentials = { user: acct.email, pass: acct.imapPass };
      const { messages } = await getMailbox(creds, "INBOX", 1, "");
      return { account: acct.email, messages: messages.slice(0, 10) };
    }),
  );
  const results = settled
    .filter((r) => r.status === "fulfilled")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => (r as any).value as { account: string; messages: unknown[] });
  res.json({ results });
});

// Health check (public)
app.get("/health", (_req, res) => res.json({ ok: true, service: "mailframe-server" }));

app.listen(port, () => {
  console.log(`MailFrame server running on http://localhost:${port}`);
  console.log(`  App name: ${config.app.name}`);
  console.log(`  IMAP: ${config.imap.host}:${config.imap.port} (secure: ${config.imap.secure})`);
  console.log(`  SMTP: ${config.smtp.host}:${config.smtp.port} (secure: ${config.smtp.secure})`);
});
