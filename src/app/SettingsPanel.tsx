import type { ThemeTokens } from "../themes/tokens";

export type ProviderId = "demo" | "api";

type Props = {
  themes: ThemeTokens[];
  activeThemeId: string;
  onThemeChange: (id: string) => void;
  providerId: ProviderId;
  onProviderChange: (id: ProviderId) => void;
  onClose: () => void;
};

export function SettingsPanel({
  themes,
  activeThemeId,
  onThemeChange,
  providerId,
  onProviderChange,
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
