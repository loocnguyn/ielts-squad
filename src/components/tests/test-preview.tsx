"use client";

import { QuestionGroups } from "@/components/tests/question-groups";
import { PassageView, SpeakingPreview, WritingPromptView } from "@/components/tests/test-views";
import type {
  AnswerKey,
  ListeningContent,
  ReadingContent,
  SpeakingContent,
  WritingContent,
} from "@/lib/tests/types";
import type { Skill } from "@/lib/types";

/** Read-only rendering of a test for its author; shows the key when given. */
export function TestPreview({
  skill,
  content,
  answerKey,
}: {
  skill: Skill;
  content: unknown;
  answerKey?: AnswerKey | null;
}) {
  // With a key, each question is shown answered correctly so the author can check it.
  const answers = Object.fromEntries(Object.entries(answerKey ?? {}).map(([n, a]) => [n, a[0] ?? ""]));
  const review = answerKey ? { key: answerKey } : undefined;

  if (skill === "reading") {
    const reading = content as ReadingContent;
    return (
      <div className="flex flex-col gap-8">
        <PassageView passage={reading.passage} />
        <QuestionGroups groups={reading.groups} answers={answers} review={review} />
      </div>
    );
  }
  if (skill === "listening") {
    const listening = content as ListeningContent;
    return (
      <div className="flex flex-col gap-8">
        {listening.parts.map((part) => (
          <section key={part.part} className="flex flex-col gap-4">
            <div>
              <h3 className="font-heading font-bold">Part {part.part}</h3>
              <p className="text-sm text-muted-foreground">{part.context}</p>
            </div>
            <QuestionGroups groups={part.groups} answers={answers} review={review} />
          </section>
        ))}
      </div>
    );
  }
  if (skill === "writing") return <WritingPromptView content={content as WritingContent} />;
  return <SpeakingPreview content={content as SpeakingContent} />;
}
