/**
 * useMailbox — loads folders + messages for the current folder/search/page.
 * Handles AbortController cleanup, offline detection, and auto-retry.
 */
import { useEffect, useRef, useState } from "react";
import type { MailProvider } from "../../features/mail/provider";
import type { MailItem, MailFolder } from "../../lib/mail-types";

type Options = {
  provider: MailProvider;
  providerId: string;
  authState: null | false | string;
  activeFolderId: string;
  search: string;
  refreshToken: number;
};

type Result = {
  folders: MailFolder[];
  messages: MailItem[];
  loading: boolean;
  error: string | null;
  hasNextPage: boolean;
  page: number;
  setPage: (p: number) => void;
  setMessages: React.Dispatch<React.SetStateAction<MailItem[]>>;
  setFolders: React.Dispatch<React.SetStateAction<MailFolder[]>>;
  apiOnline: boolean;
  setApiOnline: (v: boolean) => void;
  retryTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

export function useMailbox({
  provider, providerId, authState, activeFolderId, search, refreshToken,
}: Options): Result {
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [messages, setMessages] = useState<MailItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [page, setPage] = useState(1);
  const [apiOnline, setApiOnline] = useState(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (providerId === "api" && typeof authState !== "string") return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setHasNextPage(false);
    setPage(1);
    provider.getMailboxSnapshot({ folderId: activeFolderId, query: search, page: 1, signal: ac.signal })
      .then((snapshot) => {
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        setApiOnline(true);
        setFolders(snapshot.folders);
        setMessages(snapshot.messages);
        setHasNextPage(snapshot.meta?.hasNextPage ?? false);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === "AbortError") return;
        if (e instanceof TypeError) {
          setApiOnline(false);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          // auto-retry is handled by the caller incrementing refreshToken
        }
        setError(e instanceof Error ? e.message : "Failed to load mailbox.");
        setLoading(false);
      });
    return () => ac.abort();
  }, [activeFolderId, search, provider, refreshToken, authState]); // eslint-disable-line react-hooks/exhaustive-deps

  return { folders, messages, loading, error, hasNextPage, page, setPage, setMessages, setFolders, apiOnline, setApiOnline, retryTimerRef };
}
