# Provider Contract

Any backend that implements these endpoints can power the MailFrame frontend.

## Base URL

Configured via `VITE_API_BASE_URL`. All endpoints are relative to this base.

## Authentication

When running in API mode (bridge server), all endpoints except `/auth/*` require a valid session cookie.

Session cookies are set by `POST /auth/login` and cleared by `POST /auth/logout`.

---

## Auth Endpoints

### GET /auth/config

Public. Returns app configuration for the login page.

**Response:**
```json
{ "name": "MailFrame" }
```

### POST /auth/login

Validates the user's IMAP credentials against the server configured in `mailframe.config.json`. Issues a session cookie on success.

**Body:**
```json
{ "email": "user@example.com", "password": "secret" }
```

**Response (200):**
```json
{ "ok": true, "email": "user@example.com" }
```

**Response (401):**
```json
{ "error": "Invalid credentials" }
```

**Set-Cookie:** `mf_session=<token>; HttpOnly; SameSite=Lax; Path=/`

### GET /auth/me

Returns the currently authenticated user. Requires session cookie.

**Response (200):**
```json
{ "ok": true, "email": "user@example.com", "name": "MailFrame" }
```

**Response (401):**
```json
{ "error": "Not authenticated" }
```

### POST /auth/logout

Clears the session cookie and deletes the server-side session.

**Response:**
```json
{ "ok": true }
```

---

## Mail Endpoints

All mail endpoints require authentication (session cookie).

### GET /mailbox

Returns the folder list and message list for the active session.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `folder` | string | Folder ID (default: `INBOX`) |
| `page` | number | Page number (default: 1) |
| `q` | string | Search query (optional) |

**Response:**
```json
{
  "folders": [
    { "id": "INBOX", "label": "Inbox", "count": 42, "unreadCount": 3 },
    { "id": "Sent", "label": "Sent", "count": 120, "unreadCount": 0 }
  ],
  "messages": [
    {
      "id": "opaque-message-id",
      "sender": "Alice <alice@example.com>",
      "subject": "Hello",
      "preview": "Just wanted to say...",
      "timestamp": "10:42 AM",
      "unread": true,
      "starred": false
    }
  ],
  "meta": {
    "folder": "INBOX",
    "page": 1,
    "pageSize": 25,
    "totalResults": 42,
    "hasNextPage": true
  }
}
```

### GET /messages/:id

Returns full message detail including HTML body and attachments.

**Response:**
```json
{
  "id": "opaque-message-id",
  "sender": "Alice <alice@example.com>",
  "subject": "Hello",
  "timestamp": "10:42 AM",
  "bodyHtml": "<p>Paragraph one.</p><p>Paragraph two.</p>",
  "body": ["Paragraph one.", "Paragraph two."],
  "attachments": [
    { "partId": "2", "filename": "report.pdf", "size": 102400, "contentType": "application/pdf" }
  ]
}
```

### GET /messages/:id/attachments/:partId

Download a specific attachment.

**Response:** Binary file stream with appropriate `Content-Type` and `Content-Disposition: attachment` headers.

### POST /messages/move

Move one or more messages to a target folder.

**Body:**
```json
{ "ids": ["id1", "id2"], "targetFolder": "Archive" }
```

### POST /messages/delete

Delete one or more messages (moves to Trash or expunges).

**Body:**
```json
{ "ids": ["id1", "id2"] }
```

### POST /messages/mark

Mark messages as read or unread.

**Body:**
```json
{ "ids": ["id1"], "read": true }
```

### POST /messages/star

Star or unstar a message.

**Body:**
```json
{ "id": "id1", "starred": true }
```

### POST /messages/send

Send a composed message.

**Body:**
```json
{
  "to": "bob@example.com",
  "subject": "Re: Hello",
  "body": "Plain text fallback.",
  "bodyHtml": "<p>Rich HTML body.</p>",
  "replyToId": "opaque-message-id"
}
```

`bodyHtml` is optional. `replyToId` is optional (omit for new messages).

---

## Folder Management Endpoints

### POST /folders/create

Create a new IMAP folder.

**Body:**
```json
{ "name": "My Project" }
```

### POST /folders/delete

Delete an IMAP folder (must be empty).

**Body:**
```json
{ "path": "My Project" }
```

### POST /folders/empty

Permanently delete all messages in a folder.

**Body:**
```json
{ "mailbox": "Trash" }
```

---

## Message ID Format

Message IDs are opaque strings encoding `uid:base64url(mailbox)`. This allows the bridge to route any message operation to the correct IMAP mailbox without the client needing to track folder state.

---

## TypeScript Provider Interface

```typescript
type MailProvider = {
  // Required
  getMailboxSnapshot: (query?: MailboxQuery) => Promise<MailboxSnapshot>;
  getMessageDetail:   (messageId: string)    => Promise<MailMessageDetail>;

  // Optional write operations (UI disables actions if not provided)
  moveMessages?:   (ids: string[], targetFolderId: string) => Promise<void>;
  deleteMessages?: (ids: string[])                         => Promise<void>;
  markRead?:       (ids: string[], read: boolean)          => Promise<void>;
  toggleStar?:     (id: string,   starred: boolean)        => Promise<void>;
  sendMessage?:    (payload: SendPayload)                  => Promise<void>;
};
```

See `src/features/mail/provider.ts` for the full type definitions.
