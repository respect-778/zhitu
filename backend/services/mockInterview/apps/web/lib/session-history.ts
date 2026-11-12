import { z } from "zod";

export const SessionSummarySchema = z.object({
  session_id: z.string().regex(/^sess_[a-f0-9]{32}$/),
  status: z.enum(["prep", "ready", "rejected", "error", "complete", "no_answers"]),
  created_at: z.string().nullable(),
  company: z.string().nullable(),
  job_title: z.string().nullable(),
  overall_score: z.number().finite().nullable(),
});

export const SessionHistorySchema = z.object({
  items: z.array(SessionSummarySchema),
  has_more: z.boolean(),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/** Anonymous history is deliberately limited to an opted-in loopback site. */
export function isLocalHistoryRequest(request: Request): boolean {
  const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    if (!host || !local.has(url.hostname) || !local.has(new URL(`http://${host}`).hostname)) {
      return false;
    }
    const forwarded = request.headers.get("x-forwarded-host");
    if (forwarded && !local.has(new URL(`http://${forwarded}`).hostname)) return false;
    const origin = request.headers.get("origin");
    if (origin && !local.has(new URL(origin).hostname)) return false;
    return request.headers.get("sec-fetch-site") !== "cross-site";
  } catch {
    return false;
  }
}
