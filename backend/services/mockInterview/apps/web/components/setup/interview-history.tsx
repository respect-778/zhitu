"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, History, X } from "lucide-react";
import { appPath } from "@/lib/app-path";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { SessionHistorySchema, type SessionSummary } from "@/lib/session-history";
import styles from "./interview-history.module.css";

export function InterviewHistory() {
  const [open, setOpen] = useState(false);
  const messages = useMessages().history;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previouslyOpen = useRef(false);
  useEffect(() => {
    if (!open && previouslyOpen.current) triggerRef.current?.focus();
    previouslyOpen.current = open;
  }, [open]);
  return (
    <>
      <button ref={triggerRef} type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <History size={16} aria-hidden="true" />
        {messages.title}
      </button>
      {open && <HistoryDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function HistoryDialog({ onClose }: { onClose: () => void }) {
  const messages = useMessages().history;
  const locale = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const response = await fetch(appPath(`/api/sessions?offset=${offset}`), {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          setError(response.status === 401 ? messages.signIn : response.status === 403 ? messages.disabled : messages.failed);
          return;
        }
        const history = SessionHistorySchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setItems((previous) => {
          const rows = offset === 0 ? [] : previous;
          return Array.from(new Map([...rows, ...history.items].map((row) => [row.session_id, row])).values());
        });
        setHasMore(history.has_more);
      } catch {
        if (!controller.signal.aborted) setError(messages.failed);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [offset, attempt, messages]);

  const dates = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="history-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header className={styles.header}>
        <div>
          <h2 id="history-title">{messages.title}</h2>
          <p>{messages.description}</p>
        </div>
        <button type="button" className={styles.close} aria-label={messages.close} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className={styles.body} aria-busy={loading}>
        {items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item) => {
              const date = item.created_at ? new Date(item.created_at) : null;
              return (
                <li key={item.session_id}>
                  <div className={styles.details}>
                    <h3>{item.job_title || messages.untitled}</h3>
                    <div className={styles.meta}>
                      {item.company && <span>{item.company}</span>}
                      <time dateTime={item.created_at || undefined}>
                        {date && Number.isFinite(date.getTime()) ? dates.format(date) : messages.unknownDate}
                      </time>
                      <span className={styles.status} data-status={item.status}>{messages.status[item.status]}</span>
                    </div>
                  </div>
                  <div className={styles.result}>
                    {item.overall_score !== null && <span className={styles.score}>{item.overall_score.toFixed(1)}<small> / 5</small></span>}
                    <Link href={`/report/${item.session_id}`} className={styles.report}>
                      {item.overall_score !== null ? messages.analysis : messages.record}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && !error && items.length === 0 && <p className={styles.empty}>{messages.empty}</p>}
        {error && <div className={styles.feedback} role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>{messages.retry}</button></div>}
        {loading && <p className={styles.feedback} role="status">{messages.loading}</p>}
        {!loading && !error && hasMore && <button type="button" className={styles.more} onClick={() => setOffset(offset + 50)}>{messages.more}</button>}
      </div>
    </dialog>
  );
}
