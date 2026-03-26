<?php
/**
 * MailFrame PHP Bridge — FTP-deployable IMAP/SMTP backend for shared hosting.
 *
 * Requirements: PHP 7.4+, php-imap extension (standard on cPanel / CWP / Plesk).
 * No Composer, no shell access, no Node.js — upload via FTP and configure.
 *
 * File layout on the server:
 *   public_html/
 *     .htaccess                   ← routes /api/* to this script
 *     mailframe/                  ← Vite frontend dist
 *     mailframe-api/
 *       index.php                 ← this file
 *       mailframe.config.json     ← server config (not web-accessible, see .htaccess)
 *       .htaccess                 ← blocks direct config access
 *
 * See docs/php-bridge.md for full setup instructions.
 */

declare(strict_types=1);
error_reporting(0); // suppress PHP warnings from appearing in JSON responses

// ── Config ──────────────────────────────────────────────────────────────────

function mf_load_config(): array {
    foreach ([__DIR__ . '/mailframe.config.json', __DIR__ . '/../mailframe.config.json'] as $p) {
        if (file_exists($p)) {
            $d = json_decode(file_get_contents($p), true);
            if (is_array($d)) return $d;
        }
    }
    // Env-var fallback (useful for platforms that inject env but not files)
    return [
        'imap' => [
            'host'   => getenv('IMAP_HOST') ?: 'localhost',
            'port'   => (int)(getenv('IMAP_PORT') ?: 993),
            'secure' => (getenv('IMAP_SECURE') ?: 'true') !== 'false',
            'tls'    => ['rejectUnauthorized' => false],
        ],
        'smtp' => [
            'host'       => getenv('SMTP_HOST') ?: 'localhost',
            'port'       => (int)(getenv('SMTP_PORT') ?: 587),
            'secure'     => (getenv('SMTP_SECURE') ?: 'false') !== 'false',
            'requireTls' => true,
        ],
        'app'  => [
            'name'            => getenv('APP_NAME') ?: 'MailFrame',
            'sessionTtlHours' => 24,
            'allowedDomains'  => [],
        ],
    ];
}

$MF_CFG = mf_load_config();

// ── Bootstrap ────────────────────────────────────────────────────────────────

// CORS — needed when the Vite dev server (localhost:5173) calls the bridge.
// In production (same origin) these headers are harmless.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// Session — use the same cookie name as the Node bridge ("mf_session")
session_name('mf_session');
session_set_cookie_params([
    'lifetime' => 0,          // browser-session; max-age enforced server-side
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// Request
$mf_method = $_SERVER['REQUEST_METHOD'];
$mf_route  = trim($_GET['_route'] ?? parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '', '/');
// Strip a leading "api/" prefix in case the rewrite passes it through
$mf_route = preg_replace('#^api/#', '', $mf_route);

$mf_body = [];
$raw = file_get_contents('php://input');
if ($raw) $mf_body = json_decode($raw, true) ?? [];

// ── Output helpers ───────────────────────────────────────────────────────────

function mf_json(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function mf_err(string $msg, int $status = 400): never {
    mf_json(['error' => $msg], $status);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function mf_require_auth(): array {
    global $MF_CFG;
    $ttl = isset($_SESSION['mf_ttl'])
        ? (int)$_SESSION['mf_ttl']
        : (int)(($MF_CFG['app']['sessionTtlHours'] ?? 24) * 3600);

    // Multi-account session structure
    if (!empty($_SESSION['mf_accounts']) && !empty($_SESSION['mf_active'])) {
        $email = $_SESSION['mf_active'];
        $acct  = $_SESSION['mf_accounts'][$email] ?? null;
        if (!$acct) mf_err('Not authenticated.', 401);
        if ((time() - (int)($acct['created'] ?? 0)) > $ttl) {
            unset($_SESSION['mf_accounts'][$email]);
            if (empty($_SESSION['mf_accounts'])) {
                session_destroy();
            } else {
                $_SESSION['mf_active'] = (string)array_key_first($_SESSION['mf_accounts']);
            }
            mf_err('Session expired.', 401);
        }
        return ['user' => $email, 'pass' => $acct['pass']];
    }

    // Legacy single-account fallback
    if (!empty($_SESSION['mf_email']) && !empty($_SESSION['mf_pass'])) {
        if ((time() - (int)($_SESSION['mf_created'] ?? 0)) > $ttl) {
            session_destroy();
            mf_err('Session expired.', 401);
        }
        return ['user' => $_SESSION['mf_email'], 'pass' => $_SESSION['mf_pass']];
    }

    mf_err('Not authenticated.', 401);
}

// ── Message ID encode / decode ────────────────────────────────────────────────
// Format matches the Node bridge: {uid}:{base64url(mailbox)}

function mf_encode_id(int $uid, string $mailbox): string {
    return $uid . ':' . rtrim(strtr(base64_encode($mailbox), '+/', '-_'), '=');
}

function mf_decode_id(string $id): ?array {
    $pos = strpos($id, ':');
    if ($pos === false) return null;
    $uid = (int)substr($id, 0, $pos);
    if ($uid <= 0) return null;
    $b64url = substr($id, $pos + 1);
    $b64    = strtr($b64url, '-_', '+/');
    $pad    = strlen($b64) % 4;
    if ($pad) $b64 .= str_repeat('=', 4 - $pad);
    $mailbox = base64_decode($b64, true);
    return ($mailbox !== false) ? ['uid' => $uid, 'mailbox' => $mailbox] : null;
}

// ── IMAP helpers ─────────────────────────────────────────────────────────────

function mf_imap_server(): string {
    global $MF_CFG;
    $host   = $MF_CFG['imap']['host'];
    $port   = (int)($MF_CFG['imap']['port'] ?? 993);
    $secure = !empty($MF_CFG['imap']['secure']);
    $tls    = $MF_CFG['imap']['tls'] ?? [];
    $flags  = $secure ? '/ssl' : '/notls';
    // Add /novalidate-cert when server uses self-signed cert (common on local mail servers)
    if (isset($tls['rejectUnauthorized']) && $tls['rejectUnauthorized'] === false) {
        $flags .= '/novalidate-cert';
    }
    return '{' . $host . ':' . $port . '/imap' . $flags . '}';
}

/** Open an IMAP connection. $mailbox is appended to the server string (e.g. "INBOX"). */
function mf_imap_open(array $creds, string $mailbox = ''): mixed {
    $server = mf_imap_server();
    set_error_handler(function() {});
    $conn = imap_open($server . $mailbox, $creds['user'], $creds['pass'], 0, 1,
                      ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    restore_error_handler();
    if (!$conn) {
        $errs = imap_errors() ?: [];
        mf_err(implode('; ', $errs) ?: 'IMAP connection failed.', 401);
    }
    return $conn;
}

function mf_folder_label(string $name): string {
    $map = [
        'INBOX' => 'Inbox', 'Sent' => 'Sent', 'Sent Items' => 'Sent',
        'Drafts' => 'Drafts', 'Trash' => 'Trash',
        'Junk' => 'Spam', 'Spam' => 'Spam', 'Archive' => 'Archive',
    ];
    if (isset($map[$name])) return $map[$name];
    $parts = preg_split('#[./]#', $name);
    return ucwords(str_replace('_', ' ', (string)end($parts)));
}

function mf_format_ts(int $ts): string {
    if (!$ts) return '';
    $today = mktime(0, 0, 0);
    $year  = mktime(0, 0, 0, 1, 1, (int)date('Y'));
    if ($ts >= $today)  return date('g:i A', $ts);
    if ($ts >= $year)   return date('M j', $ts);
    return date('M j, Y', $ts);
}

function mf_decode_header(string $s): string {
    $parts = imap_mime_header_decode($s);
    $out   = '';
    foreach ($parts as $p) {
        $text = $p->text;
        $cs   = strtolower($p->charset);
        if ($cs && $cs !== 'default' && $cs !== 'utf-8') {
            $text = @mb_convert_encoding($text, 'UTF-8', $cs) ?: $text;
        }
        $out .= $text;
    }
    return $out;
}

// MIME type constants (imap_fetchstructure()->type values)
const MF_ENC_7BIT   = 0;
const MF_ENC_8BIT   = 1;
const MF_ENC_BINARY = 2;
const MF_ENC_BASE64 = 3;
const MF_ENC_QPRINT = 4;

function mf_decode_part(string $data, int $encoding): string {
    return match($encoding) {
        MF_ENC_BASE64 => base64_decode(str_replace(["\r", "\n"], '', $data)),
        MF_ENC_QPRINT => quoted_printable_decode($data),
        default       => $data,
    };
}

/**
 * Walk imap_fetchstructure() recursively, collecting:
 *   $out['text']        — ['section', 'encoding', 'charset']
 *   $out['html']        — same
 *   $out['attachments'] — ['partId', 'filename', 'mimeType', 'size', 'encoding']
 */
function mf_walk_struct(object $s, string $sec, array &$out): void {
    if (!empty($s->parts) && is_array($s->parts)) {
        foreach ($s->parts as $i => $child) {
            $sub = ($sec === '') ? (string)($i + 1) : "$sec." . ($i + 1);
            mf_walk_struct($child, $sub, $out);
        }
        return;
    }

    $type    = (int)($s->type ?? 0);
    $subtype = strtolower((string)($s->subtype ?? ''));
    $disp    = strtolower((string)($s->disposition ?? ''));
    $enc     = (int)($s->encoding ?? 0);
    $charset = 'utf-8';

    // Extract charset from parameters
    if (!empty($s->parameters)) {
        foreach ($s->parameters as $p) {
            if (strtolower($p->attribute) === 'charset') {
                $charset = strtolower($p->value);
            }
        }
    }

    // Collect filename from disposition or type parameters
    $filename = null;
    foreach ($s->dparameters ?? [] as $p) {
        if (strtolower($p->attribute) === 'filename') {
            $filename = mf_decode_header($p->value);
        }
    }
    if (!$filename) {
        foreach ($s->parameters ?? [] as $p) {
            if (in_array(strtolower($p->attribute), ['name', 'filename'], true)) {
                $filename = mf_decode_header($p->value);
            }
        }
    }

    $section = $sec ?: '1';

    if ($type === 0 && $subtype === 'plain' && $disp !== 'attachment' && !$filename) {
        $out['text'][] = ['section' => $section, 'encoding' => $enc, 'charset' => $charset];
    } elseif ($type === 0 && $subtype === 'html' && $disp !== 'attachment' && !$filename) {
        $out['html'][] = ['section' => $section, 'encoding' => $enc, 'charset' => $charset];
    } elseif ($type === 5 && !empty($s->id) && $disp !== 'attachment') {
        // Inline image with a Content-ID (used in multipart/related HTML emails)
        $cid = trim((string)$s->id, '<> ');
        if ($cid) {
            $mime_prefix = 'image';
            $out['inline'][] = [
                'partId'   => $section,
                'cid'      => $cid,
                'mimeType' => "$mime_prefix/$subtype",
                'encoding' => $enc,
            ];
        }
    } elseif ($filename) {
        $mime_prefix = match($type) {
            0 => 'text', 1 => 'multipart', 2 => 'message',
            3 => 'application', 4 => 'audio', 5 => 'image', 6 => 'video',
            default => 'application',
        };
        $out['attachments'][] = [
            'partId'   => $section,
            'filename' => $filename,
            'mimeType' => "$mime_prefix/$subtype",
            'size'     => (int)($s->bytes ?? 0),
            'encoding' => $enc,
        ];
    }
}

// ── SMTP helper (socket-based, zero dependencies) ─────────────────────────────

function mf_smtp_send(array $creds, array $payload): void {
    global $MF_CFG;
    $host       = (string)($MF_CFG['smtp']['host'] ?? 'localhost');
    $port       = (int)($MF_CFG['smtp']['port'] ?? 587);
    $secure     = !empty($MF_CFG['smtp']['secure']);
    $requireTls = !isset($MF_CFG['smtp']['requireTls']) || $MF_CFG['smtp']['requireTls'];

    $from    = $creds['user'];
    $to      = (string)($payload['to'] ?? '');
    $cc      = (string)($payload['cc'] ?? '');
    $bcc     = (string)($payload['bcc'] ?? '');
    $subject = (string)($payload['subject'] ?? '(No subject)');
    $text    = (string)($payload['body'] ?? '');
    $html    = isset($payload['bodyHtml']) ? (string)$payload['bodyHtml'] : null;

    // Connect
    $errno = 0; $errstr = '';
    $conn = $secure
        ? @fsockopen("ssl://$host", $port, $errno, $errstr, 15)
        : @fsockopen($host, $port, $errno, $errstr, 15);
    if (!$conn) mf_err("SMTP connect failed: $errstr", 500);

    $read = static function() use ($conn): string {
        $r = '';
        while (($line = fgets($conn, 512)) !== false) {
            $r .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $r;
    };
    $write = static function(string $cmd) use ($conn): void {
        fwrite($conn, $cmd . "\r\n");
    };

    $read();                     // server banner
    $write("EHLO mailframe");
    $ehlo = $read();

    // STARTTLS upgrade when not already SSL
    if (!$secure && $requireTls && stripos($ehlo, 'STARTTLS') !== false) {
        $write("STARTTLS");
        $read();
        stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        $write("EHLO mailframe");
        $read();
    }

    // AUTH LOGIN
    $write("AUTH LOGIN");
    $read();
    $write(base64_encode($creds['user']));
    $read();
    $write(base64_encode($creds['pass']));
    $auth = trim($read());
    if (substr($auth, 0, 3) !== '235') mf_err("SMTP auth failed: $auth", 401);

    // Envelope
    $write("MAIL FROM:<$from>");
    $read();

    // All recipient addresses (To + Cc + Bcc)
    $rcpt_raw = array_filter(array_merge(
        array_map('trim', explode(',', $to)),
        $cc  ? array_map('trim', explode(',', $cc))  : [],
        $bcc ? array_map('trim', explode(',', $bcc)) : []
    ));
    foreach ($rcpt_raw as $r) {
        if (preg_match('/<([^>]+)>/', $r, $m)) $r = $m[1];
        $write("RCPT TO:<$r>");
        $read();
    }

    // DATA
    $write("DATA");
    $read();

    $boundary = '----MF_' . bin2hex(random_bytes(8));
    $headers  = "From: $from\r\nTo: $to\r\n";
    if ($cc)  $headers .= "Cc: $cc\r\n";
    $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $headers .= "Date: " . date('r') . "\r\n";
    $headers .= "Message-ID: <" . bin2hex(random_bytes(12)) . "@mailframe>\r\n";
    $headers .= "MIME-Version: 1.0\r\n";

    if ($html !== null) {
        $headers  .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";
        $msg_body  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n";
        $msg_body .= "Content-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text));
        $msg_body .= "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\n";
        $msg_body .= "Content-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html));
        $msg_body .= "--$boundary--\r\n";
    } else {
        $headers  .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $headers  .= "Content-Transfer-Encoding: base64\r\n";
        $msg_body  = chunk_split(base64_encode($text)) . "\r\n";
    }

    $write($headers . "\r\n" . $msg_body . "\r\n.");
    $resp = trim($read());
    if (substr($resp, 0, 3) !== '250') mf_err("SMTP send failed: $resp", 500);

    $write("QUIT");
    fclose($conn);
}

// ════════════════════════════════════════════════════════════════════════════
// Routes
// ════════════════════════════════════════════════════════════════════════════

// ── Public ────────────────────────────────────────────────────────────────────

if ($mf_method === 'GET' && $mf_route === 'auth/config') {
    mf_json(['name' => (string)($MF_CFG['app']['name'] ?? 'MailFrame')]);
}

if ($mf_method === 'GET' && $mf_route === 'health') {
    mf_json(['ok' => true, 'service' => 'mailframe-php-bridge']);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

if ($mf_method === 'POST' && $mf_route === 'auth/login') {
    $email    = trim((string)($mf_body['email'] ?? ''));
    $password = (string)($mf_body['password'] ?? '');
    if (!$email || !$password) mf_err('email and password required.');

    $domain  = (string)substr(strrchr($email, '@'), 1);
    $allowed = (array)($MF_CFG['app']['allowedDomains'] ?? []);
    if ($allowed && !in_array($domain, $allowed, true)) mf_err('Email domain not permitted.', 403);

    // Validate by connecting (mf_imap_open exits with 401 on failure)
    $conn = mf_imap_open(['user' => $email, 'pass' => $password]);
    imap_close($conn);

    $rememberMe = !empty($mf_body['rememberMe']);

    // Multi-account: append to existing session or start fresh
    if (empty($_SESSION['mf_accounts'])) {
        session_regenerate_id(true);
        $_SESSION['mf_accounts'] = [];
    }
    $_SESSION['mf_accounts'][$email] = ['pass' => $password, 'created' => time()];
    $_SESSION['mf_active'] = $email;

    if ($rememberMe) {
        $persistTtl = 30 * 24 * 3600; // 30 days
        $_SESSION['mf_ttl'] = $persistTtl;
        // Override the browser-session cookie with an explicit expiry
        setcookie(session_name(), session_id(), [
            'expires'  => time() + $persistTtl,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    $accounts = array_values(array_keys((array)$_SESSION['mf_accounts']));
    mf_json(['ok' => true, 'email' => $email, 'accounts' => $accounts, 'name' => (string)($MF_CFG['app']['name'] ?? 'MailFrame')]);
}

if ($mf_method === 'GET' && $mf_route === 'auth/me') {
    $ttl = isset($_SESSION['mf_ttl'])
        ? (int)$_SESSION['mf_ttl']
        : (int)(($MF_CFG['app']['sessionTtlHours'] ?? 24) * 3600);
    // Multi-account
    if (!empty($_SESSION['mf_accounts']) && !empty($_SESSION['mf_active'])) {
        $email = $_SESSION['mf_active'];
        $acct  = $_SESSION['mf_accounts'][$email] ?? null;
        if (!$acct || (time() - (int)($acct['created'] ?? 0)) > $ttl) {
            session_destroy(); mf_json(['ok' => false], 401);
        }
        $accounts = array_values(array_keys((array)$_SESSION['mf_accounts']));
        mf_json(['ok' => true, 'email' => $email, 'accounts' => $accounts, 'name' => (string)($MF_CFG['app']['name'] ?? 'MailFrame')]);
    }
    // Legacy fallback
    if (empty($_SESSION['mf_email'])) mf_json(['ok' => false], 401);
    if ((time() - (int)($_SESSION['mf_created'] ?? 0)) > $ttl) { session_destroy(); mf_json(['ok' => false], 401); }
    mf_json(['ok' => true, 'email' => $_SESSION['mf_email'], 'accounts' => [$_SESSION['mf_email']], 'name' => (string)($MF_CFG['app']['name'] ?? 'MailFrame')]);
}

if ($mf_method === 'POST' && $mf_route === 'auth/logout') {
    session_destroy();
    mf_json(['ok' => true]);
}

if ($mf_method === 'POST' && $mf_route === 'auth/switch') {
    $email = trim((string)($mf_body['email'] ?? ''));
    if (!$email) mf_err('email required.');
    if (empty($_SESSION['mf_accounts'][$email])) mf_err('Account not in session.', 404);
    $_SESSION['mf_active'] = $email;
    $accounts = array_values(array_keys((array)$_SESSION['mf_accounts']));
    mf_json(['ok' => true, 'email' => $email, 'accounts' => $accounts]);
}

if ($mf_method === 'POST' && $mf_route === 'auth/logout-account') {
    $email = trim((string)($mf_body['email'] ?? ''));
    if (!$email) mf_err('email required.');
    unset($_SESSION['mf_accounts'][$email]);
    if (empty($_SESSION['mf_accounts'])) {
        session_destroy();
        mf_json(['ok' => true, 'accounts' => []]);
    }
    // If removed account was the active one, switch to another
    if (($_SESSION['mf_active'] ?? '') === $email) {
        $_SESSION['mf_active'] = (string)array_key_first($_SESSION['mf_accounts']);
    }
    $accounts = array_values(array_keys((array)$_SESSION['mf_accounts']));
    mf_json(['ok' => true, 'email' => $_SESSION['mf_active'], 'accounts' => $accounts]);
}

// ── Protected (require auth) ──────────────────────────────────────────────────

$mf_creds = mf_require_auth();

// GET /mailbox
if ($mf_method === 'GET' && $mf_route === 'mailbox') {
    $folder    = (string)($_GET['folder'] ?? 'INBOX');
    $page      = max(1, (int)($_GET['page'] ?? 1));
    $query     = (string)($_GET['q'] ?? '');
    $page_size = 25;

    $server = mf_imap_server();

    // Open root to enumerate folders
    $list_conn = mf_imap_open($mf_creds);
    $raw_boxes = imap_list($list_conn, $server, '*') ?: [];
    $folders   = [];
    foreach ($raw_boxes as $box) {
        $name   = str_replace($server, '', $box);
        $status = imap_status($list_conn, $box, SA_MESSAGES | SA_UNSEEN);
        $folders[] = [
            'id'          => $name,
            'label'       => mf_folder_label($name),
            'count'       => $status ? (int)$status->messages : 0,
            'unreadCount' => $status ? (int)$status->unseen   : 0,
        ];
    }
    imap_close($list_conn);

    // Open the target folder for messages
    $msg_conn = mf_imap_open($mf_creds, $folder);
    $check    = imap_check($msg_conn);
    $total    = $check ? (int)$check->Nmsgs : 0;

    $messages = [];
    $has_next = false;

    if ($total > 0) {
        if ($query) {
            // Build IMAP search string from query syntax
            $q = $query;
            $search_str = 'ALL';
            if (preg_match('/\bfrom:(\S+)/i', $q, $m)) {
                $search_str = 'FROM "' . addslashes($m[1]) . '"';
                $q = str_replace($m[0], '', $q);
            } elseif (preg_match('/\bsubject:(\S+)/i', $q, $m)) {
                $search_str = 'SUBJECT "' . addslashes($m[1]) . '"';
                $q = str_replace($m[0], '', $q);
            } elseif (preg_match('/\bis:unread\b/i', $q)) {
                $search_str = 'UNSEEN';
                $q = preg_replace('/\bis:unread\b/i', '', $q);
            } elseif (preg_match('/\bis:starred\b/i', $q)) {
                $search_str = 'FLAGGED';
                $q = preg_replace('/\bis:starred\b/i', '', $q);
            }
            $q = trim($q);
            if ($q && $search_str === 'ALL') $search_str = 'TEXT "' . addslashes($q) . '"';

            $uids = imap_search($msg_conn, $search_str, SE_UID) ?: [];
            rsort($uids); // newest first
            $has_next = count($uids) > ($page - 1) * $page_size + $page_size;
            $uids = array_slice($uids, ($page - 1) * $page_size, $page_size);

            foreach ($uids as $uid) {
                $msgno = imap_msgno($msg_conn, $uid);
                if (!$msgno) continue;
                $ov_arr = imap_fetch_overview($msg_conn, (string)$uid, FT_UID);
                if (!$ov_arr) continue;
                $ov = $ov_arr[0];

                $sender = mf_decode_header((string)($ov->from ?? ''));
                if (preg_match('/^(.+?)\s*</', $sender, $sm)) $sender = trim($sm[1], '" ');

                $preview = '';
                $raw_body = @imap_fetchbody($msg_conn, $msgno, '1');
                if ($raw_body) {
                    $struct = imap_fetchstructure($msg_conn, $msgno);
                    $enc = isset($struct->parts[0]) ? (int)($struct->parts[0]->encoding ?? 0) : (int)($struct->encoding ?? 0);
                    $decoded = mf_decode_part($raw_body, $enc);
                    $preview = mb_substr(trim(strip_tags($decoded)), 0, 120);
                }

                $ts_val = (int)(strtotime((string)($ov->date ?? '')) ?: time());
                $messages[] = [
                    'id'          => mf_encode_id($uid, $folder),
                    'sender'      => $sender ?: 'Unknown',
                    'subject'     => mf_decode_header((string)($ov->subject ?? '(No subject)')),
                    'preview'     => $preview ?: '(No preview)',
                    'timestamp'   => mf_format_ts($ts_val),
                    'timestampMs' => $ts_val * 1000,
                    'unread'      => !(bool)($ov->seen ?? false),
                    'starred'     => (bool)($ov->flagged ?? false),
                ];
            }
        } else {
            // Sequence-number range, newest-first pagination
            $start    = max(1, $total - $page * $page_size + 1);
            $end      = max(1, $total - ($page - 1) * $page_size);
            $has_next = $start > 1;
            $seqs     = range($end, $start); // newest first

            foreach ($seqs as $seq) {
                $ov_arr = imap_fetch_overview($msg_conn, (string)$seq);
                if (!$ov_arr) continue;
                $ov  = $ov_arr[0];
                $uid = (int)($ov->uid ?? $seq);

                $sender = mf_decode_header((string)($ov->from ?? ''));
                if (preg_match('/^(.+?)\s*</', $sender, $sm)) $sender = trim($sm[1], '" ');

                $preview = '';
                $raw_body = @imap_fetchbody($msg_conn, $seq, '1');
                if ($raw_body) {
                    $struct = imap_fetchstructure($msg_conn, $seq);
                    $enc = isset($struct->parts[0]) ? (int)($struct->parts[0]->encoding ?? 0) : (int)($struct->encoding ?? 0);
                    $decoded = mf_decode_part($raw_body, $enc);
                    $preview = mb_substr(trim(strip_tags($decoded)), 0, 120);
                }

                $ts_val = (int)(strtotime((string)($ov->date ?? '')) ?: time());
                $messages[] = [
                    'id'          => mf_encode_id($uid, $folder),
                    'sender'      => $sender ?: 'Unknown',
                    'subject'     => mf_decode_header((string)($ov->subject ?? '(No subject)')),
                    'preview'     => $preview ?: '(No preview)',
                    'timestamp'   => mf_format_ts($ts_val),
                    'timestampMs' => $ts_val * 1000,
                    'unread'      => !(bool)($ov->seen ?? false),
                    'starred'     => (bool)($ov->flagged ?? false),
                ];
            }
        }
    }
    imap_close($msg_conn);

    mf_json([
        'folders'  => $folders,
        'messages' => $messages,
        'meta'     => [
            'folder'       => $folder,
            'page'         => $page,
            'pageSize'     => $page_size,
            'totalResults' => $total,
            'hasNextPage'  => $has_next,
            'query'        => $query,
        ],
    ]);
}

// GET /messages/{id}
if ($mf_method === 'GET' && preg_match('#^messages/([^/]+)$#', $mf_route, $rm)) {
    $dec = mf_decode_id($rm[1]);
    if (!$dec) mf_err('Invalid message id.');

    $conn  = mf_imap_open($mf_creds, $dec['mailbox']);
    $msgno = imap_msgno($conn, $dec['uid']);
    if (!$msgno) { imap_close($conn); mf_err('Message not found.', 404); }

    $struct  = imap_fetchstructure($conn, $msgno);
    $ov_arr  = imap_fetch_overview($conn, (string)$dec['uid'], FT_UID);
    $ov      = $ov_arr[0] ?? null;

    // Mark as read
    imap_setflag_full($conn, (string)$dec['uid'], '\\Seen', ST_UID);

    // Walk MIME tree
    $parts = ['text' => [], 'html' => [], 'attachments' => [], 'inline' => []];
    mf_walk_struct($struct, '', $parts);

    $body_text = '';
    $body_html = '';

    foreach ($parts['text'] as $p) {
        $raw = mf_decode_part(imap_fetchbody($conn, $msgno, $p['section']), $p['encoding']);
        $cs  = $p['charset'];
        if ($cs !== 'utf-8') $raw = @mb_convert_encoding($raw, 'UTF-8', $cs) ?: $raw;
        $body_text = $raw;
        break;
    }
    foreach ($parts['html'] as $p) {
        $raw = mf_decode_part(imap_fetchbody($conn, $msgno, $p['section']), $p['encoding']);
        $cs  = $p['charset'];
        if ($cs !== 'utf-8') $raw = @mb_convert_encoding($raw, 'UTF-8', $cs) ?: $raw;
        $body_html = $raw;
        break;
    }

    // Fallback: no structure detected — grab raw body
    if (!$body_text && !$body_html) {
        $body_text = (string)imap_body($conn, $msgno);
    }

    $paragraphs = $body_text
        ? array_values(array_filter(
            array_map('trim', preg_split('/\n\s*\n/', $body_text)),
            static fn($s) => $s !== ''
          ))
        : ($body_html ? [] : ['Message body could not be extracted.']);

    $atts = array_map(static fn($a) => [
        'partId'   => $a['partId'],
        'filename' => $a['filename'],
        'mimeType' => $a['mimeType'],
        'size'     => $a['size'],
    ], $parts['attachments']);

    imap_close($conn);

    $sender    = mf_decode_header((string)($ov->from ?? ''));
    $subject   = mf_decode_header((string)($ov->subject ?? '(No subject)'));
    $to_header = mf_decode_header((string)($ov->to ?? ''));
    $date_ts   = (int)(strtotime((string)($ov->date ?? '')) ?: time());

    $result = [
        'id'          => mf_encode_id($dec['uid'], $dec['mailbox']),
        'sender'      => $sender,
        'subject'     => $subject,
        'timestamp'   => mf_format_ts($date_ts),
        'timestampMs' => $date_ts * 1000,
        'body'        => $paragraphs,
    ];
    $inline_parts = array_map(static fn($p) => [
        'cid'      => $p['cid'],
        'partId'   => $p['partId'],
        'mimeType' => $p['mimeType'],
    ], $parts['inline']);

    if ($to_header)    $result['to']          = [$to_header];
    if ($body_html)    $result['bodyHtml']    = $body_html;
    if ($atts)         $result['attachments'] = $atts;
    if ($inline_parts) $result['inlineParts'] = $inline_parts;

    mf_json($result);
}

// GET /messages/{id}/attachments/{partId}
if ($mf_method === 'GET' && preg_match('#^messages/([^/]+)/attachments/(.+)$#', $mf_route, $rm)) {
    $dec     = mf_decode_id($rm[1]);
    $part_id = $rm[2];
    if (!$dec) mf_err('Invalid message id.');

    $conn  = mf_imap_open($mf_creds, $dec['mailbox']);
    $msgno = imap_msgno($conn, $dec['uid']);
    if (!$msgno) { imap_close($conn); mf_err('Message not found.', 404); }

    $struct = imap_fetchstructure($conn, $msgno);
    $parts  = ['text' => [], 'html' => [], 'attachments' => []];
    mf_walk_struct($struct, '', $parts);

    $meta = null;
    foreach ($parts['attachments'] as $a) {
        if ($a['partId'] === $part_id) { $meta = $a; break; }
    }
    if (!$meta) { imap_close($conn); mf_err('Attachment not found.', 404); }

    $raw = mf_decode_part(imap_fetchbody($conn, $msgno, $part_id), $meta['encoding']);
    imap_close($conn);

    mf_json(['data' => base64_encode($raw), 'filename' => $meta['filename'], 'mimeType' => $meta['mimeType']]);
}

// POST /messages/move
if ($mf_method === 'POST' && $mf_route === 'messages/move') {
    $ids    = (array)($mf_body['ids'] ?? []);
    $target = (string)($mf_body['targetFolder'] ?? '');
    if (!$ids || !$target) mf_err('ids and targetFolder required.');

    $groups = [];
    foreach ($ids as $id) {
        $d = mf_decode_id($id);
        if ($d) $groups[$d['mailbox']][] = $d['uid'];
    }
    foreach ($groups as $mailbox => $uids) {
        $conn = mf_imap_open($mf_creds, $mailbox);
        imap_mail_move($conn, implode(',', $uids), $target, CP_UID);
        imap_expunge($conn);
        imap_close($conn);
    }
    mf_json(['ok' => true]);
}

// POST /messages/delete
if ($mf_method === 'POST' && $mf_route === 'messages/delete') {
    $ids = (array)($mf_body['ids'] ?? []);
    if (!$ids) mf_err('ids required.');

    $groups = [];
    foreach ($ids as $id) {
        $d = mf_decode_id($id);
        if ($d) $groups[$d['mailbox']][] = $d['uid'];
    }
    foreach ($groups as $mailbox => $uids) {
        $conn = mf_imap_open($mf_creds, $mailbox);
        foreach ($uids as $uid) {
            $n = imap_msgno($conn, $uid);
            if ($n) imap_delete($conn, (string)$n);
        }
        imap_expunge($conn);
        imap_close($conn);
    }
    mf_json(['ok' => true]);
}

// POST /messages/mark
if ($mf_method === 'POST' && $mf_route === 'messages/mark') {
    $ids  = (array)($mf_body['ids'] ?? []);
    $read = $mf_body['read'] ?? null;
    if (!$ids || $read === null) mf_err('ids and read required.');

    $groups = [];
    foreach ($ids as $id) {
        $d = mf_decode_id($id);
        if ($d) $groups[$d['mailbox']][] = $d['uid'];
    }
    foreach ($groups as $mailbox => $uids) {
        $conn = mf_imap_open($mf_creds, $mailbox);
        $uid_str = implode(',', $uids);
        $read
            ? imap_setflag_full($conn, $uid_str, '\\Seen', ST_UID)
            : imap_clearflag_full($conn, $uid_str, '\\Seen', ST_UID);
        imap_close($conn);
    }
    mf_json(['ok' => true]);
}

// POST /messages/star
if ($mf_method === 'POST' && $mf_route === 'messages/star') {
    $id      = (string)($mf_body['id'] ?? '');
    $starred = $mf_body['starred'] ?? null;
    if (!$id || $starred === null) mf_err('id and starred required.');
    $dec = mf_decode_id($id);
    if (!$dec) mf_err('Invalid message id.');

    $conn = mf_imap_open($mf_creds, $dec['mailbox']);
    $starred
        ? imap_setflag_full($conn, (string)$dec['uid'], '\\Flagged', ST_UID)
        : imap_clearflag_full($conn, (string)$dec['uid'], '\\Flagged', ST_UID);
    imap_close($conn);
    mf_json(['ok' => true]);
}

// POST /messages/send
if ($mf_method === 'POST' && $mf_route === 'messages/send') {
    if (empty($mf_body['to']) || empty($mf_body['body'])) mf_err('to and body required.');
    mf_smtp_send($mf_creds, $mf_body);
    mf_json(['ok' => true]);
}

// POST /messages/empty
if ($mf_method === 'POST' && $mf_route === 'messages/empty') {
    $folder = (string)($mf_body['folder'] ?? '');
    if (!$folder) mf_err('folder required.');
    $conn  = mf_imap_open($mf_creds, $folder);
    $total = imap_num_msg($conn);
    if ($total > 0) { imap_delete($conn, "1:$total"); imap_expunge($conn); }
    imap_close($conn);
    mf_json(['ok' => true]);
}

// POST /folders/create
if ($mf_method === 'POST' && $mf_route === 'folders/create') {
    $name = trim((string)($mf_body['name'] ?? ''));
    if (!$name) mf_err('name required.');
    $conn = mf_imap_open($mf_creds);
    set_error_handler(function() {});
    $ok = imap_createmailbox($conn, imap_utf7_encode(mf_imap_server() . $name));
    restore_error_handler();
    imap_close($conn);
    $ok ? mf_json(['ok' => true]) : mf_err('Could not create folder.');
}

// POST /folders/delete
if ($mf_method === 'POST' && $mf_route === 'folders/delete') {
    $folder = (string)($mf_body['folder'] ?? '');
    if (!$folder) mf_err('folder required.');
    $conn = mf_imap_open($mf_creds);
    set_error_handler(function() {});
    $ok = imap_deletemailbox($conn, mf_imap_server() . $folder);
    restore_error_handler();
    imap_close($conn);
    $ok ? mf_json(['ok' => true]) : mf_err('Could not delete folder.');
}

// ── User settings (GET + POST /settings) ─────────────────────────────────────
//
// Storage is selected by mailframe.config.json → "settings" → "storage":
//   "file"  (default) — stores userdata/{sha256(email)}.json next to index.php
//   "mysql"           — stores in a mf_settings table; auto-creates the table
//
// MySQL config keys (under "settings"):
//   host, port, dbname, username, password
//
// Example mailframe.config.json excerpt:
//   "settings": {
//     "storage": "mysql",
//     "host": "localhost", "port": 3306,
//     "dbname": "mydb", "username": "user", "password": "pass"
//   }

function mf_settings_key(string $email): string {
    return hash('sha256', strtolower(trim($email)));
}

function mf_settings_read(string $email): array {
    global $MF_CFG;
    $storage = strtolower((string)($MF_CFG['settings']['storage'] ?? 'file'));

    if ($storage === 'mysql') {
        $pdo = mf_settings_pdo();
        $st  = $pdo->prepare('SELECT data FROM mf_settings WHERE user_key = ?');
        $st->execute([mf_settings_key($email)]);
        $row = $st->fetch(\PDO::FETCH_ASSOC);
        return $row ? (json_decode($row['data'], true) ?: []) : [];
    }

    // file (default)
    $path = mf_settings_file_path($email);
    if (!file_exists($path)) return [];
    return json_decode(file_get_contents($path), true) ?: [];
}

function mf_settings_write(string $email, array $data): void {
    global $MF_CFG;
    $storage = strtolower((string)($MF_CFG['settings']['storage'] ?? 'file'));
    $json    = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

    if ($storage === 'mysql') {
        $pdo = mf_settings_pdo();
        $pdo->prepare(
            'INSERT INTO mf_settings (user_key, data, updated_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()'
        )->execute([mf_settings_key($email), $json]);
        return;
    }

    // file (default)
    $path = mf_settings_file_path($email);
    $dir  = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    file_put_contents($path, $json, LOCK_EX);
}

function mf_settings_file_path(string $email): string {
    return __DIR__ . '/userdata/' . mf_settings_key($email) . '.json';
}

function mf_settings_pdo(): \PDO {
    global $MF_CFG;
    $cfg  = $MF_CFG['settings'] ?? [];
    $host = (string)($cfg['host']     ?? 'localhost');
    $port = (int)   ($cfg['port']     ?? 3306);
    $db   = (string)($cfg['dbname']   ?? '');
    $user = (string)($cfg['username'] ?? '');
    $pass = (string)($cfg['password'] ?? '');
    if (!$db || !$user) mf_err('MySQL settings storage is not configured.', 500);

    $pdo = new \PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass, [
        \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
    ]);

    // Auto-create table on first use
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS mf_settings (
            user_key   CHAR(64)     NOT NULL PRIMARY KEY,
            data       MEDIUMTEXT   NOT NULL,
            updated_at DATETIME     NOT NULL
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    return $pdo;
}

if ($mf_method === 'GET' && $mf_route === 'settings') {
    mf_json(mf_settings_read($mf_creds['user']));
}

if ($mf_method === 'POST' && $mf_route === 'settings') {
    if (!is_array($mf_body)) mf_err('Invalid settings payload.');
    // Merge with existing so partial updates are safe
    $existing = mf_settings_read($mf_creds['user']);
    $merged   = array_merge($existing, $mf_body);
    mf_settings_write($mf_creds['user'], $merged);
    mf_json(['ok' => true]);
}

mf_err("Not found: $mf_method /$mf_route", 404);
