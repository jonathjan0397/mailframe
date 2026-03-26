import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { applyTheme } from "../themes/tokens";
import { themeRegistry } from "../themes/registry";
import { demoProvider } from "../features/mail/providers/demo-provider";
import { apiProvider } from "../features/mail/providers/api-provider";
import { ComposeModal } from "./ComposeModal";
import { SettingsPanel } from "./SettingsPanel";
import type { ProviderId } from "./SettingsPanel";
import type { MailItem, MailMessageDetail, MailFolder } from "../lib/mail-types";
import type { SendPayload } from "../features/mail/provider";

type ComposeMode =
  | { type: "new" }
  | { type: "reply"; to: string; subject: string }
  | { type: "forward"; subject: string; body: string[] };

export function App() {
  const [activeThemeId, setActiveThemeId] = useState(themeRegistry[0].id);
  const [providerId, setProviderId] = useState<ProviderId>("demo");
  const [activeFolderId, setActiveFolderId] = useState("INBOX");
  const [search, setSearch] = useState("");
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [messages, setMessages] = useState<MailItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compose, setCompose] = useState<ComposeMode | null>(null);
  const [mailboxLoading, setMailboxLoading] = useState(false);
  const [mailboxError, setMailboxError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const messagesListRef = useRef<HTMLUListElement>(null);

  const provider = useMemo(
    () => (providerId === "demo" ? demoProvider : apiProvider),
    [providerId],
  );

  // Apply theme
  useEffect(() => {
    const theme = themeRegistry.find((t) => t.id === activeThemeId) ?? themeRegistry[0];
    applyTheme(theme);
  }, [activeThemeId]);

  // Clear selection when provider or folder changes (before mailbox loads)
  useEffect(() => {
    setSelectedId(null);
    setSelectedIds(new Set());
    setDetail(null);
    setDetailLoading(false);
  }, [provider, activeFolderId]);

  // Load mailbox
  useEffect(() => {
    let cancelled = false;
    setMailboxLoading(true);
    setMailboxError(null);
    provider.getMailboxSnapshot({ folderId: activeFolderId, query: search })
      .then((snapshot) => {
        if (cancelled) return;
        setFolders(snapshot.folders);
        setMessages(snapshot.messages);
        setMailboxLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setMailboxError(e instanceof Error ? e.message : "Failed to load mailbox.");
        setMailboxLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeFolderId, search, provider]);

  // Load detail — provider intentionally omitted from deps: selection is always
  // cleared before provider changes (see effect above), so this never fires stale.
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    setMessages((prev) => prev.map((m) => m.id === selectedId ? { ...m, unread: false } : m));
    provider.markRead?.([selectedId], true);
    provider.getMessageDetail(selectedId).then((d) => {
      if (!cancelled) { setDetail(d); setDetailLoading(false); }
    });
    return () => { cancelled = true; };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Return focus to settings button when panel closes
  useEffect(() => {
    if (!settingsOpen) settingsBtnRef.current?.focus();
  }, [settingsOpen]);

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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (selectedId && ids.includes(selectedId)) { setSelectedId(null); setDetail(null); }
  }

  function handleDelete(
    ids = selectedIds.size > 0 ? [...selectedIds] : selectedId ? [selectedId] : [],
  ) {
    if (!ids.length) return;
    provider.deleteMessages?.(ids);
    removeMessages(ids);
    showToast(`${ids.length === 1 ? "Message" : `${ids.length} messages`} deleted`);
  }

  function handleArchive(
    ids = selectedIds.size > 0 ? [...selectedIds] : selectedId ? [selectedId] : [],
  ) {
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

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messagesListRef.current,
    estimateSize: () => 73,
    overscan: 8,
  });

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

      {/* Settings panel */}
      {settingsOpen && (
        <SettingsPanel
          themes={themeRegistry}
          activeThemeId={activeThemeId}
          onThemeChange={setActiveThemeId}
          providerId={providerId}
          onProviderChange={setProviderId}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="mf-toast" role="status" aria-live="polite" aria-atomic="true">
          {toast}
        </div>
      )}

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="mf-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`mf-sidebar${sidebarOpen ? " open" : ""}`} aria-label="Navigation">
        <div className="mf-sidebar-logo">MailFrame</div>
        <button
          className="mf-compose-btn"
          onClick={() => { setCompose({ type: "new" }); setSidebarOpen(false); }}
        >
          + Compose
        </button>
        <nav>
          <ul className="mf-folder-list" role="list" aria-label="Folders">
            {folders.map((folder) => (
              <li
                key={folder.id}
                role="button"
                tabIndex={0}
                aria-selected={folder.id === activeFolderId}
                className={`mf-folder-item${folder.id === activeFolderId ? " active" : ""}`}
                onClick={() => {
                  setActiveFolderId(folder.id);
                  setSidebarOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveFolderId(folder.id);
                    setSidebarOpen(false);
                  }
                }}
              >
                <span>{folder.label}</span>
                {(folder.unreadCount ?? 0) > 0 && (
                  <span
                    className="mf-folder-count"
                    aria-label={`${folder.unreadCount} unread`}
                  >
                    {folder.unreadCount}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="mf-sidebar-footer">
          <button
            ref={settingsBtnRef}
            className="mf-settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </aside>

      {/* Message list */}
      <section className="mf-list" aria-label="Message list">
        <div className="mf-list-header">
          <button
            className="mf-menu-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
          <input
            type="checkbox"
            className="mf-select-all"
            checked={allSelected}
            onChange={handleSelectAll}
            title="Select all"
            aria-label="Select all messages"
          />
          <span className="mf-list-title">{activeFolder?.label ?? "Inbox"}</span>
        </div>

        {/* Bulk action bar */}
        {bulkActive && (
          <div className="mf-bulk-bar" role="toolbar" aria-label="Bulk actions">
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
            aria-label="Search messages"
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {mailboxLoading && (
          <div className="mf-messages-status" aria-live="polite" aria-busy="true">
            <div className="mf-skeleton-row" />
            <div className="mf-skeleton-row" />
            <div className="mf-skeleton-row" />
            <div className="mf-skeleton-row" />
            <div className="mf-skeleton-row" />
          </div>
        )}

        {!mailboxLoading && mailboxError && (
          <div className="mf-messages-error" role="alert">
            <span>⚠ {mailboxError}</span>
          </div>
        )}

        {!mailboxLoading && !mailboxError && messages.length === 0 && (
          <div className="mf-messages-empty">No messages</div>
        )}

        {!mailboxLoading && !mailboxError && messages.length > 0 && (
          <ul
            ref={messagesListRef}
            className="mf-messages"
            role="list"
            aria-label="Messages"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const msg = messages[virtualItem.index];
                return (
                  <li
                    key={msg.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${msg.unread ? "Unread, " : ""}From ${msg.sender}: ${msg.subject}`}
                    aria-selected={selectedId === msg.id}
                    className={[
                      "mf-message-row",
                      msg.unread ? "unread" : "",
                      selectedId === msg.id ? "selected" : "",
                      selectedIds.has(msg.id) ? "checked" : "",
                    ].filter(Boolean).join(" ")}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    onClick={() => { setSelectedId(msg.id); setSelectedIds(new Set()); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(msg.id);
                        setSelectedIds(new Set());
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      className="mf-message-check"
                      checked={selectedIds.has(msg.id)}
                      aria-label={`Select message from ${msg.sender}`}
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
                      aria-label={msg.starred ? "Unstar message" : "Star message"}
                      aria-pressed={msg.starred}
                    >
                      {msg.starred ? "★" : "☆"}
                    </button>
                  </li>
                );
              })}
            </div>
          </ul>
        )}
      </section>

      {/* Reading pane */}
      <main
        className={`mf-pane${selectedId ? " has-message" : ""}`}
        aria-label="Reading pane"
      >
        {!selectedId && (
          <div className="mf-pane-empty">Select a message to read</div>
        )}
        {selectedId && detailLoading && (
          <div className="mf-pane-loading" aria-live="polite" aria-busy="true">Loading…</div>
        )}
        {selectedId && !detailLoading && detail && (
          <>
            <div className="mf-pane-header">
              <button
                className="mf-pane-back"
                onClick={() => setSelectedId(null)}
                aria-label="Back to message list"
              >
                ← Back
              </button>
              <div className="mf-pane-subject">{detail.subject}</div>
              <div className="mf-pane-meta">
                <span className="mf-pane-sender">{detail.sender}</span>
                <span className="mf-pane-timestamp">{detail.timestamp}</span>
              </div>
            </div>
            <div className="mf-pane-actions" role="toolbar" aria-label="Message actions">
              <button className="mf-action-btn" onClick={handleReply}>Reply</button>
              <button className="mf-action-btn" onClick={handleForward}>Forward</button>
              <button className="mf-action-btn" onClick={handleMarkUnread}>Mark unread</button>
              <button className="mf-action-btn" onClick={() => handleArchive()}>Archive</button>
              {moveTargets.length > 0 && (
                <select
                  className="mf-move-select"
                  defaultValue=""
                  aria-label="Move to folder"
                  onChange={(e) => {
                    if (e.target.value) { handleMove(e.target.value); e.target.value = ""; }
                  }}
                >
                  <option value="" disabled>Move to…</option>
                  {moveTargets.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              )}
              <button className="mf-action-btn danger" onClick={() => handleDelete()}>
                Delete
              </button>
            </div>
            <div
              className="mf-pane-body"
              role="article"
              aria-label={detail.subject}
            >
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
