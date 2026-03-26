/**
 * useMessageDetail — loads the full message detail when selectedId changes.
 * Handles AbortController cleanup and marks the message as read.
 */
import { useEffect, useState } from "react";
import type { MailProvider } from "../../features/mail/provider";
import type { MailItem, MailMessageDetail } from "../../lib/mail-types";

type Options = {
  provider: MailProvider;
  selectedId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<MailItem[]>>;
  onContact?: (sender: string) => void;
};

type Result = {
  detail: MailMessageDetail | null;
  detailLoading: boolean;
  setDetail: React.Dispatch<React.SetStateAction<MailMessageDetail | null>>;
};

export function useMessageDetail({ provider, selectedId, setMessages, onContact }: Options): Result {
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    const ac = new AbortController();
    setDetailLoading(true);
    setMessages((prev) => prev.map((m) => m.id === selectedId ? { ...m, unread: false } : m));
    provider.markRead?.([selectedId], true);
    provider.getMessageDetail(selectedId, ac.signal).then((d) => {
      setDetail(d);
      setDetailLoading(false);
      onContact?.(d.sender);
    }).catch((e: unknown) => {
      if ((e as { name?: string }).name === "AbortError") return;
      setDetailLoading(false);
    });
    return () => ac.abort();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { detail, detailLoading, setDetail };
}
