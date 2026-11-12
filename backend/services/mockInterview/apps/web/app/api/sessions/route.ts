import { NextResponse } from "next/server";
import { serverEnv, isSupabaseConfigured } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { isLocalHistoryRequest, SessionHistorySchema } from "@/lib/session-history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  let userId: string | undefined;
  if (isSupabaseConfigured()) {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401, headers });
    }
    userId = user.id;
  } else if (!serverEnv.localInterviewHistory || !isLocalHistoryRequest(request)) {
    return NextResponse.json({ error: "HISTORY_DISABLED" }, { status: 403, headers });
  }

  const secret = serverEnv.interviewHistorySecret;
  if (!secret) {
    return NextResponse.json({ error: "HISTORY_DISABLED" }, { status: 503, headers });
  }
  const offset = new URL(request.url).searchParams.get("offset") ?? "0";
  if (!/^\d{1,8}$/.test(offset)) {
    return NextResponse.json({ error: "INVALID_OFFSET" }, { status: 400, headers });
  }
  const query = new URLSearchParams({ offset, limit: "50" });
  if (userId) query.set("user_id", userId);
  try {
    const response = await fetch(`${serverEnv.agentApiUrl}/api/sessions?${query}`, {
      headers: { "x-history-secret": secret },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("History service unavailable");
    return NextResponse.json(SessionHistorySchema.parse(await response.json()), { headers });
  } catch {
    return NextResponse.json({ error: "HISTORY_UNAVAILABLE" }, { status: 503, headers });
  }
}
