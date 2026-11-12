import type { AnswerRecord, PlannedQuestion } from "@deepinterview/shared";
import type { Locale } from "@/lib/i18n";

export interface ConversationTurn {
  role: "assistant" | "user";
  text: string;
  question_id: string;
}

export function buildReportTranscript(
  transcript: readonly { role: string; text: string; question_id: string }[],
  questions: readonly Pick<PlannedQuestion, "id" | "text">[],
  answers: readonly Pick<AnswerRecord, "question_id" | "transcript">[],
  locale: Locale,
): { turns: ConversationTurn[]; legacy: boolean } {
  const recorded = transcript.filter(
    (turn): turn is ConversationTurn =>
      (turn.role === "assistant" || turn.role === "user") && !!turn.text.trim(),
  );
  if (recorded.length) return { turns: recorded, legacy: false };

  const byId = new Map(questions.map((question) => [question.id, question]));
  const shown = new Set<string>();
  const turns: ConversationTurn[] = [];
  for (const answer of answers) {
    if (!answer.transcript?.trim()) continue;
    const question = byId.get(answer.question_id);
    if (question && !shown.has(question.id)) {
      turns.push({
        role: "assistant",
        text: question.text[locale] || question.text.en || "",
        question_id: question.id,
      });
      shown.add(question.id);
    }
    turns.push({
      role: "user",
      text: answer.transcript,
      question_id: answer.question_id,
    });
  }
  return { turns, legacy: true };
}
