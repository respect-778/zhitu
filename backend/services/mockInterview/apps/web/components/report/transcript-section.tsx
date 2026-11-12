import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMessages, type Dictionary } from "@/lib/i18n";
import type { ConversationTurn } from "@/lib/report-transcript";

/**
 * Actual committed dialogue in spoken order, including follow-ups and replies.
 */
export function TranscriptSection({
  turns,
  legacy = false,
  labels = getMessages().report,
}: {
  turns: ConversationTurn[];
  legacy?: boolean;
  labels?: Dictionary["report"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.transcript}</CardTitle>
        <CardDescription>
          {legacy ? labels.legacyTranscript : labels.transcriptDescription}
        </CardDescription>
      </CardHeader>
      <ol className="divide-y divide-line px-6 pb-6">
        {turns.map((t, i) => (
          <li key={i} className="py-4 first:pt-0">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  {t.role === "assistant"
                    ? labels.interviewer
                    : labels.candidate}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                  {t.text}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {turns.length === 0 && (
        <p className="px-6 pb-6 text-sm text-muted">{labels.transcriptEmpty}</p>
      )}
    </Card>
  );
}
