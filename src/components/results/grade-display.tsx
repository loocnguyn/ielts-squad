import { formatBand } from "@/lib/bands";
import { CRITERIA_LABELS, type GradeCriteria } from "@/lib/tests/grading";
import type { Grade } from "@/lib/types";

type Feedback = {
  to_reach_8?: string[];
  corrections?: { original: string; better: string; why: string }[];
};

/** Criteria in the order of the band descriptors; Postgres jsonb does not keep key order. */
function orderedCriteria(criteria: GradeCriteria) {
  const order = Object.keys(CRITERIA_LABELS);
  return Object.entries(criteria).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
}

/** A Claude Pro grade: overall band, each criterion, and how to reach band 8. */
export function GradeDisplay({ grade }: { grade: Grade }) {
  const criteria = (grade.criteria ?? {}) as GradeCriteria;
  const feedback = (grade.feedback ?? {}) as Feedback;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-3">
        <span className="font-heading text-4xl font-bold">{formatBand(grade.band)}</span>
        <span className="text-sm text-muted-foreground">Band do Claude Pro chấm</span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {orderedCriteria(criteria).map(([key, criterion]) => (
          <div key={key} className="rounded-xl border bg-background p-3.5">
            <dt className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{CRITERIA_LABELS[key] ?? key}</span>
              <span className="font-heading text-lg font-bold tabular-nums">{formatBand(criterion.band)}</span>
            </dt>
            <dd className="mt-1.5 text-sm text-muted-foreground text-pretty">{criterion.comment}</dd>
          </div>
        ))}
      </dl>

      {feedback.to_reach_8 && feedback.to_reach_8.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Để lên band 8</h4>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm text-pretty">
            {feedback.to_reach_8.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {feedback.corrections && feedback.corrections.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Sửa lỗi</h4>
          <ul className="mt-1.5 flex flex-col gap-2 text-sm">
            {feedback.corrections.map((fix, i) => (
              <li key={i} className="rounded-lg border bg-background p-3">
                <p>
                  <span className="text-destructive line-through decoration-1">{fix.original}</span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span className="font-medium text-success">{fix.better}</span>
                </p>
                <p className="mt-1 text-muted-foreground">{fix.why}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
