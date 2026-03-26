/**
 * MailFrame FTP Deploy Script
 *
 * Usage:
 *   node deploy/deploy.js <target>
 *
 * Targets:
 *   mailframe      — upload dist/ → public_html/mailframe/
 *   mailframe-php  — upload server-php/ → public_html/mailframe-api/
 *   htaccess       — upload deploy/htaccess → public_html/.htaccess
 *   all            — mailframe + mailframe-php + htaccess in sequence
 *
 * Env vars (also read from .env or settings.local.json):
 *   FTP_HOST, FTP_USER, FTP_PASS, FTP_ROOT (default: public_html)
 */
import * as ftp from "basic-ftp";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const HOST = process.env.FTP_HOST;
const USER = process.env.FTP_USER;
const PASS = process.env.FTP_PASS;
const FTP_ROOT = process.env.FTP_ROOT ?? "public_html";

if (!HOST || !USER || !PASS) {
  console.error(
    "ERROR: FTP_HOST, FTP_USER, and FTP_PASS must be set.\n" +
    "Add them to .claude/settings.local.json under the \"env\" key."
  );
  process.exit(1);
}

const TARGETS = {
  mailframe: {
    localDir: path.join(root, "dist"),
    remoteDir: `${FTP_ROOT}/mailframe`,
  },
  "mailframe-php": {
    localDir: path.join(root, "server-php"),
    remoteDir: `${FTP_ROOT}/mailframe-api`,
  },
  htaccess: {
    localFile: path.join(__dirname, "htaccess"),
    remoteFile: `${FTP_ROOT}/.htaccess`,
  },
};

async function connect() {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  await client.access({ host: HOST, user: USER, password: PASS, secure: false });
  return client;
}

async function deployDir(client, localDir, remoteDir) {
  console.log(`  Upload dir: ${localDir} → /${remoteDir}`);
  await client.ensureDir(remoteDir);
  await client.clearWorkingDir();
  await client.uploadFromDir(localDir);
  console.log("  Done.");
}

async function deployFile(client, localFile, remoteFile) {
  console.log(`  Upload file: ${path.basename(localFile)} → /${remoteFile}`);
  const remoteDir = remoteFile.substring(0, remoteFile.lastIndexOf("/"));
  await client.ensureDir(remoteDir);
  await client.uploadFrom(localFile, remoteFile.substring(remoteFile.lastIndexOf("/") + 1));
  console.log("  Done.");
}

async function run() {
  const target = process.argv[2];
  const targets = target === "all" ? ["mailframe", "mailframe-php", "htaccess"] : [target];

  if (!targets.every((t) => t in TARGETS)) {
    console.error(`Unknown target: ${target}`);
    console.error(`Available: ${Object.keys(TARGETS).join(", ")}, all`);
    process.exit(1);
  }

  const client = await connect();
  console.log(`Connected to ${HOST}`);

  try {
    for (const t of targets) {
      console.log(`\n[${t}]`);
      const cfg = TARGETS[t];
      if (cfg.localDir) {
        await deployDir(client, cfg.localDir, cfg.remoteDir);
      } else {
        await deployFile(client, cfg.localFile, cfg.remoteFile);
      }
    }
    console.log("\nAll done ✓");
  } finally {
    client.close();
  }
}

run().catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
