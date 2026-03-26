import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";
import type { AttachmentPayload, SendPayload } from "../features/mail/provider";

type Props = {
  initialTo?: string;
  initialCc?: string;
  initialSubject?: string;
  initialBody?: string;
  initialBodyHtml?: string;
  onSend: (payload: SendPayload) => void;
  onSendLater?: (payload: SendPayload, scheduledAt: number) => void;
  onClose: () => void;
};

const DRAFT_KEY = "mailframe-draft";
const SIGNATURE_KEY = "mailframe-signature";
const CONTACTS_KEY = "mailframe-contacts";
const TEMPLATES_KEY = "mailframe-templates";

type Template = { id: string; name: string; subject: string; bodyHtml: string };

function getTemplates(): Template[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? "[]") as Template[]; }
  catch { return []; }
}

function persistTemplate(tpl: Template): void {
  const list = getTemplates().filter((t) => t.id !== tpl.id);
  list.unshift(tpl);
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

type DraftData = {
  to: string; cc: string; bcc: string; subject: string;
  body: string;       // plain-text (for draft restore fallback)
  bodyHtml?: string;  // rich HTML content
};

function getSignature(): string {
  try { return localStorage.getItem(SIGNATURE_KEY) ?? ""; }
  catch { return ""; }
}

function getContacts(): string[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function buildInitialHtml(body: string, isNew: boolean): string {
  const sig = isNew ? getSignature() : "";
  let html = "";
  if (body) {
    // Convert plain text to basic HTML
    html = body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }
  if (sig) {
    const sigHtml = sig
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    html = `<p><br></p>${html}<p>-- <br>${sigHtml}</p>`;
  }
  return html || "<p><br></p>";
}

function loadDraft(
  initialTo: string,
  initialCc: string,
  initialSubject: string,
  initialBody: string,
  initialBodyHtml?: string,
): DraftData & { isNew: boolean } {
  const isNew = !initialTo && !initialSubject && !initialBody && !initialCc && !initialBodyHtml;
  if (!isNew) {
    return { to: initialTo, cc: initialCc, bcc: "", subject: initialSubject, body: initialBody, bodyHtml: initialBodyHtml, isNew };
  }
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DraftData>;
      return {
        to: saved.to ?? "",
        cc: saved.cc ?? "",
        bcc: saved.bcc ?? "",
        subject: saved.subject ?? "",
        body: saved.body ?? "",
        bodyHtml: saved.bodyHtml,
        isNew,
      };
    }
  } catch { /* ignore */ }
  return { to: "", cc: "", bcc: "", subject: "", body: "", isNew };
}

async function filesToPayload(files: File[]): Promise<AttachmentPayload[]> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<AttachmentPayload>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve({
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              data: dataUrl.split(",")[1] ?? "",
            });
          };
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export function ComposeModal({
  initialTo = "",
  initialCc = "",
  initialSubject = "",
  initialBody = "",
  initialBodyHtml,
  onSend,
  onSendLater,
  onClose,
}: Props) {
  const draftRef = useRef(loadDraft(initialTo, initialCc, initialSubject, initialBody, initialBodyHtml));
  const draft = draftRef.current;

  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [bcc, setBcc] = useState(draft.bcc);
  const [subject, setSubject] = useState(draft.subject);
  const [showCcBcc, setShowCcBcc] = useState(!!(draft.cc || draft.bcc));
  const [attachments, setAttachments] = useState<File[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [templates, setTemplates] = useState<Template[]>(() => getTemplates());

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDraftTarget = draft.isNew;

  // Set initial editor content on mount
  useEffect(() => {
    if (!editorRef.current) return;
    const html = draft.bodyHtml ?? buildInitialHtml(draft.body, isDraftTarget);
    editorRef.current.innerHTML = DOMPurify.sanitize(html);
    // Place cursor at the very start
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(editorRef.current, 0);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    editorRef.current.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function saveDraft() {
    if (!isDraftTarget) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const bodyHtml = editorRef.current?.innerHTML ?? "";
      const body = editorRef.current?.innerText ?? "";
      if (to || subject || bodyHtml) {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ to, cc, bcc, subject, body, bodyHtml }),
        );
        setDraftSaved(true);
      } else {
        localStorage.removeItem(DRAFT_KEY);
        setDraftSaved(false);
      }
    }, 500);
  }

  function handleEditorInput() { saveDraft(); }

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "b": e.preventDefault(); document.execCommand("bold"); break;
        case "i": e.preventDefault(); document.execCommand("italic"); break;
        case "u": e.preventDefault(); document.execCommand("underline"); break;
      }
    }
  }

  function handleEditorPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (html) {
      const clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["b", "i", "u", "strong", "em", "br", "p", "ul", "ol", "li", "a", "span", "div"],
        ALLOWED_ATTR: ["href"],
      });
      document.execCommand("insertHTML", false, clean);
    } else {
      document.execCommand("insertText", false, text);
    }
  }

  function execFormat(command: string, value?: string) {
    document.execCommand(command, false, value ?? undefined);
    editorRef.current?.focus();
  }

  function handleCreateLink() {
    const url = window.prompt("Enter URL:");
    if (url?.trim()) execFormat("createLink", url.trim());
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) setAttachments((prev) => [...prev, ...files]);
  }

  function handleApplyTemplate(tplId: string) {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl || !editorRef.current) return;
    if (tpl.subject) setSubject(tpl.subject);
    editorRef.current.innerHTML = DOMPurify.sanitize(tpl.bodyHtml || "<p><br></p>");
    saveDraft();
  }

  function handleSaveTemplate() {
    const name = window.prompt("Save template as:");
    if (!name?.trim()) return;
    const bodyHtml = editorRef.current?.innerHTML ?? "";
    const tpl: Template = {
      id: Date.now().toString(36),
      name: name.trim(),
      subject: subject.trim(),
      bodyHtml,
    };
    persistTemplate(tpl);
    setTemplates(getTemplates());
  }

  async function handleSendLater() {
    if (!to.trim() || !scheduleTime) return;
    localStorage.removeItem(DRAFT_KEY);
    const bodyHtml = editorRef.current?.innerHTML ?? "";
    const body = editorRef.current?.innerText ?? "";
    const scheduledAt = new Date(scheduleTime).getTime();
    const attachmentPayloads = attachments.length > 0 ? await filesToPayload(attachments) : undefined;
    onSendLater?.({
      to: to.trim(),
      cc: cc.trim() || undefined,
      bcc: bcc.trim() || undefined,
      subject: subject.trim(),
      body: body.trim(),
      bodyHtml: bodyHtml || undefined,
      attachments: attachmentPayloads,
    }, scheduledAt);
  }

  async function handleSend() {
    if (!to.trim()) return;
    localStorage.removeItem(DRAFT_KEY);
    const bodyHtml = editorRef.current?.innerHTML ?? "";
    const body = editorRef.current?.innerText ?? "";
    const attachmentPayloads =
      attachments.length > 0 ? await filesToPayload(attachments) : undefined;
    onSend({
      to: to.trim(),
      cc: cc.trim() || undefined,
      bcc: bcc.trim() || undefined,
      subject: subject.trim(),
      body: body.trim(),
      bodyHtml: bodyHtml || undefined,
      attachments: attachmentPayloads,
    });
  }

  function handleDiscard() {
    if (isDraftTarget) localStorage.removeItem(DRAFT_KEY);
    onClose();
  }

  function handleFieldChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      saveDraft();
    };
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setAttachments((prev) => [...prev, ...files]);
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  const contacts = getContacts();
  const title = initialTo
    ? `Re: ${initialSubject || "message"}`
    : initialSubject
    ? initialSubject
    : "New Message";

  return (
    <div className="mf-compose-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <datalist id="mf-compose-contacts">
        {contacts.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div
        className={`mf-compose-modal${isDragOver ? " mf-compose-drag-over" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="mf-compose-drop-overlay" aria-hidden="true">
            📎 Drop files to attach
          </div>
        )}
        <div className="mf-compose-header">
          <span className="mf-compose-title">{title}</span>
          <button className="mf-compose-close" onClick={handleDiscard} aria-label="Close compose">
            ✕
          </button>
        </div>

        <div className="mf-compose-fields">
          <div className="mf-compose-field">
            <label htmlFor="mf-compose-to">To</label>
            <input
              id="mf-compose-to"
              type="text"
              value={to}
              onChange={handleFieldChange(setTo)}
              placeholder="recipient@example.com"
              list="mf-compose-contacts"
              autoFocus
            />
            <button
              className="mf-compose-ccbcc-toggle"
              type="button"
              onClick={() => setShowCcBcc((v) => !v)}
              aria-label={showCcBcc ? "Hide CC and BCC" : "Show CC and BCC"}
              title="CC / BCC"
            >
              CC/BCC
            </button>
          </div>

          {showCcBcc && (
            <>
              <div className="mf-compose-field">
                <label htmlFor="mf-compose-cc">CC</label>
                <input
                  id="mf-compose-cc"
                  type="text"
                  value={cc}
                  onChange={handleFieldChange(setCc)}
                  placeholder="cc@example.com"
                  list="mf-compose-contacts"
                />
              </div>
              <div className="mf-compose-field">
                <label htmlFor="mf-compose-bcc">BCC</label>
                <input
                  id="mf-compose-bcc"
                  type="text"
                  value={bcc}
                  onChange={handleFieldChange(setBcc)}
                  placeholder="bcc@example.com"
                  list="mf-compose-contacts"
                />
              </div>
            </>
          )}

          <div className="mf-compose-field">
            <label htmlFor="mf-compose-subject">Subject</label>
            <input
              id="mf-compose-subject"
              type="text"
              value={subject}
              onChange={handleFieldChange(setSubject)}
              placeholder="Subject"
            />
          </div>

          {templates.length > 0 && (
            <div className="mf-compose-field mf-compose-template-row">
              <label htmlFor="mf-compose-template">Template</label>
              <select
                id="mf-compose-template"
                className="mf-compose-template-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleApplyTemplate(e.target.value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="" disabled>Apply template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Rich-text toolbar */}
        <div className="mf-compose-toolbar" role="toolbar" aria-label="Text formatting">
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); execFormat("bold"); }}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); execFormat("italic"); }}
            title="Italic (Ctrl+I)"
            aria-label="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); execFormat("underline"); }}
            title="Underline (Ctrl+U)"
            aria-label="Underline"
          >
            <u>U</u>
          </button>
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); execFormat("strikeThrough"); }}
            title="Strikethrough"
            aria-label="Strikethrough"
          >
            <s>S</s>
          </button>
          <span className="mf-toolbar-sep" aria-hidden="true" />
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); execFormat("insertUnorderedList"); }}
            title="Bullet list"
            aria-label="Bullet list"
          >
            •≡
          </button>
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); execFormat("insertOrderedList"); }}
            title="Numbered list"
            aria-label="Numbered list"
          >
            1≡
          </button>
          <span className="mf-toolbar-sep" aria-hidden="true" />
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); handleCreateLink(); }}
            title="Insert link"
            aria-label="Insert link"
          >
            🔗
          </button>
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); execFormat("unlink"); }}
            title="Remove link"
            aria-label="Remove link"
          >
            ⛓‍💥
          </button>
          <span className="mf-toolbar-sep" aria-hidden="true" />
          <button
            type="button"
            className="mf-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); execFormat("removeFormat"); }}
            title="Clear formatting"
            aria-label="Clear formatting"
          >
            Tx
          </button>
        </div>

        {/* Contenteditable rich-text editor */}
        <div
          ref={editorRef}
          className="mf-compose-editor"
          // eslint-disable-next-line react/no-danger -- content set via ref on mount, not dangerouslySetInnerHTML
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          data-placeholder="Write your message…"
          onInput={handleEditorInput}
          onKeyDown={handleEditorKeyDown}
          onPaste={handleEditorPaste}
        />

        {attachments.length > 0 && (
          <ul className="mf-compose-attachments">
            {attachments.map((file, i) => (
              <li key={i} className="mf-compose-attachment-item">
                <span className="mf-attach-name">{file.name}</span>
                <span className="mf-attach-size">
                  {file.size < 1024
                    ? `${file.size} B`
                    : file.size < 1024 * 1024
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                </span>
                <button
                  className="mf-attach-remove"
                  onClick={() => removeAttachment(i)}
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mf-compose-footer">
          <button
            className="mf-compose-send"
            onClick={handleSend}
            disabled={!to.trim()}
          >
            Send
          </button>
          <button className="mf-compose-discard" onClick={handleDiscard}>
            Discard
          </button>
          <button
            className="mf-compose-attach-btn"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
            title="Attach files"
          >
            📎
          </button>
          <button
            className="mf-compose-template-btn"
            type="button"
            onClick={handleSaveTemplate}
            aria-label="Save as template"
            title="Save as template"
          >
            💾
          </button>
          {onSendLater && (
            <button
              className="mf-compose-schedule-btn"
              type="button"
              onClick={() => setShowSchedule((v) => !v)}
              aria-label="Send later"
              title="Schedule send"
            >
              ⏰
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
            aria-hidden="true"
          />
          {isDraftTarget && draftSaved && (
            <span className="mf-draft-indicator" aria-live="polite">
              Draft saved
            </span>
          )}
        </div>
        {showSchedule && onSendLater && (
          <div className="mf-schedule-picker">
            <input
              type="datetime-local"
              className="mf-schedule-input"
              value={scheduleTime}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
            <button
              className="mf-schedule-confirm"
              disabled={!scheduleTime || !to.trim()}
              onClick={handleSendLater}
            >
              Schedule send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
