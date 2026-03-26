import "dotenv/config";
import express from "express";
import cors from "cors";
import { decodeMessageId } from "./encode.js";
import { getFolders, getMailbox, getMessage, getAttachment, moveMessages, deleteMessages, emptyFolder, markMessages, starMessage } from "./imap.js";
import { sendMail } from "./smtp.js";

const app = express();
const port = parseInt(process.env.PORT ?? "4010", 10);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json());

function err(res: express.Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

// GET /mailbox
app.get("/mailbox", async (req, res) => {
  try {
    const folder = (req.query.folder as string) ?? "INBOX";
    const page = Math.max(parseInt((req.query.page as string) ?? "1", 10), 1);
    const query = (req.query.q as string) ?? "";

    const [folders, { messages, total, hasNextPage }] = await Promise.all([
      getFolders(),
      getMailbox(folder, page, query),
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
app.get("/messages/:id", async (req, res) => {
  const decoded = decodeMessageId(req.params.id);
  if (!decoded) return err(res, 400, "Invalid message id.");
  try {
    const detail = await getMessage(decoded.uid, decoded.mailbox);
    res.json(detail);
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Message fetch failed.");
  }
});

// POST /messages/move
app.post("/messages/move", async (req, res) => {
  const { ids, targetFolder } = req.body as { ids: string[]; targetFolder: string };
  if (!Array.isArray(ids) || !ids.length || !targetFolder) return err(res, 400, "ids and targetFolder required.");
  try {
    const groups = groupByMailbox(ids);
    for (const [mailbox, uids] of groups) {
      await moveMessages(uids, mailbox, targetFolder);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Move failed.");
  }
});

// POST /messages/delete
app.post("/messages/delete", async (req, res) => {
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || !ids.length) return err(res, 400, "ids required.");
  try {
    const groups = groupByMailbox(ids);
    for (const [mailbox, uids] of groups) {
      await deleteMessages(uids, mailbox);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Delete failed.");
  }
});

// POST /messages/mark
app.post("/messages/mark", async (req, res) => {
  const { ids, read } = req.body as { ids: string[]; read: boolean };
  if (!Array.isArray(ids) || !ids.length || typeof read !== "boolean") return err(res, 400, "ids and read required.");
  try {
    const groups = groupByMailbox(ids);
    for (const [mailbox, uids] of groups) {
      await markMessages(uids, mailbox, read);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Mark failed.");
  }
});

// POST /messages/star
app.post("/messages/star", async (req, res) => {
  const { id, starred } = req.body as { id: string; starred: boolean };
  if (!id || typeof starred !== "boolean") return err(res, 400, "id and starred required.");
  const decoded = decodeMessageId(id);
  if (!decoded) return err(res, 400, "Invalid message id.");
  try {
    await starMessage(decoded.uid, decoded.mailbox, starred);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Star failed.");
  }
});

// POST /messages/send
app.post("/messages/send", async (req, res) => {
  const { to, cc, bcc, subject, body, replyToId, attachments } = req.body as {
    to: string; cc?: string; bcc?: string; subject: string; body: string;
    replyToId?: string;
    attachments?: Array<{ filename: string; mimeType: string; data: string }>;
  };
  if (!to || !body) return err(res, 400, "to and body required.");
  try {
    await sendMail({ to, cc, bcc, subject: subject ?? "(No subject)", body, replyToId, attachments });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Send failed.");
  }
});

// GET /messages/:id/attachments/:partId
app.get("/messages/:id/attachments/:partId", async (req, res) => {
  const decoded = decodeMessageId(req.params.id);
  if (!decoded) return err(res, 400, "Invalid message id.");
  try {
    const result = await getAttachment(decoded.uid, decoded.mailbox, req.params.partId);
    res.json(result);
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Attachment fetch failed.");
  }
});

// POST /messages/empty
app.post("/messages/empty", async (req, res) => {
  const { folder } = req.body as { folder: string };
  if (!folder) return err(res, 400, "folder required.");
  try {
    await emptyFolder(folder);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    err(res, 500, e instanceof Error ? e.message : "Empty folder failed.");
  }
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, service: "mailframe-server" }));

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

app.listen(port, () => {
  console.log(`MailFrame server running on http://localhost:${port}`);
});
