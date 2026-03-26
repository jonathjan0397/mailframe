<?php
/**
 * MailFrame Database Setup Wizard
 *
 * Upload this file to public_html/mailframe-api/ alongside index.php.
 * Visit it once in your browser to configure MySQL storage.
 * The script deletes itself after a successful setup.
 *
 * Access is protected by a one-time token written to setup.lock on first load.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');

// ── Security: one-time access token ──────────────────────────────────────────

$lock_file   = __DIR__ . '/setup.lock';
$config_file = __DIR__ . '/mailframe.config.json';

// Generate and persist a token on first visit
if (!file_exists($lock_file)) {
    $token = bin2hex(random_bytes(16));
    file_put_contents($lock_file, $token);
} else {
    $token = trim((string)file_get_contents($lock_file));
}

$given = $_GET['token'] ?? $_POST['token'] ?? '';
$token_ok = hash_equals($token, $given);

if (!$token_ok) {
    http_response_code(403);
    echo '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px">';
    echo '<h2>MailFrame Setup</h2>';
    echo '<p>Access this page with your setup token:</p>';
    echo '<pre style="background:#f4f4f4;padding:12px;border-radius:6px">';
    echo htmlspecialchars("https://{$_SERVER['HTTP_HOST']}/mailframe-api/setup.php?token=$token");
    echo '</pre>';
    echo '<p style="color:#888;font-size:13px">Keep this URL private. The script self-deletes after a successful setup.</p>';
    echo '</body></html>';
    exit;
}

// ── Handle form submission ────────────────────────────────────────────────────

$result   = null;   // 'ok' | error string
$db_vals  = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $db_vals = [
        'host'     => trim($_POST['db_host']     ?? 'localhost'),
        'port'     => (int)($_POST['db_port']    ?? 3306),
        'dbname'   => trim($_POST['db_name']     ?? ''),
        'username' => trim($_POST['db_user']     ?? ''),
        'password' => $_POST['db_pass']          ?? '',
    ];

    if (!$db_vals['dbname'] || !$db_vals['username']) {
        $result = 'Database name and username are required.';
    } else {
        try {
            $dsn = "mysql:host={$db_vals['host']};port={$db_vals['port']};dbname={$db_vals['dbname']};charset=utf8mb4";
            $pdo = new PDO($dsn, $db_vals['username'], $db_vals['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);

            // Create table
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS mf_settings (
                    user_key   CHAR(64)   NOT NULL PRIMARY KEY,
                    data       MEDIUMTEXT NOT NULL,
                    updated_at DATETIME   NOT NULL
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );

            // Update mailframe.config.json
            if (!file_exists($config_file)) {
                $result = 'mailframe.config.json not found next to setup.php.';
            } else {
                $config = json_decode((string)file_get_contents($config_file), true);
                if (!is_array($config)) {
                    $result = 'mailframe.config.json is not valid JSON.';
                } else {
                    $config['settings'] = array_merge($config['settings'] ?? [], [
                        'storage'  => 'mysql',
                        'host'     => $db_vals['host'],
                        'port'     => $db_vals['port'],
                        'dbname'   => $db_vals['dbname'],
                        'username' => $db_vals['username'],
                        'password' => $db_vals['password'],
                    ]);
                    $written = file_put_contents(
                        $config_file,
                        json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
                    );
                    if ($written === false) {
                        $result = 'Could not write mailframe.config.json — check file permissions.';
                    } else {
                        $result = 'ok';
                        // Self-delete
                        @unlink($lock_file);
                        @unlink(__FILE__);
                    }
                }
            }
        } catch (PDOException $e) {
            $result = 'Database error: ' . htmlspecialchars($e->getMessage());
        }
    }
}

// ── Render ────────────────────────────────────────────────────────────────────

$accent  = '#2563eb';
$success = '#16a34a';
$danger  = '#dc2626';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MailFrame — Database Setup</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(135deg, #e0eaff 0%, #f0f4ff 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #1e293b;
    }

    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.10);
      padding: 40px;
      width: 100%;
      max-width: 480px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 28px;
    }

    .logo-icon {
      width: 36px; height: 36px;
      background: <?= $accent ?>;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 18px;
    }

    .logo-text { font-size: 20px; font-weight: 700; color: #0f172a; }
    .logo-sub  { font-size: 13px; color: #64748b; margin-top: 2px; }

    h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { font-size: 14px; color: #64748b; margin-bottom: 28px; line-height: 1.5; }

    .field { margin-bottom: 16px; }
    label  { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 5px; }

    input {
      width: 100%; padding: 9px 12px;
      border: 1.5px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s;
      color: #111;
    }
    input:focus { border-color: <?= $accent ?>; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }

    .row { display: grid; grid-template-columns: 1fr 100px; gap: 10px; }

    .hint { font-size: 12px; color: #94a3b8; margin-top: 4px; }

    .btn {
      width: 100%; padding: 11px;
      background: <?= $accent ?>; color: #fff;
      border: none; border-radius: 8px;
      font-size: 15px; font-weight: 600;
      cursor: pointer; margin-top: 8px;
      transition: background 0.15s;
    }
    .btn:hover { background: #1d4ed8; }

    .alert {
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 20px;
      line-height: 1.5;
    }
    .alert-error   { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
    .alert-success { background: #f0fdf4; border: 1px solid #86efac; color: #14532d; }

    .success-icon { font-size: 48px; text-align: center; margin-bottom: 12px; }
    .success-link {
      display: block; text-align: center; margin-top: 20px;
      color: <?= $accent ?>; text-decoration: none; font-weight: 600; font-size: 15px;
    }
    .success-link:hover { text-decoration: underline; }

    .divider { border: none; border-top: 1px solid #f1f5f9; margin: 20px 0; }

    .step {
      display: flex; gap: 10px; align-items: flex-start;
      font-size: 13px; color: #64748b; margin-bottom: 8px;
    }
    .step-num {
      background: <?= $accent ?>; color: #fff;
      border-radius: 50%; width: 20px; height: 20px; min-width: 20px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; margin-top: 1px;
    }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-icon">✉</div>
    <div>
      <div class="logo-text">MailFrame</div>
      <div class="logo-sub">Database Setup Wizard</div>
    </div>
  </div>

  <?php if ($result === 'ok'): ?>

    <div class="success-icon">✅</div>
    <h1 style="text-align:center">Setup complete!</h1>
    <p class="subtitle" style="text-align:center">
      MySQL storage is now active. The setup wizard has been deleted from the server.
    </p>
    <hr class="divider">
    <div class="step"><div class="step-num">✓</div><div>Connected to MySQL successfully</div></div>
    <div class="step"><div class="step-num">✓</div><div><code>mf_settings</code> table created (or already existed)</div></div>
    <div class="step"><div class="step-num">✓</div><div><code>mailframe.config.json</code> updated with storage settings</div></div>
    <div class="step"><div class="step-num">✓</div><div>Setup script removed from server</div></div>
    <a class="success-link" href="/mailframe/">Open MailFrame →</a>

  <?php else: ?>

    <h1>Connect a database</h1>
    <p class="subtitle">
      User settings (theme, signature, etc.) will be stored in MySQL and synced across all devices.
      Leave on <strong>file storage</strong> if you don't have a database — everything still works.
    </p>

    <?php if ($result && $result !== 'ok'): ?>
      <div class="alert alert-error">⚠ <?= $result ?></div>
    <?php endif; ?>

    <form method="POST" action="?token=<?= htmlspecialchars($token) ?>">
      <input type="hidden" name="token" value="<?= htmlspecialchars($token) ?>">

      <div class="field row">
        <div>
          <label for="db_host">Database host</label>
          <input id="db_host" name="db_host"
                 value="<?= htmlspecialchars($db_vals['host'] ?? 'localhost') ?>"
                 placeholder="localhost" required>
        </div>
        <div>
          <label for="db_port">Port</label>
          <input id="db_port" name="db_port" type="number"
                 value="<?= (int)($db_vals['port'] ?? 3306) ?>"
                 placeholder="3306" required>
        </div>
      </div>

      <div class="field">
        <label for="db_name">Database name</label>
        <input id="db_name" name="db_name"
               value="<?= htmlspecialchars($db_vals['dbname'] ?? '') ?>"
               placeholder="your_database" required>
        <p class="hint">The database must already exist. The wizard creates the table inside it.</p>
      </div>

      <div class="field">
        <label for="db_user">Username</label>
        <input id="db_user" name="db_user"
               value="<?= htmlspecialchars($db_vals['username'] ?? '') ?>"
               placeholder="db_user" required>
      </div>

      <div class="field">
        <label for="db_pass">Password</label>
        <input id="db_pass" name="db_pass" type="password"
               value="<?= htmlspecialchars($db_vals['password'] ?? '') ?>"
               placeholder="••••••••">
      </div>

      <button class="btn" type="submit">Connect &amp; finish setup →</button>
    </form>

    <hr class="divider">
    <p style="font-size:12px;color:#94a3b8;text-align:center">
      This wizard self-deletes after a successful setup.<br>
      Your password is stored only in <code>mailframe.config.json</code> on your server.
    </p>

  <?php endif; ?>
</div>
</body>
</html>
