import {
  PrepResponseSchema,
  ScoreResponseSchema,
  StudyPlanSchema,
  type PrepRequest,
  type PrepResponse,
  type ScoreCard,
  type ScoreRequest,
  type ScoreResponse,
  type StudyPlan,
} from "@deepinterview/shared";
import { serverEnv } from "@/lib/env";
import { localizeContent } from "@/lib/localize-content";
import type { Locale } from "@/lib/i18n";

async function postJson<T>(
  path: string,
  body: unknown,
  parse: (data: unknown) => T,
): Promise<T> {
  const secret = serverEnv.internalApiSecret;
  const res = await fetch(`${serverEnv.agentApiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-internal-secret": secret } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Agent request ${path} failed: ${res.status} ${res.statusText}${
        text ? ` — ${text}` : ""
      }`,
    );
  }

  return parse(await res.json());
}

/** Kick off the prep pipeline for a CV + JD + company. */
export function requestPrep(body: PrepRequest): Promise<PrepResponse> {
  return postJson("/api/prep", body, (d) => PrepResponseSchema.parse(d));
}

/** Score a completed interview session. */
export function requestScore(body: ScoreRequest): Promise<ScoreResponse> {
  return postJson("/api/score", body, (d) => ScoreResponseSchema.parse(d));
}

/** Build a Study Coach plan from a scorecard's weak competencies (server-side). */
export async function requestCoachPlan(
  scorecard: ScoreCard,
  locale: Locale = "zh",
): Promise<StudyPlan> {
  const plan = await postJson("/api/coach/plan", { scorecard }, (d) =>
    StudyPlanSchema.parse(d),
  );
  return localizeContent(plan, locale);
}
