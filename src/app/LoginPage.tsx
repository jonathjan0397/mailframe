import { useEffect, useState } from "react";
import { applyTheme } from "../themes/tokens";
import { themeRegistry } from "../themes/registry";

const THEME_KEY = "mailframe-theme";
const EMAIL_KEY = "mailframe-last-email";
const SAVED_CREDS_KEY = "mailframe-saved-creds";

type Props = {
  apiBase: string;
  onLogin: (email: string, accounts: string[]) => void;
};

export function LoginPage({ apiBase, onLogin }: Props) {
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) ?? "");
  const [password, setPassword] = useState("");
  const [themeId, setThemeId] = useState(
    () => localStorage.getItem(THEME_KEY) ?? themeRegistry[0].id,
  );
  const [appName, setAppName] = useState("MailFrame");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Apply persisted theme immediately on mount
  useEffect(() => {
    const theme = themeRegistry.find((t) => t.id === themeId) ?? themeRegistry[0];
    applyTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore saved credentials on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_CREDS_KEY);
      if (raw) {
        const creds = JSON.parse(raw) as { email?: string; password?: string };
        if (creds.email) setEmail(creds.email);
        if (creds.password) setPassword(creds.password);
        setRememberMe(true);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch app name from server config endpoint
  useEffect(() => {
    fetch(`${apiBase}/auth/config`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { name?: string }) => { if (d.name) setAppName(d.name); })
      .catch(() => {});
  }, [apiBase]);

  function handleThemeChange(id: string) {
    setThemeId(id);
    localStorage.setItem(THEME_KEY, id);
    const theme = themeRegistry.find((t) => t.id === id) ?? themeRegistry[0];
    applyTheme(theme);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json() as { error?: string; accounts?: string[] };
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      localStorage.setItem(EMAIL_KEY, email.trim());
      if (rememberMe) {
        localStorage.setItem(SAVED_CREDS_KEY, JSON.stringify({ email: email.trim(), password }));
      } else {
        localStorage.removeItem(SAVED_CREDS_KEY);
      }
      onLogin(email.trim(), data.accounts ?? [email.trim()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mf-login-overlay">
      <form
        className="mf-login-card"
        onSubmit={handleSubmit}
        aria-label="Sign in to MailFrame"
        noValidate
      >
        <div className="mf-login-logo">{appName}</div>

        <div className="mf-login-field">
          <label htmlFor="mf-login-email">Email</label>
          <input
            id="mf-login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            required
          />
        </div>

        <div className="mf-login-field">
          <label htmlFor="mf-login-password">Password</label>
          <input
            id="mf-login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="mf-login-remember">
          <input
            id="mf-login-remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <label htmlFor="mf-login-remember">Remember me on this device</label>
        </div>

        {rememberMe && (
          <div className="mf-login-warning" role="alert">
            ⚠ Your password will be saved in this browser. Do not use this on a shared or public computer.
          </div>
        )}

        <div className="mf-login-field">
          <label htmlFor="mf-login-theme">Theme</label>
          <select
            id="mf-login-theme"
            value={themeId}
            onChange={(e) => handleThemeChange(e.target.value)}
          >
            {themeRegistry.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mf-login-error" role="alert">{error}</div>
        )}

        <button
          className="mf-login-submit"
          type="submit"
          disabled={loading || !email.trim() || !password}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
