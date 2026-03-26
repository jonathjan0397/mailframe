# Changelog

## 1.7.0 — 2026-03-26

Dark themes (Eclipse + Midnight), new-mail polling badge, draft auto-save.

### Added
- **Eclipse theme** — dark Lumen variant; neutral dark grays, soft `#8ab4f8` blue accent, same shape language as Lumen
- **Midnight theme** — dark Aurora variant; deep `#0f0d17` purples, vibrant `#bb86fc` lilac accent, same rounded radius as Aurora
- **New-mail polling** — every 60 seconds (when connected to a bridge server) the active folder is checked for incoming messages; a pulsing **"N new ↑"** badge appears in the list header; clicking it performs a silent full refresh without disrupting the current reading session
- **Draft auto-save** — compose fields auto-save to `localStorage` (500ms debounce) for new compositions; draft is restored when you open New Message; discarded when you send or click Discard; reply/forward windows are not affected
- **Draft saved indicator** — subtle "Draft saved" label appears in compose footer once content has been persisted

### Changed
- `ComposeModal.tsx` rewritten: `loadDraft()` helper, `isDraftTarget` guard, `handleDiscard` explicitly clears draft, improved `aria-label` on dialog and inputs, `htmlFor` on compose field labels
- `App.tsx` — added `refreshToken` state (increment triggers mailbox reload without unmounting); `messageIdsRef` keeps message IDs in sync for polling without dep-array staleness; `handleManualRefresh` resets new count and bumps token

---

## 1.6.0 — 2026-03-26

HTML email rendering, load-more pagination, `.gitattributes`, GitHub release.

### Added
- **HTML email rendering** — server now fetches HTML MIME parts (1, 1.1, 1.2, 2) in addition to plain text; frontend renders HTML emails using `DOMPurify.sanitize()` with an explicit allowlist of safe tags and attributes; plain-text fallback for emails with no HTML part
- **Load more pagination** — "Load more" button appears at the bottom of the message list when `hasNextPage` is true; appends the next 25 messages without resetting the list; `page` state tracks current depth; disabled during load
- **`.gitattributes`** — enforces LF line endings on commit for all text files; eliminates CRLF warnings on Windows
- `bodyHtml?: string` field added to `MailMessageDetail` type; both the bridge server response and frontend type are updated

### Changed
- `server/src/imap.ts` — `getMessage` now fetches parts `["1", "1.1", "1.2", "2", "TEXT"]` and uses a heuristic (`<!doctype`, `<html`, `<body`, `<p>`, `<div`, `<table`) to separate HTML from plain-text parts; returns `bodyHtml` when found
- `src/app/App.tsx` — mailbox effect now resets `page` and `hasNextPage` on context change; `handleLoadMore` appends without re-fetching existing messages
- Reading pane switches between `mf-pane-html` (HTML emails) and `mf-pane-body` (plain text) based on `bodyHtml` presence

---

## 1.5.0 — 2026-03-26

Virtualized message list, loading/error states, unit test suite, full README.

### Added
- **Virtualized message list** — `@tanstack/react-virtual` replaces static render; only visible rows are in the DOM; handles mailboxes with thousands of messages at constant render cost
- **Loading skeleton** — shimmer animation while mailbox is fetching; 5 placeholder rows with CSS `@keyframes mf-shimmer` gradient sweep
- **Error state** — alert banner in message list if provider throws (network error, auth failure, etc.); includes error message text
- **Empty state** — "No messages" placeholder when a folder is empty or search returns nothing
- **Cancellation tokens** — mailbox fetch is now cancellable (prevents stale responses after rapid folder/provider switching)
- **Vitest (frontend)** — `src/app/App.test.tsx` (5 smoke tests), `src/themes/registry.test.ts` (6 token-coverage tests); run with `npm test`
- **Vitest (server)** — `server/src/encode.test.ts` (10 round-trip + edge-case tests); run with `cd server && npm test`
- **README.md** — complete rewrite: quick start, bridge server setup, theme authoring guide, provider contract reference, architecture diagram, command table

### Changed
- `package.json` — added `test` and `test:watch` scripts
- `vite.config.ts` — Vitest configured with jsdom environment + `@testing-library/jest-dom` setup

### Test results
- Frontend: **21 tests passed** (3 files)
- Server: **10 tests passed** (1 file)

---

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
