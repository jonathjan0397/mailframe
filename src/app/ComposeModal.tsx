import { useEffect, useState } from "react";
import type { SendPayload } from "../features/mail/provider";

type Props = {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  onSend: (payload: SendPayload) => void;
  onClose: () => void;
};

const DRAFT_KEY = "mailframe-draft";

type DraftData = { to: string; subject: string; body: string };

function loadDraft(initialTo: string, initialSubject: string, initialBody: string): DraftData {
  // Only restore a saved draft when this is a fresh "new message" compose.
  // Reply/forward pre-fill their own values and should not be overridden.
  if (initialTo || initialSubject || initialBody) {
    return { to: initialTo, subject: initialSubject, body: initialBody };
  }
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DraftData>;
      return { to: saved.to ?? "", subject: saved.subject ?? "", body: saved.body ?? "" };
    }
  } catch { /* ignore parse errors */ }
  return { to: "", subject: "", body: "" };
}

export function ComposeModal({
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  onSend,
  onClose,
}: Props) {
  // Load once on mount — restores draft for new compositions, uses initial values for reply/forward
  const [draft] = useState<DraftData>(() => loadDraft(initialTo, initialSubject, initialBody));
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  // Only auto-save for new compositions (no pre-filled fields)
  const isDraftTarget = !initialTo && !initialSubject && !initialBody;

  // Auto-save with 500ms debounce
  useEffect(() => {
    if (!isDraftTarget) return;
    const timer = setTimeout(() => {
      if (to || subject || body) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ to, subject, body }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [to, subject, body, isDraftTarget]);

  function handleSend() {
    if (!to.trim()) return;
    localStorage.removeItem(DRAFT_KEY);
    onSend({ to: to.trim(), subject: subject.trim(), body: body.trim() });
  }

  function handleDiscard() {
    if (isDraftTarget) localStorage.removeItem(DRAFT_KEY);
    onClose();
  }

  const title = initialTo
    ? `Re: ${initialSubject || "message"}`
    : initialSubject
    ? initialSubject
    : "New Message";

  return (
    <div className="mf-compose-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              autoFocus
            />
          </div>
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
