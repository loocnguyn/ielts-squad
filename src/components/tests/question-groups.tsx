"use client";

import { Fragment } from "react";
import { Check, X } from "lucide-react";
import { isCorrect } from "@/lib/tests/answers";
import type { AnswerKey, Options, QuestionGroup } from "@/lib/tests/types";
import { cn } from "@/lib/utils";

export type Answers = Record<string, string>;

/** Present once the attempt is submitted: shows right/wrong and the key. */
export type Review = { key: AnswerKey; explanations?: Record<string, string> };

type Props = {
  groups: QuestionGroup[];
  answers: Answers;
  onChange?: (n: number, value: string) => void;
  review?: Review;
};

const TFNG = ["TRUE", "FALSE", "NOT GIVEN"];
const YNNG = ["YES", "NO", "NOT GIVEN"];

function QNumber({ n, state }: { n: number; state?: boolean }) {
  return (
    <span
      id={`q-${n}`}
      className={cn(
        "inline-grid size-6 shrink-0 scroll-mt-28 place-items-center rounded-md border text-xs font-bold",
        state === true && "border-success bg-success/15 text-success",
        state === false && "border-destructive bg-destructive/10 text-destructive",
      )}
    >
      {n}
    </span>
  );
}

function Verdict({ n, answers, review }: { n: number; answers: Answers; review?: Review }) {
  if (!review) return null;
  const accepted = review.key[String(n)] ?? [];
  const correct = isCorrect(answers[String(n)], accepted);
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
      {correct ? (
        <span className="inline-flex items-center gap-1 font-medium text-success">
          <Check className="size-4" /> Đúng
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <X className="size-4" /> Đáp án: {accepted.join(" / ")}
        </span>
      )}
      {review.explanations?.[String(n)] && (
        <span className="text-muted-foreground">{review.explanations[String(n)]}</span>
      )}
    </p>
  );
}

function verdictState(n: number, answers: Answers, review?: Review) {
  return review ? isCorrect(answers[String(n)], review.key[String(n)]) : undefined;
}

function ChoiceButtons({
  n,
  choices,
  value,
  onChange,
  disabled,
}: {
  n: number;
  choices: { key: string; label: string }[];
  value: string;
  onChange?: (n: number, value: string) => void;
  disabled: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={`Câu ${n}`} className="mt-2 flex flex-col gap-1.5">
      {choices.map((choice) => {
        const selected = value.toUpperCase() === choice.key.toUpperCase();
        return (
          <button
            key={choice.key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange?.(n, selected ? "" : choice.key)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              "hover:border-ring disabled:pointer-events-none",
              selected && "border-foreground bg-secondary font-medium",
            )}
          >
            <span className="font-mono font-bold">{choice.key}</span>
            {choice.label !== choice.key && <span>{choice.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

function OptionList({ options, title }: { options: Options; title: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="flex flex-col gap-1">
        {Object.entries(options).map(([key, label]) => (
          <li key={key} className="flex gap-2">
            <span className="w-7 shrink-0 font-mono font-bold">{key}</span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-100";

const blankClass =
  "mx-1 inline-block h-8 w-36 rounded-md border border-input bg-background px-2 align-baseline text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function CompletionText({
  group,
  answers,
  onChange,
  review,
}: {
  group: Extract<QuestionGroup, { type: "completion" }>;
  answers: Answers;
  onChange?: (n: number, value: string) => void;
  review?: Review;
}) {
  const disabled = !onChange;
  const lines = group.text.split("\n");

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 leading-8">
      {lines.map((line, lineIndex) => (
        <p key={lineIndex}>
          {line.split(/(\{\{\d+\}\})/).map((piece, i) => {
            const match = piece.match(/^\{\{(\d+)\}\}$/);
            if (!match) return <Fragment key={i}>{piece}</Fragment>;
            const n = Number(match[1]);
            const value = answers[String(n)] ?? "";
            const state = verdictState(n, answers, review);
            return (
              <span key={i} className="whitespace-nowrap">
                <QNumber n={n} state={state} />
                {group.word_bank ? (
                  <select
                    aria-label={`Câu ${n}`}
                    className={cn(selectClass, "mx-1")}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange?.(n, e.target.value)}
                  >
                    <option value="">–</option>
                    {Object.keys(group.word_bank).map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={`Câu ${n}`}
                    className={blankClass}
                    value={value}
                    readOnly={disabled}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    onChange={(e) => onChange?.(n, e.target.value)}
                  />
                )}
                {review && state === false && (
                  <span className="mr-1 text-sm font-medium text-destructive">
                    → {(review.key[String(n)] ?? []).join(" / ")}
                  </span>
                )}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

function Group({ group, answers, onChange, review }: Props & { group: QuestionGroup }) {
  const disabled = !onChange;

  if (group.type === "completion") {
    return (
      <>
        {group.word_bank && <OptionList options={group.word_bank} title="Danh sách từ" />}
        <CompletionText group={group} answers={answers} onChange={onChange} review={review} />
      </>
    );
  }

  if (group.type === "matching") {
    return (
      <>
        <OptionList options={group.options} title="Lựa chọn" />
        <ul className="flex flex-col gap-3">
          {group.questions.map((q) => (
            <li key={q.n}>
              <div className="flex flex-wrap items-center gap-2">
                <QNumber n={q.n} state={verdictState(q.n, answers, review)} />
                <span className="min-w-0 flex-1 basis-48">{q.prompt}</span>
                <select
                  aria-label={`Câu ${q.n}`}
                  className={selectClass}
                  value={answers[String(q.n)] ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange?.(q.n, e.target.value)}
                >
                  <option value="">Chọn</option>
                  {Object.keys(group.options).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </div>
              <Verdict n={q.n} answers={answers} review={review} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (group.type === "short_answer") {
    return (
      <ul className="flex flex-col gap-3">
        {group.questions.map((q) => (
          <li key={q.n}>
            <div className="flex flex-wrap items-center gap-2">
              <QNumber n={q.n} state={verdictState(q.n, answers, review)} />
              <span className="min-w-0 flex-1 basis-48">{q.prompt}</span>
              <input
                aria-label={`Câu ${q.n}`}
                className={cn(blankClass, "mx-0 w-48")}
                value={answers[String(q.n)] ?? ""}
                readOnly={disabled}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onChange?.(q.n, e.target.value)}
              />
            </div>
            <Verdict n={q.n} answers={answers} review={review} />
          </li>
        ))}
      </ul>
    );
  }

  // multiple_choice, true_false_not_given, yes_no_not_given
  return (
    <ul className="flex flex-col gap-4">
      {group.questions.map((q) => {
        const choices =
          group.type === "multiple_choice"
            ? Object.entries((q as { options: Options }).options).map(([key, label]) => ({ key, label }))
            : (group.type === "true_false_not_given" ? TFNG : YNNG).map((key) => ({ key, label: key }));
        return (
          <li key={q.n}>
            <div className="flex items-start gap-2">
              <QNumber n={q.n} state={verdictState(q.n, answers, review)} />
              <span className="font-medium">{q.prompt}</span>
            </div>
            <ChoiceButtons
              n={q.n}
              choices={choices}
              value={answers[String(q.n)] ?? ""}
              onChange={onChange}
              disabled={disabled}
            />
            <Verdict n={q.n} answers={answers} review={review} />
          </li>
        );
      })}
    </ul>
  );
}

export function QuestionGroups({ groups, answers, onChange, review }: Props) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group, i) => (
        <section key={i} className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-pretty">
            {group.instruction}
            {"word_limit" in group && (
              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs font-bold whitespace-nowrap">
                {group.word_limit}
              </span>
            )}
          </p>
          <Group group={group} groups={groups} answers={answers} onChange={onChange} review={review} />
        </section>
      ))}
    </div>
  );
}
