import nodemailer from "nodemailer";
import { config } from "./config.js";

export type SmtpCredentials = { user: string; pass: string };

type AttachmentItem = {
  filename: string;
  mimeType: string;
  data: string; // base64
};

export async function sendMail(
  creds: SmtpCredentials,
  payload: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    bodyHtml?: string;
    replyToId?: string;
    attachments?: AttachmentItem[];
  },
) {
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    requireTLS: config.smtp.requireTls,
    auth: { user: creds.user, pass: creds.pass },
  });

  await transport.sendMail({
    from: creds.user,
    to: payload.to,
    cc: payload.cc || undefined,
    bcc: payload.bcc || undefined,
    subject: payload.subject,
    text: payload.body,
    html: payload.bodyHtml || undefined,
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.mimeType,
      content: Buffer.from(a.data, "base64"),
    })),
  });
}
