import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import { localizeContent } from "../lib/localize-content";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Chinese display content", () => {
  it("translates feedback and preserves scores, identifiers, enums and source data", async () => {
    vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      const texts = JSON.parse(body.messages[1].content);
      const translations = Object.fromEntries(
        Object.keys(texts).map((key) => [key, "中文反馈"]),
      );
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ translations }) } }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const original = {
      session_id: "sess_english",
      status: "complete",
      overall_score: 2.5,
      summary: "A clear summary.",
      role: "AI Product Intern",
      transcript: [
        { role: "assistant", text: "What happened?", question_id: "q1" },
      ],
      competency_scores: [
        {
          competency: "Communication",
          score: 3,
          level: "solid",
          evidence: "Clear examples.",
        },
      ],
      model_answers: [
        { question_id: "question_english", answer: "Explain the trade-off." },
      ],
      question: { en: "Tell me about a project." },
      citations: [
        { title: "Interview notes", url: "https://example.com/source" },
      ],
    };
    const result = await localizeContent(original, "zh");
    expect(result.summary).toBe("中文反馈");
    expect(result.role).toBe("中文反馈");
    expect(result.transcript[0]?.role).toBe("assistant");
    expect(result.competency_scores[0]).toEqual({
      competency: "中文反馈",
      score: 3,
      level: "solid",
      evidence: "中文反馈",
    });
    expect(result.session_id).toBe("sess_english");
    expect(result.status).toBe("complete");
    expect(result.overall_score).toBe(2.5);
    expect(result.model_answers[0]?.question_id).toBe("question_english");
    expect(result.citations[0]?.url).toBe("https://example.com/source");
    expect(result.question).toEqual({
      en: "Tell me about a project.",
      zh: "中文反馈",
    });
    expect(original.summary).toBe("A clear summary.");
  });

  it("rejects incomplete translations so an unsuccessful response is retried", async () => {
    vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: '{"translations":{}}' } }],
        }),
      ),
    );
    await expect(
      localizeContent({ summary: "Needs evidence." }, "zh"),
    ).rejects.toThrow("incomplete");
  });

  it("keeps English preferences and numeric-only data offline", async () => {
    vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await localizeContent({ summary: "English" }, "en")).toEqual({
      summary: "English",
    });
    expect(
      await localizeContent({ score: 3, summary: "中文报告" }, "zh"),
    ).toEqual({ score: 3, summary: "中文报告" });
    const technical = { summary: "使用 Python 与 PostgreSQL 完成数据分析。" };
    expect(await localizeContent(technical, "zh")).toBe(technical);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
