# MailFrame

An extensible, backend-agnostic IMAP webmail frontend with a drop-in theming system.

## Overview

MailFrame is a production-quality webmail shell built in React + TypeScript. It connects to any IMAP/SMTP-compatible mail server through a thin bridge server, and swaps visual styles through a token-based theming system — no component changes required.

**Bundled themes:** Lumen (clean, blue accent) · Aurora (rich, purple accent)

## Quick Start — Demo Mode

No credentials required. Demo data is built in.

```bash
npm install
npm run dev
# → http://localhost:5173
```

## Connecting to a Real Mail Account

MailFrame ships with a standalone bridge server that speaks IMAP/SMTP.

**1. Configure the bridge server**

```bash
cd server
cp .env.example .env
# edit .env with your IMAP/SMTP credentials
```

```ini
# server/.env
IMAP_HOST=imap.yourprovider.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=you@example.com
IMAP_PASS=yourpassword

SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_PASS=yourpassword
SMTP_FROM=Your Name <you@example.com>
```

**2. Start the bridge server**

```bash
cd server
npm install
npm start
# → http://localhost:4010
```

**3. Configure the frontend**

```bash
# In the repo root:
cp .env.example .env.local
# VITE_API_BASE_URL=http://localhost:4010   (already set)
```

**4. Switch the data source**

Open **Settings** (⚙ gear icon in the sidebar) → Connection → select **Bridge server (IMAP/SMTP)**.

The frontend hot-reloads the provider without a page refresh.

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

The theme appears in **Settings → Appearance** immediately.

## Architecture

```
MailFrame Frontend (React + TypeScript + Vite)
  ├── src/app/           UI shell (App, ComposeModal, SettingsPanel)
  ├── src/themes/        Token system + built-in themes + registry
  ├── src/features/mail/ Provider contract + demo/API providers
  └── src/lib/           Shared types

MailFrame Bridge Server (Node.js + Express)
  ├── src/imap.ts        imapflow IMAP client (one connection per request)
  ├── src/smtp.ts        nodemailer SMTP transport
  ├── src/encode.ts      Opaque message ID encoding (uid:base64url(mailbox))
  └── src/index.ts       REST API (GET /mailbox, GET /messages/:id, POST /messages/*)
```

### Provider Contract

Any backend that implements `MailProvider` (see `src/features/mail/provider.ts`) can
power the frontend. Read methods are required; write methods are optional — the UI
disables actions the provider does not support.

```typescript
type MailProvider = {
  getMailboxSnapshot: (query?: MailboxQuery) => Promise<MailboxSnapshot>;
  getMessageDetail:  (messageId: string)    => Promise<MailMessageDetail>;
  moveMessages?:     (ids: string[], targetFolderId: string) => Promise<void>;
  deleteMessages?:   (ids: string[])                         => Promise<void>;
  markRead?:         (ids: string[], read: boolean)          => Promise<void>;
  toggleStar?:       (id: string,   starred: boolean)        => Promise<void>;
  sendMessage?:      (payload: SendPayload)                  => Promise<void>;
};
```

## Development

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend, port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm test` | Run Vitest unit tests (frontend) |
| `cd server && npm start` | Start bridge server (port 4010) |
| `cd server && npm test` | Run Vitest unit tests (server) |

## Requirements

- Node.js 20+, npm 10+
- An IMAP/SMTP mail account (optional — demo mode works without one)

## License

GNU General Public License v3.0
