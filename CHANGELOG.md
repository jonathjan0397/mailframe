# Changelog

## 1.4.0 — 2026-03-26

Settings panel, drop-in theme system, accessibility pass, responsive layout.

### Added
- `src/themes/registry.ts` — `themeRegistry[]` array; add a theme here to make it available everywhere
- `src/app/SettingsPanel.tsx` — slide-in settings drawer (right edge) with:
  - **Appearance** — theme cards with accent swatch + name + description; active theme highlighted
  - **Connection** — data source selector (Demo fixture data / Bridge server); shows API URL hint when bridge is selected
- Gear (⚙) button in sidebar footer opens settings; focus returns to it on close
- Mobile hamburger (☰) toggle in message list header shows/hides off-canvas sidebar
- Mobile "← Back" button in reading pane returns to message list
- `description` field on `ThemeTokens` (optional); populated in Lumen and Aurora themes

### Changed
- `App.tsx` — provider is now switchable at runtime via Settings (`demo` → `apiProvider`); uses `useMemo` so switching reloads data automatically
- Theme switcher removed from sidebar — moved into Settings panel as visual cards
- All structural elements now carry ARIA roles and labels (`aria-label`, `aria-selected`, `aria-pressed`, `aria-live`, `role="toolbar"`, `role="article"`, etc.)
- Folder items and message rows are keyboard-navigable (Tab + Enter/Space)
- Toast uses `role="status"` + `aria-live="polite"`
- Cancellation token in detail-fetch effect prevents stale responses from setting state after navigation

### Responsive
- `≤ 900px` — message list narrows to 300px
- `≤ 768px` — sidebar off-canvas (fixed, z-indexed, `transform: translateX`); message list full width; reading pane overlays full screen when message selected

---

## 1.3.0 — 2026-03-26

IMAP/SMTP bridge server. MailFrame can now connect to a real email account.

### Added
- `server/` — standalone Express bridge server (`mailframe-server`)
  - `server/src/imap.ts` — imapflow-based IMAP client: folder listing, paginated mailbox, message fetch, move, delete, mark read, star
  - `server/src/smtp.ts` — nodemailer SMTP transport for outbound send
  - `server/src/encode.ts` — opaque message ID encoding (`uid:base64url(mailbox)`)
  - `server/src/index.ts` — REST API: `GET /mailbox`, `GET /messages/:id`, `POST /messages/move|delete|mark|star|send`, `GET /health`
  - `server/.env.example` — IMAP/SMTP/server environment variable template
- `src/features/mail/providers/api-provider.ts` — frontend provider that calls the bridge server
- `src/vite-env.d.ts` — Vite environment type reference (enables `import.meta.env.VITE_*`)
- `.env.example` — frontend environment variable template (`VITE_API_BASE_URL`)

### Notes
- Bridge server is stateless — one IMAP connection per request
- Switch from demo to live mail: set `VITE_API_BASE_URL` and use `apiProvider` in `App.tsx`
- Server ships as an independent npm package; configure and run alongside the frontend

---

## 1.2.0 — 2026-03-26

Full mutation support and compose modal.

### Added
- Multi-select with checkbox column and bulk action bar (Archive, Trash, Mark read/unread)
- Compose modal with To/Subject/Body fields; reply pre-fills recipient + `Re:` subject; forward pre-fills `Fwd:` subject + quoted body
- Optimistic UI — message list updates immediately on delete/move; reverts on server error
- Toast notification system for action feedback
- `POST /messages/move`, `POST /messages/delete`, `POST /messages/mark`, `POST /messages/star`, `POST /messages/send` in provider contract
- Star toggle on individual message rows
- Auto-mark-read when message opened

---

## 1.1.0 — 2026-03-26

Core shell, Lumen and Aurora themes.

### Added
- Three-pane shell layout (sidebar + message list + reading pane)
- CSS custom property token system (`--mf-*`) for full theme swaps
- Lumen theme — Gmail-inspired (white surfaces, `#1a73e8` accent, Google Sans)
- Aurora theme — Yahoo-inspired (purple palette, `#6001d2` accent, rounded corners)
- Theme switcher in sidebar footer
- Provider contract (`MailProvider`) with optional write methods
- Demo provider with fixture data for development
- `MailboxQuery` (folder, page, search) and `MailboxSnapshot` types

---

## 1.0.0 — 2026-03-26

Initial release. Clean scaffold for MailFrame — an extensible IMAP webmail frontend with easy theming and UI system.

### Included
- Project structure and architecture direction
- Provider contract specification
- Theme registry scaffold
- Core mail type definitions
- Roadmap through v1.5
