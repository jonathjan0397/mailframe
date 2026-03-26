import { useCallback, useEffect, useRef, useState } from "react";
import { applyTheme } from "../themes/tokens";
import { lumenTheme } from "../themes/lumen";
import { auroraTheme } from "../themes/aurora";
import { demoProvider } from "../features/mail/providers/demo-provider";
import { ComposeModal } from "./ComposeModal";
import type { MailItem, MailMessageDetail, MailFolder } from "../lib/mail-types";
import type { SendPayload } from "../features/mail/provider";

const themes = [lumenTheme, auroraTheme];
const provider = demoProvider;

type ComposeMode = { type: "new" } | { type: "reply"; to: string; subject: string } | { type: "forward"; subject: string; body: string[] };

export function App() {
  const [activeThemeId, setActiveThemeId] = useState(lumenTheme.id);
  const [activeFolderId, setActiveFolderId] = useState("INBOX");
  const [search, setSearch] = useState("");
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [messages, setMessages] = useState<MailItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compose, setCompose] = useState<ComposeMode | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply theme
  useEffect(() => {
    const theme = themes.find((t) => t.id === activeThemeId) ?? lumenTheme;
    applyTheme(theme);
  }, [activeThemeId]);

  // Load mailbox
  useEffect(() => {
    provider.getMailboxSnapshot({ folderId: activeFolderId, query: search }).then((snapshot) => {
      setFolders(snapshot.folders);
      setMessages(snapshot.messages);
    });
  }, [activeFolderId, search]);

  // Load detail
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    // Mark as read optimistically
    setMessages((prev) => prev.map((m) => m.id === selectedId ? { ...m, unread: false } : m));
    provider.markRead?.([selectedId], true);
    provider.getMessageDetail(selectedId).then((d) => { setDetail(d); setDetailLoading(false); });
  }, [selectedId]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function handleSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(value), 250);
  }

  function removeMessages(ids: string[]) {
    setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
    setSelectedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    if (selectedId && ids.includes(selectedId)) { setSelectedId(null); setDetail(null); }
  }

  function handleDelete(ids = selectedIds.size > 0 ? [...selectedIds] : selectedId ? [selectedId] : []) {
    if (!ids.length) return;
    provider.deleteMessages?.(ids);
    removeMessages(ids);
    showToast(`${ids.length === 1 ? "Message" : `${ids.length} messages`} deleted`);
  }

  function handleArchive(ids = selectedIds.size > 0 ? [...selectedIds] : selectedId ? [selectedId] : []) {
    if (!ids.length) return;
    provider.moveMessages?.(ids, "Archive");
    removeMessages(ids);
    showToast(`${ids.length === 1 ? "Message" : `${ids.length} messages`} archived`);
  }

  function handleMove(folderId: string) {
    const ids = selectedIds.size > 0 ? [...selectedIds] : selectedId ? [selectedId] : [];
    if (!ids.length) return;
    provider.moveMessages?.(ids, folderId);
    removeMessages(ids);
    showToast(`Moved to ${folderId}`);
  }

  function handleStar(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const msg = messages.find((m) => m.id === id);
    if (!msg) return;
    const starred = !msg.starred;
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, starred } : m));
    provider.toggleStar?.(id, starred);
  }

  function handleMarkUnread() {
    if (!selectedId) return;
    setMessages((prev) => prev.map((m) => m.id === selectedId ? { ...m, unread: true } : m));
    provider.markRead?.([selectedId], false);
    showToast("Marked as unread");
  }

  function handleToggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)));
    }
  }

  function handleSend(payload: SendPayload) {
    provider.sendMessage?.(payload);
    setCompose(null);
    showToast("Message sent");
  }

  const handleReply = useCallback(() => {
    if (!detail) return;
    setCompose({ type: "reply", to: detail.sender, subject: `Re: ${detail.subject}` });
  }, [detail]);

  const handleForward = useCallback(() => {
    if (!detail) return;
    setCompose({ type: "forward", subject: `Fwd: ${detail.subject}`, body: detail.body });
  }, [detail]);

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const moveTargets = folders.filter((f) => f.id !== activeFolderId && f.id !== "Trash");
  const bulkActive = selectedIds.size > 0;
  const allSelected = messages.length > 0 && selectedIds.size === messages.length;

  return (
    <div className="mf-shell">
      {/* Compose modal */}
      {compose && (
        <ComposeModal
          initialTo={compose.type === "reply" ? compose.to : ""}
          initialSubject={compose.type !== "new" ? compose.subject : ""}
          initialBody={compose.type === "forward" ? compose.body.join("\n\n") : ""}
          onSend={handleSend}
          onClose={() => setCompose(null)}
        />
      )}

      {/* Toast */}
      {toast && <div className="mf-toast">{toast}</div>}

      {/* Sidebar */}
      <aside className="mf-sidebar">
        <div className="mf-sidebar-logo">MailFrame</div>
        <button className="mf-compose-btn" onClick={() => setCompose({ type: "new" })}>+ Compose</button>
        <ul className="mf-folder-list">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className={`mf-folder-item${folder.id === activeFolderId ? " active" : ""}`}
              onClick={() => { setActiveFolderId(folder.id); setSelectedId(null); setSelectedIds(new Set()); }}
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
          <input
            type="checkbox"
            className="mf-select-all"
            checked={allSelected}
            onChange={handleSelectAll}
            title="Select all"
          />
          <span className="mf-list-title">{activeFolder?.label ?? "Inbox"}</span>
        </div>

        {/* Bulk action bar */}
        {bulkActive && (
          <div className="mf-bulk-bar">
            <span className="mf-bulk-count">{selectedIds.size} selected</span>
            <button className="mf-bulk-btn" onClick={() => handleArchive()}>Archive</button>
            <button className="mf-bulk-btn" onClick={() => handleDelete()}>Delete</button>
            <button className="mf-bulk-btn" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        )}

        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--mf-color-border)" }}>
          <input
            className="mf-search"
            type="search"
            placeholder="Search mail"
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        <ul className="mf-messages">
          {messages.map((msg) => (
            <li
              key={msg.id}
              className={[
                "mf-message-row",
                msg.unread ? "unread" : "",
                selectedId === msg.id ? "selected" : "",
                selectedIds.has(msg.id) ? "checked" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => { setSelectedId(msg.id); setSelectedIds(new Set()); }}
            >
              <input
                type="checkbox"
                className="mf-message-check"
                checked={selectedIds.has(msg.id)}
                onChange={() => {}}
                onClick={(e) => handleToggleSelect(msg.id, e)}
              />
              <div className="mf-message-content">
                <div className="mf-message-top">
                  <span className="mf-message-sender">{msg.sender}</span>
                  <span className="mf-message-timestamp">{msg.timestamp}</span>
                </div>
                <div className="mf-message-subject">{msg.subject}</div>
                <div className="mf-message-preview">{msg.preview}</div>
              </div>
              <button
                className={`mf-star-btn${msg.starred ? " starred" : ""}`}
                onClick={(e) => handleStar(msg.id, e)}
                title={msg.starred ? "Unstar" : "Star"}
              >
                {msg.starred ? "★" : "☆"}
              </button>
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
              <button className="mf-action-btn" onClick={handleReply}>Reply</button>
              <button className="mf-action-btn" onClick={handleForward}>Forward</button>
              <button className="mf-action-btn" onClick={handleMarkUnread}>Mark unread</button>
              <button className="mf-action-btn" onClick={() => handleArchive()}>Archive</button>
              {moveTargets.length > 0 && (
                <select
                  className="mf-move-select"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) { handleMove(e.target.value); e.target.value = ""; }}}
                >
                  <option value="" disabled>Move to…</option>
                  {moveTargets.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              )}
              <button className="mf-action-btn danger" onClick={() => handleDelete()}>Delete</button>
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
