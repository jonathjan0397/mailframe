import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Works both from src/ (dev) and dist/ (prod) — config sits one level up in server/
const CONFIG_PATH = resolve(__dirname, "../mailframe.config.json");

export type AppConfig = {
  imap: {
    host: string;
    port: number;
    secure: boolean;
    tls?: Record<string, unknown>;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    requireTls?: boolean;
  };
  app: {
    name: string;
    sessionTtlHours: number;
    /** If non-empty, only emails matching these domains may log in. */
    allowedDomains?: string[];
  };
};

function loadConfig(): AppConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    // Fallback to environment variables when no config file is present
    return {
      imap: {
        host: process.env.IMAP_HOST ?? "localhost",
        port: parseInt(process.env.IMAP_PORT ?? "993", 10),
        secure: process.env.IMAP_SECURE !== "false",
        tls: { rejectUnauthorized: false },
      },
      smtp: {
        host: process.env.SMTP_HOST ?? "localhost",
        port: parseInt(process.env.SMTP_PORT ?? "587", 10),
        secure: process.env.SMTP_SECURE === "true",
      },
      app: {
        name: "MailFrame",
        sessionTtlHours: 24,
        allowedDomains: [],
      },
    };
  }
}

export const config = loadConfig();
