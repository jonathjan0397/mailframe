/**
 * linked-accounts — persistent, encrypted storage of per-user linked accounts.
 *
 * Passwords are encrypted at rest with AES-256-GCM using a server-side key.
 * The key comes from the MF_SECRET env var; if absent, one is auto-generated
 * and saved to server/.secret so it survives restarts without manual setup.
 *
 * Storage: server/linked-accounts.json  (never uploaded by the deploy script)
 * Secret:  server/.secret               (never committed; mode 0600)
 *
 * Public API:
 *   getLinkedAccounts(primaryEmail)                       → LinkedAccount[]
 *   saveLinkedAccount(primaryEmail, linkedEmail, pass)    → void
 *   removeLinkedAccount(primaryEmail, linkedEmail)        → void
 */

import {
  createCipheriv, createDecipheriv,
  randomBytes, createHash,
} from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// One level up from src/ or dist/ → lands in server/
const DATA_PATH   = resolve(__dirname, "../linked-accounts.json");
const SECRET_PATH = resolve(__dirname, "../.secret");

// ── Encryption key ──────────────────────────────────────────────────────────

function loadOrCreateKey(): Buffer {
  if (process.env.MF_SECRET) {
    // Derive a fixed-length key from the env secret
    return createHash("sha256").update(process.env.MF_SECRET).digest();
  }
  if (existsSync(SECRET_PATH)) {
    return Buffer.from(readFileSync(SECRET_PATH, "utf8").trim(), "hex");
  }
  // First run: generate and persist a random 32-byte key
  const key = randomBytes(32);
  writeFileSync(SECRET_PATH, key.toString("hex"), { mode: 0o600 });
  return key;
}

const KEY = loadOrCreateKey();

// ── AES-256-GCM helpers ─────────────────────────────────────────────────────

/** Returns a base64url-encoded string: `iv:authTag:ciphertext`. */
function encrypt(plaintext: string): string {
  const iv     = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct     = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString("base64url")).join(":");
}

function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted value");
  const [ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    KEY,
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// ── JSON store ──────────────────────────────────────────────────────────────

type StoredEntry = { email: string; encryptedPass: string };
type Store = Record<string, StoredEntry[]>;

function load(): Store {
  try {
    return JSON.parse(readFileSync(DATA_PATH, "utf8")) as Store;
  } catch {
    return {};
  }
}

function save(store: Store): void {
  writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

// ── Public API ──────────────────────────────────────────────────────────────

export type LinkedAccount = { email: string; pass: string };

/**
 * Returns all linked accounts for a primary email with passwords decrypted.
 * Silently skips any entries that fail to decrypt (e.g. after key rotation).
 */
export function getLinkedAccounts(primaryEmail: string): LinkedAccount[] {
  const entries = load()[primaryEmail] ?? [];
  const result: LinkedAccount[] = [];
  for (const e of entries) {
    try {
      result.push({ email: e.email, pass: decrypt(e.encryptedPass) });
    } catch { /* skip corrupted/key-mismatch entries */ }
  }
  return result;
}

/**
 * Persists a linked account. Overwrites an existing entry for the same email
 * (e.g. when the user re-adds an account after a password change).
 */
export function saveLinkedAccount(
  primaryEmail: string,
  linkedEmail: string,
  linkedPass: string,
): void {
  const store   = load();
  const entries = store[primaryEmail] ?? [];
  const idx     = entries.findIndex((e) => e.email === linkedEmail);
  const entry: StoredEntry = { email: linkedEmail, encryptedPass: encrypt(linkedPass) };
  if (idx >= 0) entries[idx] = entry; else entries.push(entry);
  store[primaryEmail] = entries;
  save(store);
}

/**
 * Removes a single linked account for a primary email.
 */
export function removeLinkedAccount(primaryEmail: string, linkedEmail: string): void {
  const store   = load();
  const entries = (store[primaryEmail] ?? []).filter((e) => e.email !== linkedEmail);
  if (entries.length === 0) {
    delete store[primaryEmail];
  } else {
    store[primaryEmail] = entries;
  }
  save(store);
}
