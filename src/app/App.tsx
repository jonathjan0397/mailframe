import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { useVirtualizer } from "@tanstack/react-virtual";
import { applyTheme } from "../themes/tokens";
import { themeRegistry } from "../themes/registry";
import { demoProvider } from "../features/mail/providers/demo-provider";
import { apiProvider } from "../features/mail/providers/api-provider";
import { ComposeModal } from "./ComposeModal";
import { LoginPage } from "./LoginPage";
import { SettingsPanel } from "./SettingsPanel";
import type { ProviderId } from "./SettingsPanel";
import type { MailItem, MailMessageDetail, MailFolder } from "../lib/mail-types";
import type { SendPayload } from "../features/mail/provider";

type ComposeMode =
  | { type: "new" }
  | { type: "reply"; to: string; subject: string; bodyHtml: string }
  | { type: "replyAll"; to: string; cc: string; subject: string; bodyHtml: string }
  | { type: "forward"; subject: string; bodyHtml: string };

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

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildReplyHtml(
  detail: { sender: string; subject: string; timestamp: string; body: string[]; bodyHtml?: string },
  type: "reply" | "replyAll" | "forward",
): string {
  const sig = (() => { try { return localStorage.getItem("mailframe-signature") ?? ""; } catch { return ""; } })();
  const sigBlock = sig
    ? `<p>--&nbsp;<br>${escHtml(sig).replace(/\n/g, "<br>")}</p>`
    : "";

  const originalHtml = detail.bodyHtml
    ? detail.bodyHtml
    : detail.body.map((l) => `<p>${escHtml(l)}</p>`).join("");

  if (type === "forward") {
    return (
      `<p><br></p>${sigBlock}` +
      `<div class="mf-reply-quote">` +
      `<p style="color:#5f6368;font-size:13px;">---------- Forwarded message ----------</p>` +
      `<p style="font-size:13px;color:#5f6368;"><b>From:</b> ${escHtml(detail.sender)}</p>` +
      `<p style="font-size:13px;color:#5f6368;"><b>Date:</b> ${escHtml(detail.timestamp)}</p>` +
      `<p style="font-size:13px;color:#5f6368;"><b>Subject:</b> ${escHtml(detail.subject)}</p>` +
      `<br>${originalHtml}</div>`
    );
  }

  return (
    `<p><br></p>${sigBlock}` +
    `<div class="mf-reply-quote">` +
    `<p style="color:#5f6368;font-size:13px;">On ${escHtml(detail.timestamp)}, ${escHtml(detail.sender)} wrote:</p>` +
    `<blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:8px 0;color:#444;">${originalHtml}</blockquote>` +
    `</div>`
  );
}

const CONTACTS_KEY = "mailframe-contacts";
const SNOOZE_KEY = "mailframe-snoozed";
const LIST_WIDTH_KEY = "mailframe-list-width";
const SIGNATURE_KEY = "mailframe-signature";
const DRAFT_KEY = "mailframe-draft";
const SCHEDULED_KEY = "mailframe-scheduled";

type SnoozedEntry = { id: string; wakeAt: number };

type MailNotif = { id: string; sender: string; subject: string; msgId: string };

function playNotifSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    // Two-tone chime: high note then lower note
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046, ctx.currentTime);        // C6
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.12);  // G5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);
    osc.onended = () => ctx.close();
  } catch { /* AudioContext not available */ }
}

function getSnoozed(): SnoozedEntry[] {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "[]") as SnoozedEntry[]; }
  catch { return []; }
}

function nextDayAt(hour: number): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function nextWeekdayAt(targetDay: number, hour: number): number {
  const d = new Date();
  const daysAhead = ((targetDay - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

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

function formatTs(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (msgDayStart === todayStart) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function resolveInlineImages(
  html: string,
  messageId: string,
  inlineParts: Array<{ cid: string; partId: string }>,
  apiBase: string,
): string {
  let out = html;
  for (const p of inlineParts) {
    const url = `${apiBase}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(p.partId)}`;
    // Replace both bare cid: and quoted cid: variants
    out = out.split(`cid:${p.cid}`).join(url);
  }
  return out;
}

export function App() {
  const [activeThemeId, setActiveThemeId] = useState(
    () => localStorage.getItem("mailframe-theme") ?? themeRegistry[0].id,
  );
  const [providerId, setProviderId] = useState<ProviderId>(
    () => (localStorage.getItem("mailframe-provider") as ProviderId | null) ?? "demo",
  );
  // Auth state: null = checking, false = not logged in, email string = logged in
  const [authState, setAuthState] = useState<null | false | string>(null);
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
  type AttachmentPreview = { filename: string; mimeType: string; data: string };
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null); // partId being loaded
  const [imageThumbs, setImageThumbs] = useState<Record<string, string>>({}); // partId -> dataUrl

  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [mailNotifs, setMailNotifs] = useState<MailNotif[]>([]);
  const [apiOnline, setApiOnline] = useState(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  type SortBy = "date-desc" | "date-asc" | "unread" | "starred" | "sender" | "subject";
  const [sortBy, setSortBy] = useState<SortBy>("date-desc");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceContent, setSourceContent] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [threadView, setThreadView] = useState(false);
  const [expandedThreadKey, setExpandedThreadKey] = useState<string | null>(null);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(() => {
    const entries = getSnoozed();
    const now = Date.now();
    return new Set(entries.filter((e) => e.wakeAt > now).map((e) => e.id));
  });
  const [snoozePicker, setSnoozePicker] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(LIST_WIDTH_KEY) ?? "380", 10);
    return isNaN(saved) ? 380 : Math.max(200, Math.min(700, saved));
  });
  // Folder management
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Signature (server-synced when in API mode)
  const [signature, setSignature] = useState(() => {
    try { return localStorage.getItem(SIGNATURE_KEY) ?? ""; } catch { return ""; }
  });

  // Undo send
  type PendingSend = { payload: SendPayload; timerId: ReturnType<typeof setTimeout> };
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);

  // Scheduled sends
  type ScheduledSend = { id: string; payload: SendPayload; scheduledAt: number };
  const [scheduledSends, setScheduledSends] = useState<ScheduledSend[]>(() => {
    try { return JSON.parse(localStorage.getItem(SCHEDULED_KEY) ?? "[]") as ScheduledSend[]; }
    catch { return []; }
  });
  const scheduledSendsRef = useRef(scheduledSends);
  scheduledSendsRef.current = scheduledSends;

  // Multiple accounts
  const [accounts, setAccounts] = useState<string[]>([]);
  const [addingAccount, setAddingAccount] = useState(false);
  const [addAccountEmail, setAddAccountEmail] = useState("");
  const [addAccountPass, setAddAccountPass] = useState("");
  const [addAccountError, setAddAccountError] = useState("");

  // Quick reply
  const [quickReply, setQuickReply] = useState("");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const messagesListRef = useRef<HTMLUListElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const listWidthRef = useRef(listWidth);
  listWidthRef.current = listWidth;

  const provider = useMemo(
    () => (providerId === "demo" ? demoProvider : apiProvider),
    [providerId],
  );

  // Total unread across all folders for tab title
  const totalUnread = useMemo(
    () => folders.reduce((sum, f) => sum + (f.unreadCount ?? 0), 0),
    [folders],
  );

  const visibleMessages = useMemo(
    () =>
      activeFolderId === "INBOX"
        ? messages.filter((m) => !snoozedIds.has(m.id))
        : messages,
    [messages, snoozedIds, activeFolderId],
  );

  const sortedMessages = useMemo(() => {
    const list = [...visibleMessages];
    switch (sortBy) {
      case "date-desc": return list; // server already returns newest-first
      case "date-asc":  return list.reverse();
      case "unread":    return list.filter((m) => m.unread);
      case "starred":   return list.filter((m) => m.starred);
      case "sender":    return list.sort((a, b) => a.sender.localeCompare(b.sender));
      case "subject":   return list.sort((a, b) => a.subject.localeCompare(b.subject));
      default:          return list;
    }
  }, [visibleMessages, sortBy]);

  const threadGroups = useMemo(
    () => (threadView ? buildThreadGroups(sortedMessages) : []),
    [sortedMessages, threadView],
  );

  // Apply theme + persist selection
  useEffect(() => {
    localStorage.setItem("mailframe-theme", activeThemeId);
    if (activeThemeId === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = () => {
        const dark = themeRegistry.find((t) => t.id === "eclipse") ?? themeRegistry[0];
        const light = themeRegistry.find((t) => t.id === "lumen") ?? themeRegistry[0];
        applyTheme(mq.matches ? dark : light);
      };
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    const theme = themeRegistry.find((t) => t.id === activeThemeId) ?? themeRegistry[0];
    applyTheme(theme);
  }, [activeThemeId]);

  // Check auth when switching to bridge provider
  useEffect(() => {
    if (providerId !== "api") { setAuthState(null); setAccounts([]); return; }
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4010";
    fetch(`${apiBase}/auth/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { ok: boolean; email?: string; accounts?: string[] }) => {
        setAuthState(d.ok && d.email ? d.email : false);
        setAccounts(d.ok && d.accounts ? d.accounts : []);
      })
      .catch(() => { setAuthState(false); setAccounts([]); });
  }, [providerId]);

  // Load settings from server after login
  useEffect(() => {
    if (typeof authState !== "string" || !provider.getSettings) return;
    provider.getSettings().then((s) => {
      if (typeof s.theme === "string") setActiveThemeId(s.theme);
      if (typeof s.signature === "string") {
        setSignature(s.signature);
        try {
          if (s.signature) localStorage.setItem(SIGNATURE_KEY, s.signature);
          else localStorage.removeItem(SIGNATURE_KEY);
        } catch { /* ignore */ }
      }
    }).catch(() => { /* server settings unavailable — keep local values */ });
  }, [authState]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleSaveSettings(patch: Record<string, unknown>) {
    if (!provider.saveSettings) return;
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = setTimeout(() => {
      provider.saveSettings?.(patch).catch(() => {});
    }, 800);
  }

  function handleThemeChange(id: string) {
    setActiveThemeId(id);
    scheduleSaveSettings({ theme: id });
  }

  function handleSignatureChange(val: string) {
    setSignature(val);
    try {
      if (val) localStorage.setItem(SIGNATURE_KEY, val);
      else localStorage.removeItem(SIGNATURE_KEY);
    } catch { /* ignore */ }
    scheduleSaveSettings({ signature: val });
  }

  async function handleLogout() {
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4010";
    await fetch(`${apiBase}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setAuthState(false);
    setAccounts([]);
    setSelectedId(null);
    setDetail(null);
    setMessages([]);
  }

  async function handleSwitchAccount(email: string) {
    if (!provider.switchAccount) return;
    try {
      const res = await provider.switchAccount(email);
      setAuthState(res.email);
      setAccounts(res.accounts);
      setSelectedId(null);
      setDetail(null);
      setMessages([]);
      setRefreshToken((n) => n + 1);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Switch failed");
    }
  }

  async function handleLogoutAccount(email: string) {
    if (!provider.logoutAccount) return;
    try {
      const res = await provider.logoutAccount(email);
      if (res.accounts.length === 0) {
        setAuthState(false);
        setAccounts([]);
        setSelectedId(null);
        setDetail(null);
        setMessages([]);
      } else {
        setAccounts(res.accounts);
        if (email === authState) {
          const next = res.email ?? res.accounts[0];
          setAuthState(next);
          setSelectedId(null);
          setDetail(null);
          setMessages([]);
          setRefreshToken((n) => n + 1);
        }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Remove account failed");
    }
  }

  async function handleAddAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addAccountEmail.trim() || !addAccountPass) return;
    setAddAccountError("");
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4010";
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: addAccountEmail.trim(), password: addAccountPass }),
      });
      const data = await res.json() as { error?: string; accounts?: string[]; email?: string };
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      setAccounts(data.accounts ?? [addAccountEmail.trim()]);
      setAddingAccount(false);
      setAddAccountEmail("");
      setAddAccountPass("");
      showToast(`Added ${addAccountEmail.trim()}`);
    } catch (err) {
      setAddAccountError(err instanceof Error ? err.message : "Login failed");
    }
  }

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
    setQuickReply("");
  }, [provider, activeFolderId]);

  // Keep message-id ref in sync for polling
  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  // Load mailbox (page 1 on context change or manual refresh)
  useEffect(() => {
    // Don't fetch until the user is authenticated (api provider) or on demo
    if (providerId === "api" && typeof authState !== "string") return;
    const ac = new AbortController();
    setMailboxLoading(true);
    setMailboxError(null);
    setHasNextPage(false);
    setPage(1);
    setNewMessageCount(0);
    provider.getMailboxSnapshot({ folderId: activeFolderId, query: search, page: 1, signal: ac.signal })
      .then((snapshot) => {
        if (!apiOnline) { setApiOnline(true); showToast("Reconnected"); }
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        setFolders(snapshot.folders);
        setMessages(snapshot.messages);
        setHasNextPage(snapshot.meta?.hasNextPage ?? false);
        setMailboxLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === "AbortError") return;
        const isNetwork = e instanceof TypeError;
        if (isNetwork) {
          setApiOnline(false);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => setRefreshToken((n) => n + 1), 15_000);
        }
        setMailboxError(e instanceof Error ? e.message : "Failed to load mailbox.");
        setMailboxLoading(false);
      });
    return () => ac.abort();
  }, [activeFolderId, search, provider, refreshToken, authState]); // eslint-disable-line react-hooks/exhaustive-deps

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
            setMessages((prev) => [...incoming, ...prev]);
            setNewMessageCount((n) => n + incoming.length);
            playNotifSound();
            // In-app popup cards (bottom-right)
            const notifs: MailNotif[] = incoming.slice(0, 5).map((m) => ({
              id: `${m.id}-${Date.now()}`,
              sender: m.sender,
              subject: m.subject,
              msgId: m.id,
            }));
            setMailNotifs((prev) => [...prev, ...notifs]);
            // Auto-dismiss each after 6s
            notifs.forEach((n) => {
              setTimeout(() => {
                setMailNotifs((prev) => prev.filter((x) => x.id !== n.id));
              }, 6000);
            });
            // Browser desktop notification (background)
            if ("Notification" in window && Notification.permission === "granted") {
              const title = incoming.length === 1
                ? incoming[0].sender
                : `${incoming.length} new messages`;
              const body = incoming.length === 1
                ? incoming[0].subject
                : incoming.slice(0, 3).map((m) => `${m.sender}: ${m.subject}`).join("\n");
              const icon = `${import.meta.env.BASE_URL}favicon.ico`;
              const tag = "mailframe-new-mail";
              const data = { url: window.location.href };
              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.ready
                  .then((reg) => reg.showNotification(title, { body, icon, tag, data }))
                  .catch(() => {
                    const n = new Notification(title, { body, icon, tag });
                    n.onclick = () => { window.focus(); n.close(); };
                    setTimeout(() => n.close(), 8000);
                  });
              } else {
                const n = new Notification(title, { body, icon, tag });
                n.onclick = () => { window.focus(); n.close(); };
                setTimeout(() => n.close(), 8000);
              }
            }
          }
          setFolders(snapshot.folders);
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, [activeFolderId, search, provider, providerId]);

  // Fire scheduled sends
  useEffect(() => {
    function checkScheduled() {
      const now = Date.now();
      const due = scheduledSendsRef.current.filter((s) => s.scheduledAt <= now);
      if (!due.length) return;
      const remaining = scheduledSendsRef.current.filter((s) => s.scheduledAt > now);
      setScheduledSends(remaining);
      try { localStorage.setItem(SCHEDULED_KEY, JSON.stringify(remaining)); } catch { /* ignore */ }
      for (const s of due) provider.sendMessage?.(s.payload);
      showToast(`${due.length} scheduled message${due.length > 1 ? "s" : ""} sent`);
    }
    checkScheduled();
    const timer = setInterval(checkScheduled, 30_000);
    return () => clearInterval(timer);
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load detail
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    const ac = new AbortController();
    setDetailLoading(true);
    setMessages((prev) => prev.map((m) => m.id === selectedId ? { ...m, unread: false } : m));
    provider.markRead?.([selectedId], true);
    provider.getMessageDetail(selectedId, ac.signal).then((d) => {
      setDetail(d);
      setDetailLoading(false);
      saveContact(d.sender);
    }).catch((e: unknown) => {
      if ((e as { name?: string }).name === "AbortError") return;
      setDetailLoading(false);
    });
    return () => ac.abort();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load image thumbnails when detail changes
  useEffect(() => {
    setImageThumbs({});
    if (!detail?.attachments || !provider.getAttachment) return;
    let cancelled = false;
    const imageAtts = detail.attachments.filter((a) => a.mimeType.startsWith("image/"));
    for (const att of imageAtts) {
      provider.getAttachment(detail.id, att.partId).then((result) => {
        if (!cancelled) {
          setImageThumbs((prev) => ({
            ...prev,
            [att.partId]: `data:${result.mimeType};base64,${result.data}`,
          }));
        }
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Return focus to settings button on panel close
  useEffect(() => {
    if (!settingsOpen) settingsBtnRef.current?.focus();
  }, [settingsOpen]);

  // Focus new folder input when create mode activates
  useEffect(() => {
    if (creatingFolder) newFolderInputRef.current?.focus();
  }, [creatingFolder]);

  // Check for snoozed messages that have expired (on mount + window focus)
  useEffect(() => {
    function checkSnooze() {
      const entries = getSnoozed();
      const now = Date.now();
      const expired = entries.filter((e) => e.wakeAt <= now);
      if (expired.length > 0) {
        const remaining = entries.filter((e) => e.wakeAt > now);
        localStorage.setItem(SNOOZE_KEY, JSON.stringify(remaining));
        setSnoozedIds(new Set(remaining.map((e) => e.id)));
        setToast(`${expired.length} snoozed message${expired.length !== 1 ? "s" : ""} woke up`);
      }
    }
    checkSnooze();
    window.addEventListener("focus", checkSnooze);
    return () => window.removeEventListener("focus", checkSnooze);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close snooze picker when selected message changes
  useEffect(() => { setSnoozePicker(null); }, [selectedId]);

  // Reconnect when browser regains network access
  useEffect(() => {
    const handleOnline = () => {
      if (!apiOnline) setRefreshToken((n) => n + 1);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [apiOnline]);

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

  function handleSnooze(id: string, wakeAt: number) {
    const entries = getSnoozed().filter((e) => e.id !== id);
    entries.push({ id, wakeAt });
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(entries));
    setSnoozedIds((prev) => new Set([...prev, id]));
    setSnoozePicker(null);
    if (id === selectedId) { setSelectedId(null); setDetail(null); }
    const when = new Date(wakeAt);
    showToast(
      `Snoozed until ${when.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`,
    );
  }

  function handleResizerMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = listWidthRef.current;
    function onMove(ev: MouseEvent) {
      const next = Math.max(200, Math.min(700, startWidth + ev.clientX - startX));
      setListWidth(next);
      listWidthRef.current = next;
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      localStorage.setItem(LIST_WIDTH_KEY, String(listWidthRef.current));
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
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
    if (selectedIds.size === sortedMessages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedMessages.map((m) => m.id)));
    }
  }

  function handleSend(payload: SendPayload) {
    setCompose(null);
    // Cancel any in-flight undo send
    if (pendingSend) clearTimeout(pendingSend.timerId);
    if (toastTimer.current) clearTimeout(toastTimer.current);

    const timerId = setTimeout(() => {
      provider.sendMessage?.(payload);
      setPendingSend(null);
      showToast("Message sent");
    }, 7000);

    setPendingSend({ payload, timerId });
    setToast("Sending in 7s…");
  }

  function handleSendLater(payload: SendPayload, scheduledAt: number) {
    setCompose(null);
    const entry = { id: crypto.randomUUID(), payload, scheduledAt };
    const updated = [...scheduledSendsRef.current, entry];
    setScheduledSends(updated);
    try { localStorage.setItem(SCHEDULED_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    const when = new Date(scheduledAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    showToast(`Scheduled for ${when}`);
  }

  function handleUndoSend() {
    if (!pendingSend) return;
    clearTimeout(pendingSend.timerId);
    // Restore as draft so the user can re-open compose and recover
    try {
      const { payload } = pendingSend;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        to: payload.to, cc: payload.cc ?? "", bcc: payload.bcc ?? "",
        subject: payload.subject, body: payload.body, bodyHtml: payload.bodyHtml,
      }));
    } catch { /* ignore */ }
    setPendingSend(null);
    showToast("Send cancelled — draft restored");
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

  function isPreviewable(mimeType: string): boolean {
    return (
      mimeType.startsWith("image/") ||
      mimeType === "application/pdf" ||
      mimeType.startsWith("text/") ||
      mimeType === "application/json"
    );
  }

  async function handlePreviewAttachment(partId: string, filename: string) {
    if (!detail || !provider.getAttachment) return;
    setPreviewLoading(partId);
    try {
      const result = await provider.getAttachment(detail.id, partId);
      setAttachmentPreview({
        filename: result.filename || filename,
        mimeType: result.mimeType,
        data: result.data,
      });
    } catch {
      showToast("Preview failed");
    } finally {
      setPreviewLoading(null);
    }
  }

  async function handleViewSource() {
    if (!detail || !provider.getMessageSource) return;
    setSourceOpen(true);
    setSourceContent(null);
    setSourceLoading(true);
    try {
      const res = await provider.getMessageSource(detail.id);
      setSourceContent(res.source);
    } catch {
      setSourceContent("Failed to load message source.");
    } finally {
      setSourceLoading(false);
    }
  }

  const handleReply = useCallback(() => {
    if (!detail) return;
    setCompose({ type: "reply", to: detail.sender, subject: `Re: ${detail.subject}`, bodyHtml: buildReplyHtml(detail, "reply") });
  }, [detail]);

  const handleReplyAll = useCallback(() => {
    if (!detail) return;
    const allRecipients = [...(detail.to ?? []), ...(detail.cc ?? [])].join(", ");
    setCompose({
      type: "replyAll",
      to: detail.sender,
      cc: allRecipients,
      subject: `Re: ${detail.subject}`,
      bodyHtml: buildReplyHtml(detail, "replyAll"),
    });
  }, [detail]);

  const handleForward = useCallback(() => {
    if (!detail) return;
    setCompose({ type: "forward", subject: `Fwd: ${detail.subject}`, bodyHtml: buildReplyHtml(detail, "forward") });
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
      if (snoozePicker) { setSnoozePicker(null); return; }
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
      case "j": {
        // Next message
        const list = threadView ? threadGroups.map((g) => g.latestMsg) : sortedMessages;
        const idx = list.findIndex((m) => m.id === selectedId);
        if (idx < list.length - 1) setSelectedId(list[idx + 1].id);
        break;
      }
      case "k": {
        // Previous message
        const list = threadView ? threadGroups.map((g) => g.latestMsg) : sortedMessages;
        const idx = list.findIndex((m) => m.id === selectedId);
        if (idx > 0) setSelectedId(list[idx - 1].id);
        break;
      }
      case "/": {
        e.preventDefault();
        (document.querySelector(".mf-search") as HTMLInputElement | null)?.focus();
        break;
      }
    }
  };

  const rowVirtualizer = useVirtualizer({
    count: threadView ? threadGroups.length : sortedMessages.length,
    getScrollElement: () => messagesListRef.current,
    estimateSize: () => 73,
    overscan: 8,
  });

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const moveTargets = folders.filter((f) => f.id !== activeFolderId && f.id !== "Trash");
  const bulkActive = selectedIds.size > 0;
  const allSelected = sortedMessages.length > 0 && selectedIds.size === sortedMessages.length;
  const isTrash = activeFolder?.label === "Trash" || activeFolderId === "Trash";
  const hasReplyAll = !!(detail?.to?.length || detail?.cc?.length);
  const canManageFolders = providerId === "api" && !!provider.createFolder;

  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4010";

  // Show login page when bridge provider is active and user is not authenticated
  if (providerId === "api" && authState !== null && authState === false) {
    return (
      <LoginPage
        apiBase={apiBase}
        onLogin={(email, accts) => { setAuthState(email); setAccounts(accts); }}
      />
    );
  }

  // Auth check in progress — show nothing (avoids flash of wrong content)
  if (providerId === "api" && authState === null) {
    return <div className="mf-login-overlay" aria-busy="true" aria-label="Checking session…" />;
  }

  return (
    <div className="mf-shell">
      {/* Offline / reconnecting banner */}
      {!apiOnline && (
        <div className="mf-offline-banner" role="alert">
          <span>⚠ Connection lost — retrying in 15s…</span>
          <button
            className="mf-offline-retry"
            onClick={() => {
              if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
              setRefreshToken((n) => n + 1);
            }}
          >Retry now</button>
        </div>
      )}

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
              <dt><kbd>c</kbd></dt><dd>Compose new message</dd>
              <dt><kbd>r</kbd></dt><dd>Reply</dd>
              <dt><kbd>a</kbd></dt><dd>Reply All</dd>
              <dt><kbd>f</kbd></dt><dd>Forward</dd>
              <dt><kbd>j</kbd></dt><dd>Next message</dd>
              <dt><kbd>k</kbd></dt><dd>Previous message</dd>
              <dt><kbd>e</kbd></dt><dd>Archive</dd>
              <dt><kbd>#</kbd></dt><dd>Delete</dd>
              <dt><kbd>u</kbd></dt><dd>Mark as unread</dd>
              <dt><kbd>/</kbd></dt><dd>Focus search</dd>
              <dt><kbd>?</kbd></dt><dd>Show this dialog</dd>
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
          initialBodyHtml={compose.type !== "new" ? compose.bodyHtml : undefined}
          onSend={handleSend}
          onSendLater={provider.sendMessage ? handleSendLater : undefined}
          onClose={() => setCompose(null)}
        />
      )}

      {/* Settings panel */}
      {settingsOpen && (
        <SettingsPanel
          themes={themeRegistry}
          activeThemeId={activeThemeId}
          onThemeChange={handleThemeChange}
          providerId={providerId}
          onProviderChange={(id) => { localStorage.setItem("mailframe-provider", id); setProviderId(id); }}
          signature={signature}
          onSignatureChange={handleSignatureChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Add account modal */}
      {addingAccount && (
        <div
          className="mf-login-overlay"
          onClick={(e) => e.target === e.currentTarget && setAddingAccount(false)}
        >
          <form className="mf-login-card" onSubmit={handleAddAccountSubmit} aria-label="Add account">
            <div className="mf-login-logo" style={{ fontSize: "16px" }}>Add account</div>
            <div className="mf-login-field">
              <label htmlFor="mf-add-email">Email</label>
              <input
                id="mf-add-email"
                type="email"
                value={addAccountEmail}
                onChange={(e) => setAddAccountEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                required
              />
            </div>
            <div className="mf-login-field">
              <label htmlFor="mf-add-pass">Password</label>
              <input
                id="mf-add-pass"
                type="password"
                value={addAccountPass}
                onChange={(e) => setAddAccountPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            {addAccountError && (
              <div className="mf-login-error" role="alert">{addAccountError}</div>
            )}
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button
                className="mf-login-submit"
                type="submit"
                disabled={!addAccountEmail.trim() || !addAccountPass}
              >
                Add
              </button>
              <button
                className="mf-compose-discard"
                type="button"
                onClick={() => { setAddingAccount(false); setAddAccountEmail(""); setAddAccountPass(""); setAddAccountError(""); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Attachment Preview Modal */}
      {attachmentPreview && (
        <div
          className="mf-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${attachmentPreview.filename}`}
          onClick={(e) => { if (e.target === e.currentTarget) setAttachmentPreview(null); }}
        >
          <div className="mf-preview-modal">
            <div className="mf-preview-header">
              <span className="mf-preview-filename">{attachmentPreview.filename}</span>
              <button
                className="mf-preview-close"
                onClick={() => setAttachmentPreview(null)}
                aria-label="Close preview"
              >✕</button>
            </div>
            <div className="mf-preview-body">
              {attachmentPreview.mimeType.startsWith("image/") ? (
                <img
                  className="mf-preview-image"
                  src={`data:${attachmentPreview.mimeType};base64,${attachmentPreview.data}`}
                  alt={attachmentPreview.filename}
                />
              ) : attachmentPreview.mimeType === "application/pdf" ? (
                <iframe
                  className="mf-preview-iframe"
                  src={`data:application/pdf;base64,${attachmentPreview.data}`}
                  title={attachmentPreview.filename}
                />
              ) : (
                <pre className="mf-preview-text">
                  {atob(attachmentPreview.data)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message source modal */}
      {sourceOpen && (
        <div
          className="mf-source-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Message source"
          onClick={(e) => { if (e.target === e.currentTarget) setSourceOpen(false); }}
        >
          <div className="mf-source-modal">
            <div className="mf-source-header">
              <span>Message Source</span>
              <div style={{ display: "flex", gap: 8 }}>
                {sourceContent && (
                  <button
                    className="mf-action-btn"
                    onClick={() => {
                      const blob = new Blob([sourceContent], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `message-source-${detail?.id ?? "msg"}.eml`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >Download .eml</button>
                )}
                <button className="mf-preview-close" onClick={() => setSourceOpen(false)} aria-label="Close">×</button>
              </div>
            </div>
            <div className="mf-source-body">
              {sourceLoading
                ? <div className="mf-source-loading">Loading…</div>
                : <pre className="mf-source-pre">{sourceContent ?? ""}</pre>
              }
            </div>
          </div>
        </div>
      )}

      {/* New-mail popup cards — bottom right */}
      {mailNotifs.length > 0 && (
        <div className="mf-notif-stack" aria-live="polite" aria-label="New messages">
          {mailNotifs.map((n) => (
            <div
              key={n.id}
              className="mf-notif-card"
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedId(n.msgId);
                setMailNotifs((prev) => prev.filter((x) => x.id !== n.id));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId(n.msgId);
                  setMailNotifs((prev) => prev.filter((x) => x.id !== n.id));
                }
              }}
            >
              <div className="mf-notif-icon">✉</div>
              <div className="mf-notif-body">
                <div className="mf-notif-sender">{n.sender}</div>
                <div className="mf-notif-subject">{n.subject}</div>
              </div>
              <button
                className="mf-notif-close"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  setMailNotifs((prev) => prev.filter((x) => x.id !== n.id));
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {(toast || pendingSend) && (
        <div className="mf-toast" role="status" aria-live="polite" aria-atomic="true">
          {pendingSend ? (
            <>
              Sending in 7s…{" "}
              <button className="mf-toast-undo" onClick={handleUndoSend}>Undo</button>
            </>
          ) : toast}
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

      {/* Main row: sidebar + list + pane */}
      <div className="mf-shell-body">

      {/* Sidebar */}
      <aside className={`mf-sidebar${sidebarOpen ? " open" : ""}`} aria-label="Navigation">
        <div className="mf-sidebar-logo">MailFrame</div>

        {/* Account switcher (bridge mode only) */}
        {providerId === "api" && accounts.length > 0 && (
          <div className="mf-account-list">
            {accounts.map((acct) => (
              <div key={acct} className={`mf-account-item${acct === authState ? " active" : ""}`}>
                <button
                  className="mf-account-switch"
                  onClick={() => { if (acct !== authState) handleSwitchAccount(acct); }}
                  title={acct}
                >
                  <span className="mf-account-avatar">{acct[0].toUpperCase()}</span>
                  <span className="mf-account-email">{acct}</span>
                </button>
                <button
                  className="mf-account-remove"
                  onClick={() => handleLogoutAccount(acct)}
                  aria-label={`Remove ${acct}`}
                  title="Remove account"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="mf-account-add"
              onClick={() => setAddingAccount(true)}
            >
              + Add account
            </button>
          </div>
        )}

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
                className={`mf-folder-item${folder.id === activeFolderId ? " active" : ""}${dragOverFolder === folder.id ? " drag-over" : ""}`}
                onClick={() => { setActiveFolderId(folder.id); setSidebarOpen(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveFolderId(folder.id);
                    setSidebarOpen(false);
                  }
                }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverFolder(folder.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolder(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverFolder(null);
                  try {
                    const ids = JSON.parse(e.dataTransfer.getData("text/plain")) as string[];
                    if (!ids.length || folder.id === activeFolderId) return;
                    provider.moveMessages?.(ids, folder.id);
                    removeMessages(ids);
                    showToast(`Moved to ${folder.label}`);
                  } catch { /* ignore */ }
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
          {providerId === "api" && typeof authState === "string" && (
            <button
              className="mf-settings-btn"
              onClick={handleLogout}
              aria-label="Sign out"
              title={`Sign out (${authState})`}
              style={{ marginLeft: "4px" }}
            >
              ⏏
            </button>
          )}
        </div>
      </aside>

      {/* Message list */}
      <section className="mf-list" style={{ width: `${listWidth}px` }} aria-label="Message list">
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
          <select
            className="mf-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label="Sort messages by"
            title="Sort messages"
          >
            <option value="date-desc">Newest</option>
            <option value="date-asc">Oldest</option>
            <option value="unread">Unread only</option>
            <option value="starred">Starred only</option>
            <option value="sender">By Sender</option>
            <option value="subject">By Subject</option>
          </select>
          {provider.markRead && sortedMessages.some((m) => m.unread) && (
            <button
              className="mf-mark-all-read"
              title="Mark all as read"
              aria-label="Mark all messages as read"
              onClick={() => {
                const unreadIds = sortedMessages.filter((m) => m.unread).map((m) => m.id);
                provider.markRead?.(unreadIds, true);
                setMessages((prev) => prev.map((m) => ({ ...m, unread: false })));
                setFolders((prev) => prev.map((f) => f.id === activeFolderId ? { ...f, unreadCount: 0 } : f));
              }}
            >
              ✓✓
            </button>
          )}
          {snoozedIds.size > 0 && (
            <span className="mf-snooze-badge" title={`${snoozedIds.size} snoozed`}>
              {snoozedIds.size} snoozed
            </span>
          )}
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

        {!mailboxLoading && !mailboxError && sortedMessages.length === 0 && (
          <div className="mf-messages-empty">
            {messages.length > 0 && snoozedIds.size > 0 ? "All messages snoozed" : "No messages"}
          </div>
        )}

        {!mailboxLoading && !mailboxError && sortedMessages.length > 0 && (
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
                      draggable
                      onDragStart={(e) => {
                        const threadMsgIds = messages
                          .filter((m) => (normalizeSubject(m.subject) || m.subject.toLowerCase()) === group.key)
                          .map((m) => m.id);
                        e.dataTransfer.setData("text/plain", JSON.stringify(threadMsgIds));
                        e.dataTransfer.effectAllowed = "move";
                      }}
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
                          <span className="mf-message-timestamp">{group.latestMsg.timestampMs ? formatTs(group.latestMsg.timestampMs) : group.latestMsg.timestamp}</span>
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

                const msg = sortedMessages[virtualItem.index];
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
                    draggable
                    onDragStart={(e) => {
                      const ids = selectedIds.size > 0 && selectedIds.has(msg.id)
                        ? [...selectedIds]
                        : [msg.id];
                      e.dataTransfer.setData("text/plain", JSON.stringify(ids));
                      e.dataTransfer.effectAllowed = "move";
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
                        <span className="mf-message-timestamp">{msg.timestampMs ? formatTs(msg.timestampMs) : msg.timestamp}</span>
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

      {/* Resizable divider */}
      <div
        className="mf-pane-resizer"
        onMouseDown={handleResizerMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize message list"
      />

      {/* Reading pane */}
      {/* Floating compose button — mobile reading pane only */}
      {selectedId && provider.sendMessage && (
        <button
          className="mf-fab-compose"
          onClick={() => setCompose({ type: "new" })}
          aria-label="Compose new message"
        >✏</button>
      )}

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
                <span className="mf-pane-timestamp">{detail.timestampMs ? formatTs(detail.timestampMs) : detail.timestamp}</span>
              </div>
            </div>

            <div className="mf-pane-actions" role="toolbar" aria-label="Message actions">
              <button className="mf-action-btn" onClick={handleReply}>Reply</button>
              {hasReplyAll && (
                <button className="mf-action-btn" onClick={handleReplyAll}>Reply All</button>
              )}
              <button className="mf-action-btn" onClick={handleForward}>Forward</button>
              <button className="mf-action-btn" onClick={handleMarkUnread}>Mark unread</button>
              <div className="mf-snooze-wrapper">
                <button
                  className="mf-action-btn"
                  onClick={() => setSnoozePicker(snoozePicker === detail.id ? null : detail.id)}
                  aria-expanded={snoozePicker === detail.id}
                  aria-haspopup="menu"
                >
                  Snooze
                </button>
                {snoozePicker === detail.id && (
                  <div className="mf-snooze-picker" role="menu" aria-label="Snooze until">
                    <button className="mf-snooze-option" role="menuitem" onClick={() => handleSnooze(detail.id, Date.now() + 3 * 3_600_000)}>Later today (+3h)</button>
                    <button className="mf-snooze-option" role="menuitem" onClick={() => handleSnooze(detail.id, nextDayAt(9))}>Tomorrow 9am</button>
                    <button className="mf-snooze-option" role="menuitem" onClick={() => handleSnooze(detail.id, nextWeekdayAt(6, 9))}>This weekend</button>
                    <button className="mf-snooze-option" role="menuitem" onClick={() => handleSnooze(detail.id, nextWeekdayAt(1, 9))}>Next week</button>
                  </div>
                )}
              </div>
              <button className="mf-action-btn" onClick={() => handleArchive()}>Archive</button>
              <button className="mf-action-btn" onClick={handleSpam}>Spam</button>
              <button className="mf-action-btn" onClick={handlePrint}>Print</button>
              {provider.getMessageSource && (
                <button className="mf-action-btn" onClick={handleViewSource}>Source</button>
              )}
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
                        <span className="mf-thread-item-ts">{m.timestampMs ? formatTs(m.timestampMs) : m.timestamp}</span>
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
                  __html: DOMPurify.sanitize(
                    detail.inlineParts?.length
                      ? resolveInlineImages(detail.bodyHtml, detail.id, detail.inlineParts, apiBase)
                      : detail.bodyHtml, {
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

            {provider.sendMessage && (
              <div className="mf-quick-reply">
                <div className="mf-quick-reply-label">Reply to {detail.sender}</div>
                <textarea
                  className="mf-quick-reply-input"
                  placeholder="Write a quick reply…"
                  value={quickReply}
                  rows={3}
                  onChange={(e) => setQuickReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && quickReply.trim()) {
                      e.preventDefault();
                      handleSend({ to: detail.sender, subject: `Re: ${detail.subject}`, body: quickReply.trim() });
                      setQuickReply("");
                    }
                  }}
                />
                <div className="mf-quick-reply-footer">
                  <button
                    className="mf-quick-reply-send"
                    disabled={!quickReply.trim()}
                    onClick={() => {
                      handleSend({ to: detail.sender, subject: `Re: ${detail.subject}`, body: quickReply.trim() });
                      setQuickReply("");
                    }}
                  >
                    Send
                  </button>
                  <button
                    className="mf-quick-reply-expand"
                    onClick={() => { handleReply(); setQuickReply(""); }}
                  >
                    Full reply ↗
                  </button>
                  <span className="mf-quick-reply-hint">Ctrl+Enter to send</span>
                </div>
              </div>
            )}

            {detail.attachments && detail.attachments.length > 0 && (
              <div className="mf-pane-attachments">
                <div className="mf-attachments-label">
                  Attachments ({detail.attachments.length})
                </div>
                <ul className="mf-attachments-list">
                  {detail.attachments.map((att) => (
                    <li key={att.partId} className={`mf-attachment-item${imageThumbs[att.partId] ? " mf-attachment-item--has-thumb" : ""}`}>
                      {imageThumbs[att.partId] ? (
                        <img
                          className="mf-att-thumb"
                          src={imageThumbs[att.partId]}
                          alt={att.filename}
                          onClick={() => setAttachmentPreview({ filename: att.filename, mimeType: att.mimeType, data: imageThumbs[att.partId].split(",")[1] })}
                        />
                      ) : (
                        <span className="mf-att-icon">📎</span>
                      )}
                      <span className="mf-att-name">{att.filename}</span>
                      <span className="mf-att-size">{formatFileSize(att.size)}</span>
                      {provider.getAttachment && isPreviewable(att.mimeType) && (
                        <button
                          className="mf-att-preview"
                          onClick={() => handlePreviewAttachment(att.partId, att.filename)}
                          disabled={previewLoading === att.partId}
                          aria-label={`Preview ${att.filename}`}
                        >
                          {previewLoading === att.partId ? "…" : "👁 Preview"}
                        </button>
                      )}
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
      </div>{/* end mf-shell-body */}
    </div>
  );
}
