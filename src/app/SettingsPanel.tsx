import type { ThemeTokens } from "../themes/tokens";

export type ProviderId = "demo" | "api";
export type NotifSound = "chime" | "bell" | "pop" | "none";

type Props = {
  themes: ThemeTokens[];
  activeThemeId: string;
  onThemeChange: (id: string) => void;
  providerId: ProviderId;
  onProviderChange: (id: ProviderId) => void;
  signature: string;
  onSignatureChange: (val: string) => void;
  notifSound: NotifSound;
  onNotifSoundChange: (sound: NotifSound) => void;
  inAppNotifsEnabled: boolean;
  onInAppNotifsChange: (enabled: boolean) => void;
  onClose: () => void;
};

export function SettingsPanel({
  themes,
  activeThemeId,
  onThemeChange,
  providerId,
  onProviderChange,
  signature,
  onSignatureChange,
  notifSound,
  onNotifSoundChange,
  inAppNotifsEnabled,
  onInAppNotifsChange,
  onClose,
}: Props) {

  return (
    <>
      <div className="mf-settings-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="mf-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="mf-settings-header">
          <span className="mf-settings-title">Settings</span>
          <button
            className="mf-settings-close"
            onClick={onClose}
            aria-label="Close settings"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          >
            ✕
          </button>
        </div>

        <div className="mf-settings-body">
          <section className="mf-settings-section">
            <h2 className="mf-settings-section-title">Appearance</h2>
            <div className="mf-theme-cards">
              {/* System (Auto) — follows OS light/dark preference */}
              <button
                className={`mf-theme-card${"system" === activeThemeId ? " active" : ""}`}
                onClick={() => onThemeChange("system")}
                aria-pressed={"system" === activeThemeId}
              >
                <span
                  className="mf-theme-card-swatch mf-theme-card-swatch--system"
                  aria-hidden="true"
                />
                <div className="mf-theme-card-info">
                  <span className="mf-theme-card-name">System (Auto)</span>
                  <span className="mf-theme-card-desc">Follows your OS light / dark setting.</span>
                </div>
                {"system" === activeThemeId && (
                  <span className="mf-theme-card-check" aria-hidden="true">✓</span>
                )}
              </button>
              {themes.map((t) => (
                <button
                  key={t.id}
                  className={`mf-theme-card${t.id === activeThemeId ? " active" : ""}`}
                  onClick={() => onThemeChange(t.id)}
                  aria-pressed={t.id === activeThemeId}
                >
                  <span
                    className="mf-theme-card-swatch"
                    style={{ background: t.colorAccent }}
                    aria-hidden="true"
                  />
                  <div className="mf-theme-card-info">
                    <span className="mf-theme-card-name">{t.label}</span>
                    {t.description && (
                      <span className="mf-theme-card-desc">{t.description}</span>
                    )}
                  </div>
                  {t.id === activeThemeId && (
                    <span className="mf-theme-card-check" aria-hidden="true">✓</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="mf-settings-section">
            <h2 className="mf-settings-section-title">Account</h2>
            <div className="mf-settings-field">
              <label className="mf-settings-label" htmlFor="mf-signature">
                Email signature
              </label>
              <textarea
                id="mf-signature"
                className="mf-settings-textarea"
                value={signature}
                onChange={(e) => onSignatureChange(e.target.value)}
                placeholder="Your signature…"
                rows={4}
              />
              <p className="mf-settings-hint">Appended to new compositions automatically.</p>
            </div>
          </section>

          <section className="mf-settings-section">
            <h2 className="mf-settings-section-title">Notifications</h2>
            <div className="mf-settings-field">
              <label className="mf-settings-toggle-row">
                <span className="mf-settings-label">In-app new mail popups</span>
                <input
                  type="checkbox"
                  className="mf-settings-toggle"
                  checked={inAppNotifsEnabled}
                  onChange={(e) => onInAppNotifsChange(e.target.checked)}
                  aria-label="Enable in-app notification popups"
                />
              </label>
            </div>
            {inAppNotifsEnabled && (
              <div className="mf-settings-field">
                <label className="mf-settings-label" htmlFor="mf-notif-sound">
                  Notification sound
                </label>
                <select
                  id="mf-notif-sound"
                  className="mf-settings-select"
                  value={notifSound}
                  onChange={(e) => onNotifSoundChange(e.target.value as NotifSound)}
                >
                  <option value="chime">Chime (two-tone)</option>
                  <option value="bell">Bell (single tone)</option>
                  <option value="pop">Pop (short)</option>
                  <option value="none">Silent</option>
                </select>
              </div>
            )}
          </section>

          <section className="mf-settings-section">
            <h2 className="mf-settings-section-title">Connection</h2>
            <div className="mf-settings-field">
              <label className="mf-settings-label" htmlFor="mf-provider-select">
                Data source
              </label>
              <select
                id="mf-provider-select"
                className="mf-settings-select"
                value={providerId}
                onChange={(e) => onProviderChange(e.target.value as ProviderId)}
              >
                <option value="demo">Demo (fixture data)</option>
                <option value="api">Bridge server (IMAP/SMTP)</option>
              </select>
            </div>
            {providerId === "api" && (
              <p className="mf-settings-hint">
                Connects to the bridge server at{" "}
                <code>{import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4010"}</code>.
                Configure IMAP/SMTP credentials in <code>server/.env</code> and run{" "}
                <code>npm start</code> from the <code>server/</code> directory.
              </p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
