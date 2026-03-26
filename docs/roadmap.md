# Roadmap

## Completed

### v1.1 — Core Shell
- [x] App shell layout (sidebar, message list, reading pane)
- [x] Provider contract v1 (read: folders, messages, message detail)
- [x] Demo provider (fixture-backed, no backend required)
- [x] Theme registry and token system
- [x] Base theme (Lumen)

### v1.2 — Mutations
- [x] Provider contract v2 (write: move, delete, star, mark read)
- [x] Demo provider mutation support

### v1.3 — Compose
- [x] Compose, reply, forward flows
- [x] SMTP send via bridge server

### v1.4 — Theming + Polish
- [x] Drop-in theme system (CSS custom properties via ThemeTokens)
- [x] Settings panel (connection, appearance)
- [x] Aurora theme (purple accent)
- [x] Responsive layout

### v1.8 — IMAP Bridge
- [x] Generic IMAP/SMTP bridge server (Node.js + Express + imapflow)
- [x] Opaque message ID encoding
- [x] Folder list, message list, message detail, send
- [x] Move, delete, star, mark-read

### v1.9 — Advanced Features
- [x] Attachment download
- [x] Message search
- [x] Folder management (create, delete, empty)
- [x] Pagination

### v1.10 — Rich Compose + Threads
- [x] Rich-text compose toolbar (bold, italic, underline, ordered/unordered lists)
- [x] DOMPurify paste sanitization
- [x] Thread view (group messages by normalized subject)
- [x] Expandable thread panel

### v1.11 — Productivity
- [x] Snooze messages (remind later / tomorrow / next weekday)
- [x] Drag-to-folder
- [x] Resizable message list pane (drag handle, persisted to localStorage)

### v1.12 — Auth + Deployment
- [x] Login page with per-user IMAP credential validation
- [x] Session tokens (httpOnly cookie, configurable TTL, hourly GC)
- [x] Admin server config file (`mailframe.config.json`)
- [x] `GET /auth/config` public endpoint (returns app name for login page)
- [x] `GET /auth/me`, `POST /auth/login`, `POST /auth/logout`
- [x] `allowedDomains` restriction
- [x] FTP deploy script (`deploy/deploy.js`) with showcase landing page
- [x] Subdirectory deployment support (`vite base: "/mailframe/"`)

## Planned

### v1.13 — UX Polish
- [ ] Keyboard shortcuts (j/k navigation, r reply, f forward, e archive)
- [ ] Unread count badges on sidebar folders
- [ ] Toast notifications for send / move / delete

### v1.14 — Mobile
- [ ] Mobile-first responsive redesign
- [ ] Swipe gestures (archive, delete)
- [ ] Bottom navigation bar

### v2.0 — Extensibility
- [ ] Plugin API for custom providers
- [ ] Webhook / push notification support
- [ ] OAuth2 provider (Gmail, Outlook)
