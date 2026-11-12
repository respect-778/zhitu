import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CoachReplySchema,
  LanguageSchema,
  type CoachReply,
} from "@deepinterview/shared";
import { gateRequest } from "@deepinterview/ee";
import { serverEnv } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { localizeContent } from "@/lib/localize-content";

// Reads server-only config (AGENT_API_URL) and proxies a live agent call.
export const dynamic = "force-dynamic";

/**
 * Client body. session_id is optional (the /prep surface may have no live
 * session); it only scopes knowledge retrieval. lang falls back to "zh".
 */
const BodySchema = z.object({
  session_id: z.string().default("anonymous"),
  query: z.string().min(1),
  lang: LanguageSchema.catch("zh").default("zh"),
});

/** A grounded mock reply so the coach chat works even with the agent down. */
function mockReply(query: string, lang: string = "zh"): CoachReply {
  const q = query.trim().replace(/\s+/g, " ");
  if (lang === "zh") {
    return {
      answer:
        `针对“${q}”，建议先说明采用的思考框架，再用一个具体案例完整说明过程，` +
        "最后解释你的取舍依据。（当前为示例回复，连接面试服务后可获得结合材料的辅导。）",
      citations: [
        {
          title: "备考笔记",
          url: "https://example.com/kb/prep-notes",
          snippet: "来自备考材料的相关主题建议。",
        },
      ],
      follow_ups: ["可以给出一个具体例子吗？", "这里常见的错误是什么？"],
    };
  }
  return {
    answer:
      `Here's how I'd coach you on "${q}": name the framework, walk one concrete ` +
      `example end to end, then state the trade-off you're optimizing for. ` +
      `(Sample response — start the agent API for fully grounded coaching.)`,
    citations: [
      {
        title: "Prep notes",
        url: "https://example.com/kb/prep-notes",
        snippet: "Relevant guidance for this topic from your materials.",
      },
    ],
    follow_ups: [
      "Can you give a concrete example?",
      "What's a common mistake here?",
    ],
  };
}

export async function POST(request: Request) {
  // Distribution gate (no-op in OSS): coach replies spend LLM tokens; a
  // distribution with required auth rejects anonymous callers here.
  const user = await getUser();
  const gate = gateRequest({
    pathname: "/api/coach/chat",
    isAuthenticated: Boolean(user),
  });
  if (!gate.allow) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  try {
    const secret = serverEnv.internalApiSecret;
    const upstream = await fetch(`${serverEnv.agentApiUrl}/api/coach/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-internal-secret": secret } : {}),
      },
      body: JSON.stringify({
        session_id: body.session_id,
        query: body.query,
        lang: body.lang,
      }),
      // Don't let a slow agent hang the request forever.
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok)
      return NextResponse.json(mockReply(body.query, body.lang));

    const json = await upstream.json();
    const parsed = CoachReplySchema.safeParse(json);
    // Validate the upstream shape; fall back to a mock on drift.
    return NextResponse.json(
      await localizeContent(
        parsed.success ? parsed.data : mockReply(body.query, body.lang),
        body.lang === "zh" ? "zh" : "en",
      ),
    );
  } catch {
    // Agent unreachable / timeout / bad JSON — stay resilient.
    return NextResponse.json(mockReply(body.query, body.lang));
  }
}
