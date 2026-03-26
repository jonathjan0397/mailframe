import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
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
  | { type: "replyAll"; to: string; cc: string; subject: string }
  | { type: "forward"; subject: string; body: string[] };

type ThreadGroup = {
  key: string;
  latestMsg: MailItem;
  count: number;
  unreadCount: number;
  senders: string[];
};

function normalizeSubject(subject: string): string {
  return subject.replace(/^(re|fwd?|fw):\s*/gi, "").trim().toLowerCase();
}

function buildThreadGroups(msgs: MailItem[]): ThreadGroup[] {
  const map = new Map<string, MailItem[]>();
  for (const msg of msgs) {
    const key = normalizeSubject(msg.subject) || msg.subject.toLowerCase();
    const group = map.get(key) ?? [];
    group.push(msg);
    map.set(key, group);
  }
  const groups: ThreadGroup[] = [];
  for (const [key, items] of map) {
    const latestMsg = items[0];
    const unreadCount = items.filter((m) => m.unread).length;
    const uniqueSenders = [...new Set(items.map((m) => m.sender))];
    groups.push({ key, latestMsg, count: items.length, unreadCount, senders: uniqueSenders });
  }
  return groups;
}

const CONTACTS_KEY = "mailframe-contacts";

const SYSTEM_FOLDER_IDS = new Set([
  "INBOX", "Sent", "Sent Items", "Drafts", "Trash", "Junk", "Spam", "Archive",
]);

function saveContact(sender: string) {
  if (!sender || sender === "Unknown") return;
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    const contacts: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!contacts.includes(sender)) {
      contacts.unshift(sender);
      if (contacts.length > 200) contacts.length = 200;
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
    }
  } catch { /* ignore */ }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [threadView, setThreadView] = useState(false);
  const [expandedThreadKey, setExpandedThreadKey] = useState<string | null>(null);
  // Folder management
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const messagesListRef = useRef<HTMLUListElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const provider = useMemo(
    () => (providerId === "demo" ? demoProvider : apiProvider),
    [providerId],
  );

  // Total unread across all folders for tab title
  const totalUnread = useMemo(
    () => folders.reduce((sum, f) => sum + (f.unreadCount ?? 0), 0),
    [folders],
  );

  const threadGroups = useMemo(
    () => (threadView ? buildThreadGroups(messages) : []),
    [messages, threadView],
  );

  // Apply theme
  useEffect(() => {
    const theme = themeRegistry.find((t) => t.id === activeThemeId) ?? themeRegistry[0];
    applyTheme(theme);
  }, [activeThemeId]);

  // Tab title badge
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) MailFrame` : "MailFrame";
    return () => { document.title = "MailFrame"; };
  }, [totalUnread]);

  // Request notification permission once (bridge mode)
  useEffect(() => {
    if (providerId !== "api") return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [providerId]);

  // Clear selection when provider or folder changes
  useEffect(() => {
    setSelectedId(null);
    setSelectedIds(new Set());
    setDetail(null);
    setDetailLoading(false);
    setExpandedThreadKey(null);
  }, [provider, activeFolderId]);

  // Keep message-id ref in sync for polling
  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  // Load mailbox (page 1 on context change or manual refresh)
  useEffect(() => {
    let cancelled = false;
    setMailboxLoading(true);
    setMailboxError(null);
    setHasNextPage(false);
    setPage(1);
    setNewMessageCount(0);
    provider.getMailboxSnapshot({ folderId: activeFolderId, query: search, page: 1 })
      .then((snapshot) => {
        if (cancelled) return;
        setFolders(snapshot.folders);
        setMessages(snapshot.messages);
        setHasNextPage(snapshot.meta?.hasNextPage ?? false);
        setMailboxLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setMailboxError(e instanceof Error ? e.message : "Failed to load mailbox.");
        setMailboxLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeFolderId, search, provider, refreshToken]);

  // Poll for new messages every 60s (bridge mode only)
  useEffect(() => {
    if (providerId === "demo") return;
    const timer = setInterval(() => {
      provider.getMailboxSnapshot({ folderId: activeFolderId, query: search, page: 1 })
        .then((snapshot) => {
          const incoming = snapshot.messages.filter(
            (m) => !messageIdsRef.current.has(m.id),
          );
          if (incoming.length > 0) {
            setNewMessageCount((n) => n + incoming.length);
            if ("Notification" in window && Notification.permission === "granted") {
              const body = incoming
                .slice(0, 3)
                .map((m) => `${m.sender}: ${m.subject}`)
                .join("\n");
              new Notification(
                `${incoming.length} new message${incoming.length !== 1 ? "s" : ""}`,
                { body, icon: "/favicon.ico" },
              );
            }
          }
          setFolders(snapshot.folders);
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, [activeFolderId, search, provider, providerId]);

  // Load detail
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    setMessages((prev) => prev.map((m) => m.id === selectedId ? { ...m, unread: false } : m));
    provider.markRead?.([selectedId], true);
    provider.getMessageDetail(selectedId).then((d) => {
      if (!cancelled) {
        setDetail(d);
        setDetailLoading(false);
        saveContact(d.sender);
      }
    });
    return () => { cancelled = true; };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Return focus to settings button on panel close
  useEffect(() => {
    if (!settingsOpen) settingsBtnRef.current?.focus();
  }, [settingsOpen]);

  // Focus new folder input when create mode activates
  useEffect(() => {
    if (creatingFolder) newFolderInputRef.current?.focus();
  }, [creatingFolder]);

  // Register stable keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function handleSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(value), 250);
  }

  function handleManualRefresh() {
    setNewMessageCount(0);
    setRefreshToken((n) => n + 1);
  }

  function handleLoadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    provider.getMailboxSnapshot({ folderId: activeFolderId, query: search, page: nextPage })
      .then((snapshot) => {
        setMessages((prev) => [...prev, ...snapshot.messages]);
        setHasNextPage(snapshot.meta?.hasNextPage ?? false);
        setPage(nextPage);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }

  function reloadFolders() {
    provider.getMailboxSnapshot({ folderId: activeFolderId, query: "", page: 1 })
      .then((snapshot) => setFolders(snapshot.folders))
      .catch(() => {});
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    provider.createFolder?.(name)
      .then(() => {
        setCreatingFolder(false);
        setNewFolderName("");
        reloadFolders();
        showToast(`Folder "${name}" created`);
      })
      .catch(() => showToast("Failed to create folder"));
  }

  function handleDeleteFolder(folder: MailFolder) {
    if (!window.confirm(`Delete folder "${folder.label}"? This cannot be undone.`)) return;
    provider.deleteFolder?.(folder.id)
      .then(() => {
        if (activeFolderId === folder.id) setActiveFolderId("INBOX");
        reloadFolders();
        showToast(`Folder "${folder.label}" deleted`);
      })
      .catch(() => showToast("Failed to delete folder"));
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

  function handleSpam() {
    const ids = selectedIds.size > 0 ? [...selectedIds] : selectedId ? [selectedId] : [];
    if (!ids.length) return;
    const spamFolder = folders.find(
      (f) => ["Junk", "Spam"].includes(f.label) || ["Junk", "Spam", "JUNK", "SPAM"].includes(f.id),
    );
    if (!spamFolder) { showToast("No spam folder found"); return; }
    provider.moveMessages?.(ids, spamFolder.id);
    removeMessages(ids);
    showToast("Marked as spam");
  }

  function handlePrint() {
    window.print();
  }

  function handleEmptyFolder() {
    provider.emptyFolder?.(activeFolderId)
      .then(() => {
        setMessages([]);
        setHasNextPage(false);
        showToast("Folder emptied");
      })
      .catch(() => showToast("Failed to empty folder"));
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

  async function handleDownloadAttachment(partId: string, filename: string) {
    if (!detail || !provider.getAttachment) return;
    try {
      const result = await provider.getAttachment(detail.id, partId);
      const binary = atob(result.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename || filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast("Download failed");
    }
  }

  const handleReply = useCallback(() => {
    if (!detail) return;
    setCompose({ type: "reply", to: detail.sender, subject: `Re: ${detail.subject}` });
  }, [detail]);

  const handleReplyAll = useCallback(() => {
    if (!detail) return;
    const allRecipients = [...(detail.to ?? []), ...(detail.cc ?? [])].join(", ");
    setCompose({
      type: "replyAll",
      to: detail.sender,
      cc: allRecipients,
      subject: `Re: ${detail.subject}`,
    });
  }, [detail]);

  const handleForward = useCallback(() => {
    if (!detail) return;
    setCompose({ type: "forward", subject: `Fwd: ${detail.subject}`, body: detail.body });
  }, [detail]);

  // Update keyboard handler ref on every render
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    ) return;

    if (e.key === "Escape") {
      if (showKeyboardHelp) { setShowKeyboardHelp(false); return; }
      if (compose) { setCompose(null); return; }
      if (settingsOpen) { setSettingsOpen(false); return; }
      if (creatingFolder) { setCreatingFolder(false); setNewFolderName(""); return; }
      if (selectedId) { setSelectedId(null); return; }
      return;
    }

    if (compose || settingsOpen || showKeyboardHelp) return;

    switch (e.key) {
      case "c": setCompose({ type: "new" }); break;
      case "r": if (detail) handleReply(); break;
      case "a": if (detail) handleReplyAll(); break;
      case "f": if (detail) handleForward(); break;
      case "e": handleArchive(); break;
      case "#": handleDelete(); break;
      case "u": handleMarkUnread(); break;
      case "?": setShowKeyboardHelp(true); break;
    }
  };

  const rowVirtualizer = useVirtualizer({
    count: threadView ? threadGroups.length : messages.length,
    getScrollElement: () => messagesListRef.current,
    estimateSize: () => 73,
    overscan: 8,
  });

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const moveTargets = folders.filter((f) => f.id !== activeFolderId && f.id !== "Trash");
  const bulkActive = selectedIds.size > 0;
  const allSelected = messages.length > 0 && selectedIds.size === messages.length;
  const isTrash = activeFolder?.label === "Trash" || activeFolderId === "Trash";
  const hasReplyAll = !!(detail?.to?.length || detail?.cc?.length);
  const canManageFolders = providerId === "api" && !!provider.createFolder;

  return (
    <div className="mf-shell">
      {/* Keyboard shortcut help overlay */}
      {showKeyboardHelp && (
        <div className="mf-kb-overlay" onClick={() => setShowKeyboardHelp(false)}>
          <div
            className="mf-kb-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mf-kb-header">
              <span>Keyboard shortcuts</span>
              <button
                className="mf-kb-close"
                onClick={() => setShowKeyboardHelp(false)}
                aria-label="Close keyboard shortcuts"
              >
                ✕
              </button>
            </div>
            <dl className="mf-kb-grid">
              <dt><kbd>c</kbd></dt><dd>Compose</dd>
              <dt><kbd>r</kbd></dt><dd>Reply</dd>
              <dt><kbd>a</kbd></dt><dd>Reply All</dd>
              <dt><kbd>f</kbd></dt><dd>Forward</dd>
              <dt><kbd>e</kbd></dt><dd>Archive</dd>
              <dt><kbd>#</kbd></dt><dd>Delete</dd>
              <dt><kbd>u</kbd></dt><dd>Mark as unread</dd>
              <dt><kbd>?</kbd></dt><dd>Show shortcuts</dd>
              <dt><kbd>Esc</kbd></dt><dd>Close / deselect</dd>
            </dl>
          </div>
        </div>
      )}

      {/* Compose modal */}
      {compose && (
        <ComposeModal
          initialTo={compose.type === "reply" || compose.type === "replyAll" ? compose.to : ""}
          initialCc={compose.type === "replyAll" ? compose.cc : ""}
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
          <div className="mf-folders-header">
            <span className="mf-folders-label">Folders</span>
            {canManageFolders && (
              <button
                className="mf-folder-create-btn"
                onClick={() => setCreatingFolder(true)}
                aria-label="New folder"
                title="New folder"
              >
                ＋
              </button>
            )}
          </div>

          <ul className="mf-folder-list" role="list" aria-label="Folders">
            {folders.map((folder) => (
              <li
                key={folder.id}
                role="button"
                tabIndex={0}
                aria-selected={folder.id === activeFolderId}
                className={`mf-folder-item${folder.id === activeFolderId ? " active" : ""}`}
                onClick={() => { setActiveFolderId(folder.id); setSidebarOpen(false); }}
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
                {canManageFolders && !SYSTEM_FOLDER_IDS.has(folder.id) && (
                  <button
                    className="mf-folder-delete-btn"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                    aria-label={`Delete ${folder.label}`}
                    title={`Delete ${folder.label}`}
                  >
                    🗑
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* Inline new folder form */}
          {creatingFolder && (
            <div className="mf-folder-create-form">
              <input
                ref={newFolderInputRef}
                className="mf-folder-create-input"
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                aria-label="New folder name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                }}
              />
              <button
                className="mf-folder-create-confirm"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                aria-label="Create folder"
              >
                ✓
              </button>
              <button
                className="mf-folder-create-cancel"
                onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>
          )}
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
          <button
            className="mf-settings-btn"
            onClick={() => setShowKeyboardHelp(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            style={{ marginLeft: "4px" }}
          >
            ?
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
          <button
            className={`mf-thread-toggle${threadView ? " active" : ""}`}
            onClick={() => { setThreadView((v) => !v); setExpandedThreadKey(null); }}
            title={threadView ? "Flat view" : "Thread view"}
            aria-label={threadView ? "Switch to flat view" : "Switch to thread view"}
            aria-pressed={threadView}
          >
            ⋮≡
          </button>
          {newMessageCount > 0 && (
            <button
              className="mf-new-badge"
              onClick={handleManualRefresh}
              aria-label={`${newMessageCount} new message${newMessageCount !== 1 ? "s" : ""}, click to refresh`}
            >
              {newMessageCount} new ↑
            </button>
          )}
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
            placeholder="Search — try from: subject: is:unread is:starred"
            aria-label="Search messages"
            title="Filters: from:name  subject:word  is:unread  is:starred"
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
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const rowStyle: React.CSSProperties = {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                };

                if (threadView) {
                  const group = threadGroups[virtualItem.index];
                  const isSelected = expandedThreadKey === group.key;
                  const senderDisplay =
                    group.senders.length > 2
                      ? `${group.senders.slice(0, 2).join(", ")} & ${group.senders.length - 2} more`
                      : group.senders.join(", ");
                  return (
                    <li
                      key={group.key}
                      role="button"
                      tabIndex={0}
                      aria-label={`Thread: ${group.latestMsg.subject}, ${group.count} messages`}
                      aria-selected={isSelected}
                      className={[
                        "mf-message-row",
                        group.unreadCount > 0 ? "unread" : "",
                        isSelected ? "selected" : "",
                      ].filter(Boolean).join(" ")}
                      style={rowStyle}
                      onClick={() => {
                        setExpandedThreadKey(group.key);
                        setSelectedId(group.latestMsg.id);
                        setSelectedIds(new Set());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedThreadKey(group.key);
                          setSelectedId(group.latestMsg.id);
                          setSelectedIds(new Set());
                        }
                      }}
                    >
                      <div className="mf-message-content">
                        <div className="mf-message-top">
                          <span className="mf-message-sender">{senderDisplay}</span>
                          <span className="mf-message-timestamp">{group.latestMsg.timestamp}</span>
                        </div>
                        <div className="mf-message-subject">
                          {group.latestMsg.subject}
                          {group.count > 1 && (
                            <span className="mf-thread-count">{group.count}</span>
                          )}
                        </div>
                        <div className="mf-message-preview">{group.latestMsg.preview}</div>
                      </div>
                      <button
                        className={`mf-star-btn${group.latestMsg.starred ? " starred" : ""}`}
                        onClick={(e) => handleStar(group.latestMsg.id, e)}
                        aria-label={group.latestMsg.starred ? "Unstar" : "Star"}
                        aria-pressed={group.latestMsg.starred}
                      >
                        {group.latestMsg.starred ? "★" : "☆"}
                      </button>
                    </li>
                  );
                }

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
                    style={rowStyle}
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

        {/* Empty Trash */}
        {isTrash && messages.length > 0 && !mailboxLoading && provider.emptyFolder && (
          <div className="mf-load-more">
            <button className="mf-empty-trash-btn" onClick={handleEmptyFolder}>
              Empty Trash
            </button>
          </div>
        )}

        {/* Load more */}
        {hasNextPage && !mailboxLoading && (
          <div className="mf-load-more">
            <button
              className="mf-load-more-btn"
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
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
                <div className="mf-pane-addresses">
                  <span className="mf-pane-sender">From: {detail.sender}</span>
                  {detail.to && detail.to.length > 0 && (
                    <span className="mf-pane-recipients">To: {detail.to.join(", ")}</span>
                  )}
                  {detail.cc && detail.cc.length > 0 && (
                    <span className="mf-pane-recipients">CC: {detail.cc.join(", ")}</span>
                  )}
                </div>
                <span className="mf-pane-timestamp">{detail.timestamp}</span>
              </div>
            </div>

            <div className="mf-pane-actions" role="toolbar" aria-label="Message actions">
              <button className="mf-action-btn" onClick={handleReply}>Reply</button>
              {hasReplyAll && (
                <button className="mf-action-btn" onClick={handleReplyAll}>Reply All</button>
              )}
              <button className="mf-action-btn" onClick={handleForward}>Forward</button>
              <button className="mf-action-btn" onClick={handleMarkUnread}>Mark unread</button>
              <button className="mf-action-btn" onClick={() => handleArchive()}>Archive</button>
              <button className="mf-action-btn" onClick={handleSpam}>Spam</button>
              <button className="mf-action-btn" onClick={handlePrint}>Print</button>
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

            {threadView && expandedThreadKey && (() => {
              const threadMsgs = messages.filter(
                (m) => (normalizeSubject(m.subject) || m.subject.toLowerCase()) === expandedThreadKey,
              );
              if (threadMsgs.length <= 1) return null;
              return (
                <div className="mf-thread-panel" aria-label="Thread messages">
                  <div className="mf-thread-panel-label">{threadMsgs.length} messages in thread</div>
                  <ul className="mf-thread-list" role="list">
                    {threadMsgs.map((m) => (
                      <li
                        key={m.id}
                        role="button"
                        tabIndex={0}
                        className={`mf-thread-item${selectedId === m.id ? " selected" : ""}${m.unread ? " unread" : ""}`}
                        aria-selected={selectedId === m.id}
                        onClick={() => { setSelectedId(m.id); setSelectedIds(new Set()); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(m.id);
                            setSelectedIds(new Set());
                          }
                        }}
                      >
                        <span className="mf-thread-item-sender">{m.sender}</span>
                        <span className="mf-thread-item-subject">{m.subject}</span>
                        <span className="mf-thread-item-ts">{m.timestamp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {detail.bodyHtml ? (
              <div
                className="mf-pane-html"
                role="article"
                aria-label={detail.subject}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(detail.bodyHtml, {
                    ALLOWED_TAGS: [
                      "a", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
                      "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure",
                      "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins",
                      "li", "mark", "ol", "p", "pre", "q", "s", "small", "span",
                      "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th",
                      "thead", "tr", "u", "ul",
                    ],
                    ALLOWED_ATTR: [
                      "href", "src", "alt", "title", "class", "style",
                      "width", "height", "align", "valign", "colspan", "rowspan",
                      "cellpadding", "cellspacing", "border", "bgcolor",
                    ],
                    FORCE_BODY: true,
                  }),
                }}
              />
            ) : (
              <div
                className="mf-pane-body"
                role="article"
                aria-label={detail.subject}
              >
                {detail.body.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            )}

            {detail.attachments && detail.attachments.length > 0 && (
              <div className="mf-pane-attachments">
                <div className="mf-attachments-label">
                  Attachments ({detail.attachments.length})
                </div>
                <ul className="mf-attachments-list">
                  {detail.attachments.map((att) => (
                    <li key={att.partId} className="mf-attachment-item">
                      <span className="mf-att-icon">📎</span>
                      <span className="mf-att-name">{att.filename}</span>
                      <span className="mf-att-size">{formatFileSize(att.size)}</span>
                      {provider.getAttachment && (
                        <button
                          className="mf-att-download"
                          onClick={() => handleDownloadAttachment(att.partId, att.filename)}
                          aria-label={`Download ${att.filename}`}
                        >
                          ↓ Download
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
