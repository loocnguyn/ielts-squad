import type { Metadata } from "next";
import Link from "next/link";
import { AudioLines, CircleAlert } from "lucide-react";
import { BankComposer } from "@/components/bank/bank-composer";
import { DeleteTestButton } from "@/components/bank/delete-test-button";
import { requireProfile } from "@/lib/auth";
import { getBankSummary, getMyTests } from "@/lib/data/bank";
import { SKILLS, SKILL_META } from "@/lib/skills";
import type { Skill } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ngân hàng đề" };

export default async function BankPage() {
  const profile = await requireProfile("/bank");
  const [summary, myTests] = await Promise.all([getBankSummary(), getMyTests(profile.id)]);

  const existingTitles = Object.fromEntries(
    SKILLS.map((skill) => [skill, myTests.filter((t) => t.skill === skill).map((t) => t.title)]),
  ) as Record<Skill, string[]>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Ngân hàng đề</h1>
        <p className="mt-1 text-muted-foreground">
          Đề do Claude Pro soạn theo đúng format IELTS Academic. Mỗi nhóm nhận đề chưa làm từ đây
          vào 00:00 mỗi ngày.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SKILLS.map((skill) => {
          const meta = SKILL_META[skill];
          const rows = summary.filter((row) => row.skill === skill);
          const ready = rows.reduce((sum, row) => sum + Number(row.ready), 0);
          const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
          return (
            <li key={skill} className="rounded-2xl border bg-card p-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <meta.icon className={cn("size-4", meta.text)} /> {meta.label}
              </p>
              <p className="mt-1 font-heading text-3xl font-bold">{ready}</p>
              <p className="text-xs text-muted-foreground">
                {rows.length > 1
                  ? rows.map((row) => `${row.part}: ${row.ready}`).join(" · ")
                  : "đề sẵn sàng"}
                {total > ready && ` · ${total - ready} đề chờ audio`}
              </p>
            </li>
          );
        })}
      </ul>

      <BankComposer existingTitles={existingTitles} />

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-heading font-bold">
          Đề bạn đã soạn <span className="font-normal text-muted-foreground">{myTests.length}</span>
        </h2>
        {myTests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Chưa có đề nào. Bắt đầu bằng bộ đề mẫu ở trên, hoặc soạn lô đầu tiên với Claude.
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {myTests.map((test) => {
              const needsAudio = test.skill === "listening" && !test.audio_path;
              return (
                <li key={test.id} className="flex items-center gap-3 py-2.5">
                  <span className={cn("size-2.5 shrink-0 rounded-full", SKILL_META[test.skill].bg)} />
                  <Link href={`/bank/${test.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{test.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {SKILL_META[test.skill].label} · {test.part} · {Math.round(test.duration_sec / 60)} phút
                    </span>
                  </Link>
                  {needsAudio ? (
                    <Link
                      href={`/bank/${test.id}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-skill-listening/15 px-2.5 py-1 text-xs font-medium"
                    >
                      <CircleAlert className="size-3.5 text-skill-listening" /> Cần tạo audio
                    </Link>
                  ) : (
                    test.skill === "listening" && (
                      <AudioLines aria-label="Đã có audio" className="size-4 shrink-0 text-muted-foreground" />
                    )
                  )}
                  <DeleteTestButton testId={test.id} title={test.title} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
