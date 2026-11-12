import { describe, expect, it } from "vitest";
import { buildReportTranscript } from "../lib/report-transcript";

const questions = [
  { id: "q1", text: { en: "Project?", zh: "介绍项目。" } },
  { id: "q2", text: { en: "Unused question", zh: "尚未问到的问题" } },
];

describe("report conversation history", () => {
  it("preserves every actual turn including follow-ups and closing remarks", () => {
    const transcript = [
      { role: "assistant", text: "介绍项目。", question_id: "q1" },
      { role: "user", text: "项目回答", question_id: "q1" },
      { role: "assistant", text: "如何验证效果？", question_id: "q1" },
      { role: "user", text: "追问回答", question_id: "q1" },
      { role: "assistant", text: "感谢参加面试。", question_id: "" },
    ];
    const result = buildReportTranscript(transcript, questions, [], "zh");
    expect(result.turns).toEqual(transcript);
    expect(result.legacy).toBe(false);
    expect(result.turns.some((turn) => turn.text === "尚未问到的问题")).toBe(
      false,
    );
  });

  it("keeps every legacy answer and excludes unanswered plan entries", () => {
    const answers = [
      { question_id: "q1", transcript: "第一段回答" },
      { question_id: "q1", transcript: "后续回答" },
    ];
    const result = buildReportTranscript([], questions, answers, "zh");
    expect(result.legacy).toBe(true);
    expect(result.turns.map((turn) => turn.text)).toEqual([
      "介绍项目。",
      "第一段回答",
      "后续回答",
    ]);
  });
});
