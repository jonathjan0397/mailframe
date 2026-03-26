# MailFrame

An extensible, backend-agnostic IMAP webmail frontend with a drop-in theming system.

**Current version:** 1.17.0-beta.1 — Beta Testing Phase

> **Beta Notice:** MailFrame is currently in active beta testing. Core features are stable and in use on live deployments. Feedback, bug reports, and pull requests are welcome.

## Overview

MailFrame is a production-quality webmail shell built in React + TypeScript. It connects to any IMAP/SMTP-compatible mail server through a thin bridge server, and swaps visual styles through a token-based theming system — no component changes required.

**Bundled themes:** Lumen (clean, blue accent) · Aurora (rich, purple accent)

## Features

| Feature | Since |
|---|---|
| App shell — sidebar, message list, reading pane | v1.1 |
| Provider contract (read + write) | v1.2 |
| Demo provider (no backend required) | v1.1 |
| Token-based theme system | v1.4 |
| IMAP/SMTP bridge server (Node.js) | v1.8 |
| Attachment download | v1.9 |
| Message search | v1.9 |
| Folder management (create, delete, empty) | v1.9 |
| Compose with rich-text toolbar (bold, italic, underline, lists) | v1.10 |
| Thread view (group by subject) | v1.10 |
| Snooze messages (remind later / tomorrow / next weekday) | v1.11 |
| Drag messages to folders | v1.11 |
| Resizable message list pane | v1.11 |
| Login page with per-user IMAP auth | v1.12 |
| Session tokens (httpOnly cookie, configurable TTL) | v1.12 |
| Admin server config (`mailframe.config.json`) | v1.12 |
| PHP bridge — FTP-deployable, no shell access required | v1.13 |
| Undo send (7-second countdown with cancel) | v1.13 |
| Cross-device settings sync (theme + signature stored server-side) | v1.13 |
| Quick reply (inline, no modal) | v1.14 |
| Attachment drag-and-drop in compose | v1.14 |
| Send later (schedule email delivery) | v1.14 |
| MySQL setup wizard (browser-based, self-deleting) | v1.14 |
| Email templates (save/apply compose templates) | v1.15 |
| Multiple accounts (add, switch, remove per session) | v1.15 |
| Mark all read | v1.16 |
| Inline image rendering (`cid:` references in HTML emails) | v1.16 |
| PWA / installable (manifest + service worker) | v1.16 |
| Attachment thumbnail previews (inline mini-preview for images) | v1.17-beta |
| Full-screen attachment preview modal (images, PDF, text) | v1.17-beta |
| Provider selection persisted across page refreshes | v1.17-beta |

## Quick Start — Demo Mode

No credentials required. Demo data is built in.

```bash
npm install
npm run dev
# → http://localhost:5173
```

Switch to **Settings → Connection → Demo** if the API provider was previously selected.

---

## Basic Install — Shared Hosting with MySQL (no shell access required)

**Best for:** cPanel, CWP, Plesk, or any shared host where you can upload files via FTP or the file manager but cannot run shell commands on the server.

**Requirements:** PHP 7.4+ with the `php-imap` extension (standard on most shared hosts), a MySQL database, and an FTP client or cPanel File Manager.

### Step 1 — Build the frontend (one time, on your own computer)

You need Node.js installed locally to build the frontend once. You will not need it again after this step.

```bash
git clone https://github.com/jonathjan0397/mailframe.git
cd mailframe
npm install
```

Create a file called `.env.local` in the project root containing your site URL:

```
VITE_API_BASE_URL=https://yourdomain.com/mailframe-api
```

Then build:

```bash
npm run build
```

This produces a `dist/` folder — these are the files you will upload.

### Step 2 — Configure the PHP bridge

Open `server-php/mailframe.config.json` in any text editor and fill in your mail server details:

```json
{
  "imap": { "host": "mail.yourdomain.com", "port": 993, "secure": true },
  "smtp": { "host": "mail.yourdomain.com", "port": 465, "secure": true },
  "app":  { "name": "MailFrame", "sessionTtlHours": 24, "allowedDomains": [] },
  "settings": { "storage": "mysql" }
}
```

> Set `"storage": "file"` if you do not want MySQL — settings will not sync across devices but everything else works fine.

### Step 3 — Upload files via FTP or cPanel File Manager

Upload these three things to your server:

| Local path | Upload to |
|---|---|
| `dist/` (entire folder contents) | `public_html/mailframe/` |
| `server-php/` (entire folder) | `public_html/mailframe-api/` |
| `deploy/htaccess` | `public_html/.htaccess` (rename — remove the leading dot if your FTP client hides it, then rename on the server) |

> **cPanel tip:** Use **File Manager → Upload** to drag and drop both folders. Create the `mailframe/` and `mailframe-api/` directories first if they do not exist.

### Step 4 — Run the MySQL setup wizard

1. Upload `server-php/setup.php` into `public_html/mailframe-api/` alongside `index.php`
2. Visit `https://yourdomain.com/mailframe-api/setup.php` in your browser
3. Enter your MySQL host, database name, username, and password
4. Click **Run Setup** — the wizard creates the `mf_settings` table, writes the credentials into `mailframe.config.json`, and deletes itself

### Step 5 — Log in

Navigate to `https://yourdomain.com/mailframe/` and log in with your email address and IMAP password.

> In **Settings → Connection**, make sure **Bridge Server** is selected. This is remembered across sessions once set.

---

## Full Install — VPS or Dedicated Server (Node.js bridge)

**Best for:** VPS, dedicated servers, or Docker deployments where you have shell (SSH) access and can run Node.js.

**Requirements:** Node.js 20+, npm, shell access, and optionally PM2 for process management.

### Step 1 — Build the frontend

```bash
git clone https://github.com/jonathjan0397/mailframe.git
cd mailframe
npm install
```

Create `.env.local`:

```
VITE_API_BASE_URL=https://yourdomain.com/api
```

Then build and deploy via the included deploy script:

```bash
export FTP_HOST=yourdomain.com FTP_USER=ftpuser FTP_PASS=secret FTP_ROOT=public_html
node deploy/deploy.js all
# Uploads: dist/ → public_html/mailframe/
#          server-php/ → public_html/mailframe-api/
#          deploy/htaccess → public_html/.htaccess
```

Individual targets: `mailframe`, `mailframe-php`, `htaccess`.

### Step 2 — Configure and start the Node.js bridge

Create `server/mailframe.config.json`:

```json
{
  "imap": { "host": "mail.yourdomain.com", "port": 993, "secure": true },
  "smtp": { "host": "mail.yourdomain.com", "port": 465, "secure": true },
  "app":  { "name": "MailFrame", "sessionTtlHours": 24, "allowedDomains": [] }
}
```

Build and start:

```bash
cd server
npm install && npm run build
node dist/index.js
# → http://localhost:4010
```

For production, use PM2:

```bash
pm2 start dist/index.js --name mailframe-api && pm2 save
```

### Step 3 — Configure Apache reverse proxy

```apache
ProxyPass        /api/ http://localhost:4010/
ProxyPassReverse /api/ http://localhost:4010/
```

### Step 4 — Log in

Navigate to `https://yourdomain.com/mailframe/` and log in with your email address and IMAP password.

---

## Adding a Theme

1. Create `src/themes/mytheme.ts` implementing `ThemeTokens`:

```typescript
import type { ThemeTokens } from "./tokens";

export const myTheme: ThemeTokens = {
  id: "mytheme",
  label: "My Theme",
  description: "Short description shown in settings.",
  colorBg: "#f0f0f0",
  colorSurface: "#ffffff",
  colorAccent: "#e84040",
  // … see src/themes/tokens.ts for full token list
};
```

2. Register it in `src/themes/registry.ts`:

```typescript
import { myTheme } from "./mytheme";
export const themeRegistry = [...existingThemes, myTheme];
```

The theme appears in **Settings → Appearance** and on the login page immediately.

---

## Architecture

```
MailFrame Frontend (React + TypeScript + Vite)
  ├── src/app/           UI shell (App, LoginPage, ComposeModal, SettingsPanel)
  ├── src/themes/        Token system + built-in themes + registry
  ├── src/features/mail/ Provider contract + demo/API providers
  └── src/lib/           Shared types

PHP Bridge (FTP-deployable, shared hosting)
  ├── mailframe.config.json   Admin server/app settings
  └── index.php               Single-file REST API (auth, mailbox, compose, settings)

Node.js Bridge (VPS / Docker)
  ├── mailframe.config.json
  ├── src/config.ts      Config loader
  ├── src/session.ts     In-memory session store
  ├── src/imap.ts        imapflow IMAP client
  ├── src/smtp.ts        nodemailer SMTP transport
  └── src/index.ts       REST API + auth endpoints
```

### Provider Contract

Any backend implementing `MailProvider` (`src/features/mail/provider.ts`) can power the frontend. Read methods are required; write methods are optional — the UI disables actions the provider does not support.

See [docs/provider-contract.md](docs/provider-contract.md) for the full REST API specification.

---

## Code Review

*Reviewed by Claude Sonnet 4.6 — March 2026*

### Architecture & Separation of Concerns

MailFrame demonstrates strong separation of concerns across a well-structured layered architecture. The `MailProvider` contract cleanly decouples the frontend from backend implementations, enabling hot-swappable providers (demo, PHP bridge, Node bridge). Theme management is expertly abstracted via a token system, allowing themes to be swapped without touching components. Component boundaries are clear: `App.tsx` orchestrates state, `ComposeModal.tsx` and `SettingsPanel.tsx` are self-contained features, and `LoginPage.tsx` handles authentication independently.

### TypeScript

The codebase uses strict TypeScript (`strict: true`, `noUnusedLocals`, `noUnusedParameters`). `ComposeMode` is a discriminated union — idiomatic TypeScript. Type definitions are comprehensive across `MailProvider`, `SendPayload`, and `MailboxQuery`. One area for improvement: `localStorage` interactions parse JSON with try-catch but don't always validate the parsed structure before casting (e.g., `JSON.parse(raw) as Template[]`), which could silently degrade on malformed data.

### Security

Security is a major strength. DOMPurify is used consistently for HTML sanitization in both the compose editor and reading pane. CORS is properly configured, and HttpOnly/SameSite=Lax cookies are enforced for session tokens. The PHP bridge suppresses PHP warnings (`error_reporting(0)`) to prevent information leakage in JSON responses. Message IDs are opaque (base64url-encoded), preventing direct mailbox/UID inference.

### Performance

`@tanstack/react-virtual` virtualizes the message list, avoiding DOM bloat for large mailboxes. Thread grouping is computed via `useMemo`. Message details are lazy-loaded (on click only), and pagination is implemented. Search queries are debounced via a timer ref to prevent excessive API calls.

### Accessibility

ARIA attributes are used throughout: `role="dialog"`, `aria-modal`, `aria-label`, `aria-hidden`, `role="toolbar"`, and `aria-live="polite"` for status notifications. Form labels use correct `htmlFor` attributes. The compose editor is a `contentEditable` with ARIA labels and keyboard shortcut handling. Keyboard shortcuts (Ctrl+B/I/U, j/k navigation) are implemented and documented.

### Strengths

- **Provider pattern** — any backend (IMAP bridge, Gmail API, mock) works without UI changes
- **Theme system** — token-based, instant swap, no component rewrites
- **Multi-account support** — add, switch, and remove accounts within a single browser session
- **Rich composition** — contentEditable editor, templates, undo send, drag-drop attachments, scheduled sends
- **PWA-ready** — service worker + manifest for installable app on mobile and desktop
- **Opaque message IDs** — prevents mailbox/UID leakage to the browser

### Technical Debt

- **`App.tsx` is large** (~1,600 lines, ~25 state variables). Extracting custom hooks (`useMailboxState`, `useComposeState`) would improve readability and testability.
- **No `AbortController`** on data fetches — rapid folder/provider switches may surface race conditions, though the `cancelled` flag pattern mitigates most cases.
- **Limited error recovery** — when the API becomes unreachable mid-session, a toast fires but no reconnect or graceful degradation is offered.
- **Test coverage is thin** — the provider contract and auth flows would benefit from integration tests.

### Summary

MailFrame is a well-engineered, production-ready webmail client. The provider pattern, theme system, and accessibility polish are standout design choices. TypeScript is configured strictly, and security practices are sound. The main growth areas are decomposing the main App component into custom hooks, adding `AbortController` support, and expanding test coverage. Adding a new provider or theme requires minimal effort, and the REST API contract is clearly documented.

---

## Development

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend, port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm test` | Run Vitest unit tests |
| `node deploy/deploy.js all` | Build and publish everything via FTP |

## Requirements

- Node.js 20+, npm 10+
- An IMAP/SMTP mail account (optional — demo mode works without one)
- PHP 7.4+ with `php-imap` extension (for PHP bridge deployment)

## License

GNU General Public License v3.0
