# MailFrame

An extensible, backend-agnostic IMAP webmail frontend with a drop-in theming system.

**Current version:** 1.12.0

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
| IMAP/SMTP bridge server | v1.8 |
| Compose with rich-text toolbar (bold, italic, underline, lists) | v1.10 |
| Thread view (group by subject) | v1.10 |
| Snooze messages (remind later / tomorrow / next weekday) | v1.11 |
| Drag-to-folder | v1.11 |
| Resizable message list pane | v1.11 |
| Login page with per-user IMAP auth | v1.12 |
| Session tokens (httpOnly cookie, configurable TTL) | v1.12 |
| Admin server config (`mailframe.config.json`) | v1.12 |
| Attachment download | v1.9 |
| Message search | v1.9 |
| Folder management (create, delete, empty) | v1.9 |

## Quick Start — Demo Mode

No credentials required. Demo data is built in.

```bash
npm install
npm run dev
# → http://localhost:5173
```

Switch to **Settings → Connection → Demo** if the API provider was previously selected.

## Deploying the Bridge Server

MailFrame ships with a standalone bridge server (`server/`) that speaks IMAP/SMTP and issues session tokens.

### 1. Configure server settings

Create `server/mailframe.config.json` (the bridge reads this at startup):

```json
{
  "imap": {
    "host": "mail.yourserver.com",
    "port": 993,
    "secure": true,
    "tls": { "rejectUnauthorized": true }
  },
  "smtp": {
    "host": "mail.yourserver.com",
    "port": 587,
    "secure": false,
    "requireTls": false
  },
  "app": {
    "name": "MailFrame",
    "sessionTtlHours": 24,
    "allowedDomains": ["yourcompany.com"]
  }
}
```

| Field | Description |
|---|---|
| `imap.*` | IMAP connection — host, port, TLS settings |
| `smtp.*` | SMTP connection — host, port, STARTTLS settings |
| `app.name` | Displayed on the login page |
| `app.sessionTtlHours` | How long a login session lasts |
| `app.allowedDomains` | Restrict login to these email domains. Empty array = allow all. |

### 2. Build and start the server

```bash
cd server
npm install
npm run build
node dist/index.js
# → http://localhost:4010
```

For production use PM2 or a similar process manager:

```bash
npm install -g pm2
pm2 start dist/index.js --name mailframe-api
pm2 save
```

### 3. Configure the Apache reverse proxy

The frontend calls `/api/*` — Apache must proxy those requests to the bridge. Add to your VirtualHost config (not `.htaccess`):

```apache
ProxyPass        /api/ http://localhost:4010/
ProxyPassReverse /api/ http://localhost:4010/
```

### 4. Build and deploy the frontend

```bash
# From repo root:
VITE_API_BASE_URL=/api npm run build
# dist/ is ready to upload to /mailframe/ on your web server
```

Or use the deploy script (see [Deploy Script](#deploy-script) below).

### 5. Log in

Navigate to your hosted URL. MailFrame shows a login page — enter your email address and IMAP password. The server validates credentials against the IMAP host in `mailframe.config.json` and issues a session cookie.

## Deploy Script

`deploy/deploy.js` automates building and publishing to the hosted server via FTP.

```bash
# Prerequisites: set FTP credentials in environment or ~/.claude/settings.json
# FTP_HOST, FTP_USER, FTP_PASS, FTP_ROOT

node deploy/deploy.js              # deploy showcase + all registered projects
node deploy/deploy.js showcase     # showcase landing page only
node deploy/deploy.js mailframe    # frontend + bridge server
node deploy/deploy.js mailframe-api  # bridge server only
```

## Adding a Theme

1. Create `src/themes/mytheme.ts` implementing `ThemeTokens`:

```typescript
import type { ThemeTokens } from "./tokens";

export const myTheme: ThemeTokens = {
  id: "mytheme",
  label: "My Theme",
  description: "Short description shown in settings.",
  family: "mytheme",

  colorBg: "#f0f0f0",
  colorSurface: "#ffffff",
  colorSurfaceAlt: "#f8f8f8",
  colorBorder: "#e0e0e0",
  colorText: "#111111",
  colorTextMuted: "#666666",
  colorTextInverse: "#ffffff",
  colorAccent: "#e84040",
  colorAccentHover: "#c03030",
  colorAccentText: "#ffffff",
  colorUnread: "#e84040",
  colorSelected: "#fde8e8",
  colorHover: "#f5f5f5",
  radiusSm: "4px",
  radiusMd: "8px",
  radiusLg: "16px",
  fontBase: "system-ui, sans-serif",
  fontMono: "monospace",
  fontSizeBase: "14px",
  fontSizeSm: "12px",
  fontSizeLg: "16px",
  fontWeightNormal: "400",
  fontWeightMedium: "500",
  fontWeightBold: "700",
  sidebarWidth: "220px",
  listWidth: "380px",
};
```

2. Register it in `src/themes/registry.ts`:

```typescript
import { myTheme } from "./mytheme";

export const themeRegistry: ThemeTokens[] = [
  lumenTheme,
  auroraTheme,
  myTheme,   // ← add here
];
```

The theme appears in **Settings → Appearance** and on the login page immediately.

## Architecture

```
MailFrame Frontend (React + TypeScript + Vite)
  ├── src/app/           UI shell (App, LoginPage, ComposeModal, SettingsPanel)
  ├── src/themes/        Token system + built-in themes + registry
  ├── src/features/mail/ Provider contract + demo/API providers
  └── src/lib/           Shared types

MailFrame Bridge Server (Node.js + Express)
  ├── mailframe.config.json  Admin server/app settings
  ├── src/config.ts      Config loader (falls back to env vars)
  ├── src/session.ts     In-memory session store (UUID tokens, hourly GC)
  ├── src/imap.ts        imapflow IMAP client (per-user credentials)
  ├── src/smtp.ts        nodemailer SMTP transport (per-user credentials)
  ├── src/encode.ts      Opaque message ID encoding (uid:base64url(mailbox))
  └── src/index.ts       REST API + auth endpoints
```

### Auth Flow

```
Browser          Frontend        Bridge Server       IMAP
  │                │                  │                │
  │  GET /mailframe/│                  │                │
  │◄────────────────│                  │                │
  │                 │                  │                │
  │  POST /api/auth/login              │                │
  │─────────────────────────────────►  │                │
  │                 │         getFolders(creds)         │
  │                 │                  │─────────────►  │
  │                 │                  │◄─────────────  │
  │◄─────────────────────────────────  │                │
  │  Set-Cookie: mf_session=<token>    │                │
  │                                    │                │
  │  GET /api/mailbox (with cookie)    │                │
  │─────────────────────────────────►  │                │
  │           requireAuth middleware   │                │
  │                  │         getMailbox(creds, ...)   │
  │                  │                  │─────────────► │
```

### Provider Contract

Any backend that implements `MailProvider` (see `src/features/mail/provider.ts`) can power the frontend. Read methods are required; write methods are optional — the UI disables actions the provider does not support.

See [docs/provider-contract.md](docs/provider-contract.md) for the full REST API specification.

## Development

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend, port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm test` | Run Vitest unit tests (frontend) |
| `cd server && npm install && npm start` | Start bridge server (port 4010) |
| `cd server && npm test` | Run Vitest unit tests (server) |
| `node deploy/deploy.js` | Build and publish to hosted server via FTP |

## Requirements

- Node.js 20+, npm 10+
- An IMAP/SMTP mail account (optional — demo mode works without one)

## License

GNU General Public License v3.0
