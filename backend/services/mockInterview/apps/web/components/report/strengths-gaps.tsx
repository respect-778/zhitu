import type { ScoreCard } from "@deepinterview/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMessages, type Dictionary } from "@/lib/i18n";

function Bullet({
  tone,
  children,
}: {
  tone: "ok" | "accent";
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
      <span
        aria-hidden
        className={
          tone === "ok"
            ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ok"
            : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
        }
      />
      <span>{children}</span>
    </li>
  );
}

/**
 * Two-column strengths vs gaps. Strengths read in the "ok" tone; weaknesses and
 * the named weak competencies read in the accent tone, with a note that weak
 * areas route into the Prep Coach (WP-4). Server component.
 */
export function StrengthsGaps({
  scorecard,
  labels = getMessages().report,
}: {
  scorecard: ScoreCard;
  labels?: Dictionary["report"];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{labels.strengths}</CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <ul className="space-y-2.5">
            {scorecard.strengths.map((s, i) => (
              <Bullet key={i} tone="ok">
                {s}
              </Bullet>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{labels.improvements}</CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <ul className="space-y-2.5">
            {scorecard.weaknesses.map((w, i) => (
              <Bullet key={i} tone="accent">
                {w}
              </Bullet>
            ))}
          </ul>

          {scorecard.weak_competencies.length > 0 && (
            <div className="mt-5 rounded-[10px] border border-line bg-accent-soft px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {scorecard.weak_competencies.map((c) => (
                  <Badge key={c} variant="accent">
                    {c}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                {labels.weakAreasDescription}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
