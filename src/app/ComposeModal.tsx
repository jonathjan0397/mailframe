import { useEffect, useRef, useState } from "react";
import type { AttachmentPayload, SendPayload } from "../features/mail/provider";

type Props = {
  initialTo?: string;
  initialCc?: string;
  initialSubject?: string;
  initialBody?: string;
  onSend: (payload: SendPayload) => void;
  onClose: () => void;
};

const DRAFT_KEY = "mailframe-draft";
const SIGNATURE_KEY = "mailframe-signature";
const CONTACTS_KEY = "mailframe-contacts";

type DraftData = { to: string; cc: string; bcc: string; subject: string; body: string };

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

function loadDraft(
  initialTo: string,
  initialCc: string,
  initialSubject: string,
  initialBody: string,
): DraftData {
  // Reply/forward: use pre-filled values directly — no draft restore
  if (initialTo || initialSubject || initialBody || initialCc) {
    return { to: initialTo, cc: initialCc, bcc: "", subject: initialSubject, body: initialBody };
  }
  // New composition: try to restore saved draft
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
      };
    }
  } catch { /* ignore */ }
  // Fresh composition — insert signature
  const sig = getSignature();
  return { to: "", cc: "", bcc: "", subject: "", body: sig ? `\n\n-- \n${sig}` : "" };
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
  onSend,
  onClose,
}: Props) {
  const [draft] = useState<DraftData>(() =>
    loadDraft(initialTo, initialCc, initialSubject, initialBody),
  );
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [bcc, setBcc] = useState(draft.bcc);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [showCcBcc, setShowCcBcc] = useState(!!(draft.cc || draft.bcc));
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Only auto-save for new compositions (no pre-filled fields)
  const isDraftTarget = !initialTo && !initialSubject && !initialBody && !initialCc;

  // Auto-save with 500ms debounce
  useEffect(() => {
    if (!isDraftTarget) return;
    const timer = setTimeout(() => {
      if (to || cc || bcc || subject || body) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ to, cc, bcc, subject, body }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [to, cc, bcc, subject, body, isDraftTarget]);

  async function handleSend() {
    if (!to.trim()) return;
    localStorage.removeItem(DRAFT_KEY);
    const attachmentPayloads =
      attachments.length > 0 ? await filesToPayload(attachments) : undefined;
    onSend({
      to: to.trim(),
      cc: cc.trim() || undefined,
      bcc: bcc.trim() || undefined,
      subject: subject.trim(),
      body: body.trim(),
      attachments: attachmentPayloads,
    });
  }

  function handleDiscard() {
    if (isDraftTarget) localStorage.removeItem(DRAFT_KEY);
    onClose();
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

      <div className="mf-compose-modal" role="dialog" aria-modal="true" aria-label={title}>
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
              onChange={(e) => setTo(e.target.value)}
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
                  onChange={(e) => setCc(e.target.value)}
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
                  onChange={(e) => setBcc(e.target.value)}
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
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>
        </div>

        <textarea
          id="mf-compose-body"
          className="mf-compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          aria-label="Message body"
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
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
            aria-hidden="true"
          />
          {isDraftTarget && (to || subject || body) && (
            <span className="mf-draft-indicator" aria-live="polite">
              Draft saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
