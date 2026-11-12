"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  AlertTriangle,
  ExternalLink,
  RotateCw,
  ArrowRight,
} from "lucide-react";
import type {
  CandidateProfile,
  CompanyIntel,
  GapAnalysis,
  InterviewContext,
  JobSpec,
  QuestionPlan,
} from "@deepinterview/shared";
import {
  fetchSessionView,
  resetSessionPolling,
  PREP_STEPS,
  type ClientSessionView,
} from "@/lib/session";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const POLL_MS = 1200;

/** Statuses where prep is finished — stop polling. */
function isTerminal(status: ClientSessionView["status"]): boolean {
  return status !== "prep";
}

export function PrepSummary({
  sessionId,
  persona,
}: {
  sessionId: string;
  persona: string | null;
}) {
  const router = useRouter();
  const messages = useMessages();
  const [view, setView] = useState<ClientSessionView | null>(null);
  // A nonce we bump to force a fresh poll cycle (used by the error Retry).
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const next = await fetchSessionView(sessionId);
      if (cancelled) return;
      setView(next);
      // Keep polling only while still preparing.
      if (!isTerminal(next.status)) {
        timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, retryKey]);

  const onRetry = useCallback(() => {
    // Restart the 404/deadline bookkeeping so the retry gets a fresh window.
    resetSessionPolling(sessionId);
    setView(null);
    setRetryKey((k) => k + 1);
  }, [sessionId]);

  const goSetup = useCallback(() => router.push("/setup"), [router]);
  const goInterview = useCallback(() => {
    const q = persona ? `?persona=${encodeURIComponent(persona)}` : "";
    router.push(`/interview/${sessionId}${q}`);
  }, [router, sessionId, persona]);

  const status = view?.status ?? "prep";
  const warnings = view?.prep_warnings ?? [];

  return (
    <main className="mx-auto max-w-[920px] px-6 py-12">
      <header className="flex items-center justify-between">
        <Eyebrow>DeepInterview</Eyebrow>
        <Badge variant="outline">{t(messages, `session.${status}`)}</Badge>
      </header>

      {status === "prep" && (
        <PrepView progress={view?.progress ?? []} warnings={warnings} />
      )}

      {status === "ready" && view?.context && (
        <ReadyView
          context={view.context}
          warnings={warnings}
          onStart={goInterview}
          onBackToSetup={goSetup}
        />
      )}

      {/* Defensive: ready but no context parsed — treat as still preparing. */}
      {status === "ready" && !view?.context && (
        <PrepView progress={view?.progress ?? []} warnings={warnings} />
      )}

      {status === "rejected" && (
        <RejectedView warnings={warnings} onBackToSetup={goSetup} />
      )}

      {status === "error" && (
        <ErrorView onRetry={onRetry} onBackToSetup={goSetup} />
      )}

      {/* Polling deadline passed without a terminal status — honest stall. */}
      {status === "stalled" && (
        <ErrorView
          eyebrow={t(messages, "session.slowEyebrow")}
          title={t(messages, "session.slowTitle")}
          description={t(messages, "session.slowDescription")}
          onRetry={onRetry}
          onBackToSetup={goSetup}
        />
      )}

      {/* Repeated 404s — this session genuinely doesn't exist. */}
      {status === "not_found" && (
        <ErrorView
          eyebrow={t(messages, "session.missingEyebrow")}
          title={t(messages, "session.missingTitle")}
          description={t(messages, "session.missingDescription")}
          onBackToSetup={goSetup}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Preparing — the agents working                                      */
/* ------------------------------------------------------------------ */

/** Notices shown above prep / bento — input-quality warnings from the agents. */
function WarningBanner({ warnings }: { warnings: string[] }) {
  const messages = useMessages();
  if (warnings.length === 0) return null;
  return (
    <div className="mt-6 flex flex-col gap-2">
      {warnings.map((w, i) => (
        <p
          key={i}
          className="flex items-start gap-2 rounded-[10px] border border-line bg-accent-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-soft"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
            aria-hidden
          />
          <span>
            {t(messages, "session.warning")} · {w}
          </span>
        </p>
      ))}
    </div>
  );
}

function PrepView({
  progress,
  warnings,
}: {
  progress: string[];
  warnings: string[];
}) {
  const messages = useMessages();
  const done = new Set(progress);
  const completed = PREP_STEPS.filter((s) => done.has(s.key)).length;
  const total = PREP_STEPS.length;
  // First step that isn't done yet — the one actively running.
  const active = PREP_STEPS.find((s) => !done.has(s.key));

  return (
    <div className="mt-8">
      <h1 className="serif text-3xl text-ink sm:text-4xl">
        {t(messages, "session.preparingTitle")}
      </h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
        {t(messages, "session.preparingDescription")}
      </p>

      <WarningBanner warnings={warnings} />

      {/* Progress bar */}
      <div className="mt-8">
        <div className="flex items-center justify-between text-[12px] text-faint">
          <span className="font-mono uppercase tracking-[0.12em]">
            {t(messages, "session.progress")
              .replace("{completed}", String(completed))
              .replace("{total}", String(total))}
          </span>
          <span>{Math.round((completed / total) * 100)}%</span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <Card className="mt-6">
        <CardContent className="flex flex-col gap-1 py-4">
          {PREP_STEPS.map((step) => {
            const isDone = done.has(step.key);
            const isActive = !isDone && active?.key === step.key;
            const label = t(messages, `session.${step.key}`);
            return (
              <div
                key={step.key}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] px-3 py-3 transition-colors",
                  isActive && "bg-accent-soft",
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {isDone ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E8F3EC]">
                      <Check className="h-3 w-3 text-ok" aria-hidden />
                    </span>
                  ) : isActive ? (
                    <Spinner className="h-4 w-4 text-accent" label={label} />
                  ) : (
                    <span
                      className="h-2 w-2 rounded-full bg-line"
                      aria-hidden
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[14px]",
                    isDone
                      ? "text-ink-soft"
                      : isActive
                        ? "font-medium text-ink"
                        : "text-faint",
                  )}
                >
                  {label}
                </span>
                {isDone && (
                  <span className="ml-auto text-[11px] font-mono uppercase tracking-[0.1em] text-ok">
                    {t(messages, "session.done")}
                  </span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ready — the "what we found" bento                                   */
/* ------------------------------------------------------------------ */

/** A small chip row; trims to `max` with a "+N" overflow chip. */
function Chips({
  items,
  max = 12,
  variant = "outline",
}: {
  items: string[];
  max?: number;
  variant?: "outline" | "default" | "ok" | "accent";
}) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  if (items.length === 0) {
    return <span className="text-[13px] text-faint">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((it, i) => (
        <Badge key={`${it}-${i}`} variant={variant} className="font-sans">
          {it}
        </Badge>
      ))}
      {extra > 0 && (
        <Badge variant="outline" className="font-sans text-faint">
          +{extra}
        </Badge>
      )}
    </div>
  );
}

function BentoCard({
  eyebrow,
  title,
  className,
  children,
}: {
  eyebrow: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <Eyebrow>{eyebrow}</Eyebrow>
        <CardTitle className="text-[19px]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pb-6">
        {children}
      </CardContent>
    </Card>
  );
}

function CandidateCard({ c }: { c: CandidateProfile }) {
  const messages = useMessages();
  return (
    <BentoCard
      eyebrow={t(messages, "session.candidate")}
      title={c.name || t(messages, "session.you")}
    >
      <p className="text-[14px] leading-relaxed text-ink-soft">{c.headline}</p>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <Badge variant="default" className="font-sans capitalize">
          {t(messages, `session.seniority.${c.seniority}`)}
        </Badge>
        <span>
          {t(
            messages,
            c.years_experience === 1
              ? "session.experienceOne"
              : "session.experience",
          ).replace("{count}", String(c.years_experience))}
        </span>
      </div>
      <div className="mt-1">
        <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
          {t(messages, "session.topSkills")}
        </p>
        <Chips items={c.skills} max={10} />
      </div>
    </BentoCard>
  );
}

function RoleCard({ j }: { j: JobSpec }) {
  const messages = useMessages();
  return (
    <BentoCard
      eyebrow={t(messages, "session.role")}
      title={j.title || t(messages, "session.targetRole")}
      className="md:col-span-2"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
            {t(messages, "session.mustHave")}
          </p>
          {j.must_have.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {j.must_have.slice(0, 6).map((m, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[13px] leading-snug text-ink-soft"
                >
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent"
                    aria-hidden
                  />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[13px] text-faint">—</span>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
            {t(messages, "session.niceToHave")}
          </p>
          {j.nice_to_have.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {j.nice_to_have.slice(0, 6).map((m, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[13px] leading-snug text-muted"
                >
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-line"
                    aria-hidden
                  />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[13px] text-faint">—</span>
          )}
        </div>
      </div>
      {j.tech_stack.length > 0 && (
        <div className="mt-1">
          <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
            {t(messages, "session.techStack")}
          </p>
          <Chips items={j.tech_stack} max={12} />
        </div>
      )}
    </BentoCard>
  );
}

function CompanyCard({ co }: { co: CompanyIntel }) {
  const messages = useMessages();
  const hasIntel = Boolean(co.summary) || co.citations.length > 0;
  return (
    <BentoCard
      eyebrow={t(messages, "session.companyIntel")}
      title={co.name || t(messages, "session.company")}
      className="md:col-span-2"
    >
      {hasIntel ? (
        <>
          {co.summary && (
            <p className="text-[14px] leading-relaxed text-ink-soft">
              {co.summary}
            </p>
          )}
          {co.industry && (
            <p className="text-[12px] text-muted">{co.industry}</p>
          )}
          {co.citations.length > 0 && (
            <div className="mt-1">
              <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
                {t(messages, "session.sources")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {co.citations.slice(0, 6).map((cite, i) => (
                  <a
                    key={i}
                    href={cite.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={cite.snippet ?? cite.title}
                    className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-[12px] text-ink-soft no-underline transition-colors hover:border-ink hover:no-underline"
                  >
                    <ExternalLink
                      className="h-3 w-3 shrink-0 text-faint"
                      aria-hidden
                    />
                    <span className="truncate">{cite.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-muted">
          {t(messages, "session.limitedInfo")}
        </p>
      )}
    </BentoCard>
  );
}

function FitCard({ g }: { g: GapAnalysis }) {
  const messages = useMessages();
  return (
    <BentoCard
      eyebrow={t(messages, "session.fit")}
      title={t(messages, "session.fitTitle")}
      className="md:col-span-2"
    >
      {g.summary && (
        <p className="text-[14px] leading-relaxed text-ink-soft">{g.summary}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-ok">
            {t(messages, "session.strengths")}
          </p>
          {g.strengths.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {g.strengths.slice(0, 5).map((s, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[13px] leading-snug text-ink-soft"
                >
                  <Check
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok"
                    aria-hidden
                  />
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[13px] text-faint">—</span>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-accent">
            {t(messages, "session.gaps")}
          </p>
          {g.gaps.length > 0 || g.probe_targets.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {[...g.gaps, ...g.probe_targets].slice(0, 5).map((s, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[13px] leading-snug text-ink-soft"
                >
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
                    aria-hidden
                  />
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[13px] text-faint">—</span>
          )}
        </div>
      </div>
      {g.matched_skills.length > 0 && (
        <div className="mt-1">
          <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
            {t(messages, "session.matchedSkills")}
          </p>
          <Chips items={g.matched_skills} max={10} variant="ok" />
        </div>
      )}
    </BentoCard>
  );
}

function PlanCard({ p }: { p: QuestionPlan }) {
  const messages = useMessages();
  // Difficulty spread (1–5-ish). Build buckets without unchecked indexing.
  const counts = new Map<number, number>();
  for (const q of p.questions) {
    counts.set(q.difficulty, (counts.get(q.difficulty) ?? 0) + 1);
  }
  const maxCount = Math.max(1, ...Array.from(counts.values()));
  const levels = Array.from(counts.keys()).sort((a, b) => a - b);

  return (
    <BentoCard
      eyebrow={t(messages, "session.plan")}
      title={t(messages, "session.planTitle")
        .replace("{count}", String(p.questions.length))
        .replace("{minutes}", String(p.time_budget_min))}
      className="md:col-span-2"
    >
      <div>
        <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
          {t(messages, "session.flow")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {p.sections_order.map((s, i) => (
            <span
              key={`${s}-${i}`}
              className="inline-flex items-center rounded-full border border-line bg-paper px-2.5 py-1 text-[12px] text-ink-soft"
            >
              {t(messages, `session.${s}`)}
            </span>
          ))}
        </div>
      </div>
      {levels.length > 0 && (
        <div className="mt-1">
          <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
            {t(messages, "session.difficulty")}
          </p>
          <div className="flex items-end gap-2">
            {levels.map((lvl) => {
              const n = counts.get(lvl) ?? 0;
              return (
                <div key={lvl} className="flex flex-col items-center gap-1">
                  <div className="flex h-12 items-end">
                    <div
                      className="w-6 rounded-t bg-accent-soft"
                      style={{
                        height: `${Math.max(8, (n / maxCount) * 100)}%`,
                      }}
                    >
                      <div className="h-1 w-full rounded-t bg-accent" />
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-faint">
                    {t(messages, "session.level").replace(
                      "{level}",
                      String(lvl),
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </BentoCard>
  );
}

function ReadyView({
  context,
  warnings,
  onStart,
  onBackToSetup,
}: {
  context: InterviewContext;
  warnings: string[];
  onStart: () => void;
  onBackToSetup: () => void;
}) {
  const messages = useMessages();
  return (
    <div className="mt-8">
      <h1 className="serif text-3xl text-ink sm:text-4xl">
        {t(messages, "session.findings")}
      </h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
        {t(messages, "session.findingsDescription")
          .replace(
            "{role}",
            context.job.title || t(messages, "session.targetRole"),
          )
          .replace(
            "{company}",
            context.job.company_name
              ? t(messages, "session.atCompany").replace(
                  "{company}",
                  context.job.company_name,
                )
              : "",
          )}
      </p>

      <WarningBanner warnings={warnings} />

      {/* Bento grid */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <CandidateCard c={context.candidate} />
        <RoleCard j={context.job} />
        <CompanyCard co={context.company} />
        <FitCard g={context.gap} />
        <PlanCard p={context.plan} />
      </div>

      {/* CTA */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onStart}>
          {t(messages, "setup.start")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="out" size="lg" onClick={onBackToSetup}>
          {t(messages, "session.back")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rejected — friendly empty state                                     */
/* ------------------------------------------------------------------ */

function RejectedView({
  warnings,
  onBackToSetup,
}: {
  warnings: string[];
  onBackToSetup: () => void;
}) {
  const messages = useMessages();
  return (
    <div className="mx-auto mt-10 max-w-[560px]">
      <Card>
        <CardHeader>
          <Eyebrow>{t(messages, "session.rejectedEyebrow")}</Eyebrow>
          <CardTitle className="serif text-2xl">
            {t(messages, "session.rejectedTitle")}
          </CardTitle>
          <CardDescription>
            {t(messages, "session.rejectedDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pb-6">
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-2">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                    aria-hidden
                  />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-[10px] border border-line bg-paper px-4 py-3">
            <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-faint">
              {t(messages, "session.tips")}
            </p>
            <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-muted">
              <li>· {t(messages, "session.tipJd")}</li>
              <li>· {t(messages, "session.tipCv")}</li>
              <li>· {t(messages, "session.tipCompany")}</li>
            </ul>
          </div>

          <Button size="lg" className="self-start" onClick={onBackToSetup}>
            {t(messages, "session.back")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Error — generic recoverable failure (also stalled / not-found copy) */
/* ------------------------------------------------------------------ */

function ErrorView({
  eyebrow,
  title,
  description,
  onRetry,
  onBackToSetup,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  /** Omit to hide the Retry button (e.g. a session that doesn't exist). */
  onRetry?: () => void;
  onBackToSetup: () => void;
}) {
  const messages = useMessages();
  return (
    <div className="mx-auto mt-10 max-w-[520px]">
      <Card>
        <CardHeader>
          <Eyebrow>{eyebrow ?? t(messages, "session.errorEyebrow")}</Eyebrow>
          <CardTitle className="serif text-2xl">
            {title ?? t(messages, "session.errorTitle")}
          </CardTitle>
          <CardDescription>
            {description ?? t(messages, "session.errorDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pb-6">
          {onRetry && (
            <Button size="lg" onClick={onRetry}>
              <RotateCw className="h-4 w-4" aria-hidden />
              {t(messages, "session.retry")}
            </Button>
          )}
          <Button variant="out" size="lg" onClick={onBackToSetup}>
            {t(messages, "session.back")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
