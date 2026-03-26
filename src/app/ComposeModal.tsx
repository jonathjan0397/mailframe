import { useState } from "react";
import type { SendPayload } from "../features/mail/provider";

type Props = {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  onSend: (payload: SendPayload) => void;
  onClose: () => void;
};

export function ComposeModal({ initialTo = "", initialSubject = "", initialBody = "", onSend, onClose }: Props) {
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  function handleSend() {
    if (!to.trim()) return;
    onSend({ to: to.trim(), subject: subject.trim(), body: body.trim() });
  }

  return (
    <div className="mf-compose-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mf-compose-modal">
        <div className="mf-compose-header">
          <span className="mf-compose-title">New Message</span>
          <button className="mf-compose-close" onClick={onClose}>✕</button>
        </div>
        <div className="mf-compose-fields">
          <div className="mf-compose-field">
            <label>To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              autoFocus
            />
          </div>
          <div className="mf-compose-field">
            <label>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>
        </div>
        <textarea
          className="mf-compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
        />
        <div className="mf-compose-footer">
          <button className="mf-compose-send" onClick={handleSend} disabled={!to.trim()}>
            Send
          </button>
          <button className="mf-compose-discard" onClick={onClose}>Discard</button>
        </div>
      </div>
    </div>
  );
}
