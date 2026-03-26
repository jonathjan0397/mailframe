# PHP Bridge — FTP-only Deployment

The PHP bridge provides the same REST API as the Node bridge but runs as a PHP script served by Apache — no shell access, no Node.js, no Composer required. If your host gives you FTP and a PHP-enabled web server (cPanel, CWP, Plesk, DirectAdmin), this is the easiest path.

## Requirements

- PHP 7.4+ (most shared hosts run PHP 8.x)
- `php-imap` extension enabled (standard on cPanel / CWP — verify in your host's PHP settings)
- Apache `mod_rewrite` enabled (standard everywhere)

## File layout after upload

```
public_html/
  .htaccess                   ← routes /api/* to the PHP bridge
  mailframe/                  ← Vite frontend (index.html, assets/)
  mailframe-api/
    index.php                 ← PHP bridge
    mailframe.config.json     ← server config  ← EDIT THIS
    .htaccess                 ← blocks direct access to config file
```

## Step 1 — Upload the PHP bridge

```bash
node deploy/deploy.js mailframe-php
```

Or manually via FTP: upload the contents of `server-php/` to `public_html/mailframe-api/`.

## Step 2 — Configure the server

Edit `public_html/mailframe-api/mailframe.config.json` with your mail server settings:

```json
{
  "imap": {
    "host": "localhost",
    "port": 993,
    "secure": true,
    "tls": { "rejectUnauthorized": false }
  },
  "smtp": {
    "host": "localhost",
    "port": 587,
    "secure": false,
    "requireTls": false
  },
  "app": {
    "name": "MailFrame",
    "sessionTtlHours": 24,
    "allowedDomains": []
  }
}
```

| Field | Description |
|---|---|
| `imap.host` | Mail server hostname (`localhost` for same-server mail) |
| `imap.tls.rejectUnauthorized` | Set `false` for self-signed certificates (common on local servers) |
| `smtp.requireTls` | Set `true` if your SMTP server requires STARTTLS |
| `app.allowedDomains` | Restrict logins to specific email domains. `[]` = allow all |

## Step 3 — Upload the root .htaccess

```bash
node deploy/deploy.js htaccess
```

The default `deploy/htaccess-root` uses the PHP bridge (Option A). If you later switch to the Node bridge, edit that file to uncomment Option B and re-run this command.

This `.htaccess` rewrites `/api/*` → `/mailframe-api/index.php?_route=*`. Standard URL rewriting — no `ProxyPass`, no special Apache permissions needed.

## Step 4 — Upload the frontend

```bash
node deploy/deploy.js mailframe
```

Or to deploy everything at once:

```bash
node deploy/deploy.js            # showcase + mailframe frontend + PHP bridge + htaccess skipped (run separately)
node deploy/deploy.js htaccess   # upload the .htaccess separately
```

## Step 5 — Test

Visit `https://yourdomain.com/mailframe/` — you should see the login page. Enter your IMAP email and password. The PHP bridge validates credentials against the IMAP server in `mailframe.config.json`.

Check `https://yourdomain.com/api/health` — should return `{"ok":true,"service":"mailframe-php-bridge"}`.

## Troubleshooting

**Login fails immediately**
- Check that `php-imap` is enabled: log in to your control panel → PHP extensions → enable `imap`
- Check `imap.host`/`port` in `mailframe.config.json` match your actual mail server
- Try `"rejectUnauthorized": false` in `imap.tls` if you get SSL errors

**500 error on `/api/*`**
- Usually means `mod_rewrite` isn't enabled or `AllowOverride` is set to `None`
- In CWP: Apache Manager → Global Settings → set `AllowOverride All`
- In cPanel: normally enabled by default

**`/api/health` returns the HTML login page instead of JSON**
- The `.htaccess` isn't being read — check `AllowOverride` as above

**SMTP send fails**
- Verify `smtp.host`, `smtp.port`, `smtp.secure` in config
- Try setting `"requireTls": true` if your server requires STARTTLS on port 587
- Try `"secure": true` with port 465 for implicit TLS

## Switching between PHP and Node bridge

Both bridges use the same remote directory (`mailframe-api/`) and the same API contract, so the frontend doesn't care which one is active.

To switch from PHP → Node: deploy the Node bridge (`mailframe-api` target), update `htaccess-root` to use Option B, and upload it.

To switch from Node → PHP: deploy the PHP bridge (`mailframe-php` target), update `htaccess-root` to use Option A, and upload it.
