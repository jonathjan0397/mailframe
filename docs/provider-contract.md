# Provider Contract

Any backend that implements these endpoints can power the frontend.

## Base URL

Configured via `VITE_API_BASE_URL`. All endpoints are relative to this base.

## Endpoints

### GET /mailbox

Returns the folder list and message list for the active session.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `folder` | string | Folder ID (default: inbox) |
| `page` | number | Page number (default: 1) |
| `q` | string | Search query |

**Response:**
```json
{
  "folders": [
    { "id": "INBOX", "label": "Inbox", "count": 42, "unreadCount": 3 }
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

Returns full message detail.

**Response:**
```json
{
  "id": "opaque-message-id",
  "sender": "Alice <alice@example.com>",
  "subject": "Hello",
  "timestamp": "10:42 AM",
  "body": ["Paragraph one.", "Paragraph two."]
}
```

### POST /messages/move

Move one or more messages to a target folder.

**Body:**
```json
{ "ids": ["id1", "id2"], "targetFolder": "Archive" }
```

### POST /messages/delete

Delete one or more messages.

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
  "body": "Message text.",
  "replyToId": "opaque-message-id"
}
```
