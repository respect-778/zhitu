"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-runs the server component (which re-fetches the session view) on an
 * interval while the session is still in flight, so the report flips to the
 * real result the moment it's ready — without the user refreshing.
 *
 * Polling is BOUNDED. A session only leaves its non-terminal state because
 * something else writes to it (the voice worker at shutdown, or the scoring
 * stage), and when that something is broken or was never running, an unbounded
 * poll spins forever behind a spinner that claims progress — the "Grading your
 * interview" hang in issue #67. After `stopAfterMs` the interval is cleared and
 * `stalledMessage` is shown, so a stuck pipeline looks stuck.
 */
export function ScoringPoll({
  intervalMs = 2500,
  stopAfterMs = 120_000,
  stalledMessage,
}: {
  intervalMs?: number;
  stopAfterMs?: number;
  stalledMessage?: string;
}) {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (stalled) return;
    const poll = setInterval(() => router.refresh(), intervalMs);
    const deadline = setTimeout(() => setStalled(true), stopAfterMs);
    return () => {
      clearInterval(poll);
      clearTimeout(deadline);
    };
  }, [router, intervalMs, stopAfterMs, stalled]);

  if (!stalled || !stalledMessage) return null;
  return (
    <p
      role="status"
      className="mt-2 max-w-sm text-sm leading-relaxed text-muted"
    >
      {stalledMessage}
    </p>
  );
}
