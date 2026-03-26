import nodemailer from "nodemailer";

export async function sendMail(payload: {
  to: string;
  subject: string;
  body: string;
  replyToId?: string;
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
    subject: payload.subject,
    text: payload.body,
  });
}
