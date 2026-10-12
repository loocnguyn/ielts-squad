import { Task1Chart } from "@/components/charts/task1-chart";
import type { ReadingContent, SpeakingContent, WritingContent } from "@/lib/tests/types";

export function PassageView({ passage }: { passage: ReadingContent["passage"] }) {
  return (
    <article className="flex flex-col gap-4">
      <h2 className="font-heading text-xl font-bold text-balance">{passage.title}</h2>
      {passage.paragraphs.map((paragraph, i) => (
        <p key={i} className="leading-7 text-pretty">
          {paragraph.label && <span className="mr-2 font-bold">{paragraph.label}</span>}
          {paragraph.text}
        </p>
      ))}
    </article>
  );
}

export function WritingPromptView({ content }: { content: WritingContent }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-muted-foreground">
        Writing Task {content.task} · nên dành khoảng {content.task === 1 ? 20 : 40} phút · ít nhất{" "}
        {content.task === 1 ? 150 : 250} từ
      </p>
      <p className="leading-7 font-medium whitespace-pre-line text-pretty">{content.prompt}</p>
      {content.task === 1 && <Task1Chart spec={content.chart} />}
    </div>
  );
}

export function CueCard({ card }: { card: Extract<SpeakingContent, { part: 2 }>["cue_card"] }) {
  return (
    <div className="rounded-xl border-2 border-skill-speaking/50 bg-card p-5">
      <p className="font-semibold">{card.prompt}</p>
      <p className="mt-3 text-sm text-muted-foreground">You should say:</p>
      <ul className="mt-1 list-disc pl-5 leading-7">
        {card.bullets.map((bullet, i) => (
          <li key={i}>{bullet}</li>
        ))}
      </ul>
      {card.closing && <p className="mt-2">{card.closing}</p>}
    </div>
  );
}

export function SpeakingPreview({ content }: { content: SpeakingContent }) {
  if (content.part === "full") {
    const parts: [string, SpeakingContent][] = [
      ["Part 1", { part: 1, ...content.part1 }],
      ["Part 2", { part: 2, ...content.part2 }],
      ["Part 3", { part: 3, ...content.part3 }],
    ];
    return (
      <div className="flex flex-col gap-5">
        {parts.map(([label, part]) => (
          <section key={label} className="flex flex-col gap-2">
            <h3 className="font-heading font-bold">{label}</h3>
            <SpeakingPreview content={part} />
          </section>
        ))}
      </div>
    );
  }
  if (content.part === 2) {
    return (
      <div className="flex flex-col gap-3">
        <CueCard card={content.cue_card} />
        {content.rounding_off.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {content.rounding_off.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const groups =
    content.part === 1
      ? content.topics.map((t) => ({ title: t.topic, questions: t.questions }))
      : [{ title: content.theme, questions: content.questions }];
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="text-sm font-semibold text-muted-foreground">{group.title}</p>
          <ol className="mt-1 list-decimal pl-5 leading-7">
            {group.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
