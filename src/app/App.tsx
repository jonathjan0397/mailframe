import { useEffect, useRef, useState } from "react";
import { applyTheme } from "../themes/tokens";
import { lumenTheme } from "../themes/lumen";
import { auroraTheme } from "../themes/aurora";
import { demoProvider } from "../features/mail/providers/demo-provider";
import type { MailboxSnapshot, MailMessageDetail, MailFolder } from "../lib/mail-types";

const themes = [lumenTheme, auroraTheme];
const provider = demoProvider;

export function App() {
  const [activeThemeId, setActiveThemeId] = useState(lumenTheme.id);
  const [activeFolderId, setActiveFolderId] = useState("INBOX");
  const [search, setSearch] = useState("");
  const [mailbox, setMailbox] = useState<MailboxSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply theme on change
  useEffect(() => {
    const theme = themes.find((t) => t.id === activeThemeId) ?? lumenTheme;
    applyTheme(theme);
  }, [activeThemeId]);

  // Load mailbox
  useEffect(() => {
    provider.getMailboxSnapshot({ folderId: activeFolderId, query: search }).then(setMailbox);
  }, [activeFolderId, search]);

  // Load message detail
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    provider.getMessageDetail(selectedId).then((d) => { setDetail(d); setDetailLoading(false); });
  }, [selectedId]);

  function handleSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(value), 250);
  }

  function handleDelete() {
    if (!selectedId) return;
    provider.deleteMessages?.([selectedId]);
    setSelectedId(null);
    setDetail(null);
  }

  function handleArchive() {
    if (!selectedId) return;
    provider.moveMessages?.([selectedId], "Archive");
    setSelectedId(null);
    setDetail(null);
  }

  const folders: MailFolder[] = mailbox?.folders ?? [];
  const activeFolder = folders.find((f) => f.id === activeFolderId);

  return (
    <div className="mf-shell">
      {/* Sidebar */}
      <aside className="mf-sidebar">
        <div className="mf-sidebar-logo">MailFrame</div>
        <button className="mf-compose-btn">+ Compose</button>
        <ul className="mf-folder-list">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className={`mf-folder-item${folder.id === activeFolderId ? " active" : ""}`}
              onClick={() => { setActiveFolderId(folder.id); setSelectedId(null); }}
            >
              <span>{folder.label}</span>
              {(folder.unreadCount ?? 0) > 0 && (
                <span className="mf-folder-count">{folder.unreadCount}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="mf-theme-switcher">
          <label>Theme</label>
          <select value={activeThemeId} onChange={(e) => setActiveThemeId(e.target.value)}>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </aside>

      {/* Message list */}
      <section className="mf-list">
        <div className="mf-list-header">
          <span className="mf-list-title">{activeFolder?.label ?? "Inbox"}</span>
        </div>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--mf-color-border)" }}>
          <input
            className="mf-search"
            type="search"
            placeholder="Search mail"
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <ul className="mf-messages">
          {(mailbox?.messages ?? []).map((msg) => (
            <li
              key={msg.id}
              className={[
                "mf-message-row",
                msg.unread ? "unread" : "",
                selectedId === msg.id ? "selected" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setSelectedId(msg.id)}
            >
              {msg.unread && <span className="mf-unread-dot" />}
              <div className="mf-message-top">
                <span className="mf-message-sender">{msg.sender}</span>
                <span className="mf-message-timestamp">{msg.timestamp}</span>
              </div>
              <div className="mf-message-subject">{msg.subject}</div>
              <div className="mf-message-preview">{msg.preview}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* Reading pane */}
      <main className="mf-pane">
        {!selectedId && (
          <div className="mf-pane-empty">Select a message to read</div>
        )}
        {selectedId && detailLoading && (
          <div className="mf-pane-loading">Loading…</div>
        )}
        {selectedId && !detailLoading && detail && (
          <>
            <div className="mf-pane-header">
              <div className="mf-pane-subject">{detail.subject}</div>
              <div className="mf-pane-meta">
                <span className="mf-pane-sender">{detail.sender}</span>
                <span className="mf-pane-timestamp">{detail.timestamp}</span>
              </div>
            </div>
            <div className="mf-pane-actions">
              <button className="mf-action-btn">Reply</button>
              <button className="mf-action-btn">Forward</button>
              <button className="mf-action-btn" onClick={handleArchive}>Archive</button>
              <button className="mf-action-btn danger" onClick={handleDelete}>Delete</button>
            </div>
            <div className="mf-pane-body">
              {detail.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
