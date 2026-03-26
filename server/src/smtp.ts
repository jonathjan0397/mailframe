import nodemailer from "nodemailer";

type AttachmentItem = {
  filename: string;
  mimeType: string;
  data: string; // base64
};

export async function sendMail(payload: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  replyToId?: string;
  attachments?: AttachmentItem[];
}) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: payload.to,
    cc: payload.cc || undefined,
    bcc: payload.bcc || undefined,
    subject: payload.subject,
    text: payload.body,
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.mimeType,
      content: Buffer.from(a.data, "base64"),
    })),
  });
}
