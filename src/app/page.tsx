import Link from "next/link";
import { ArrowRight, Flame, Sparkles, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { SKILLS, SKILL_META } from "@/lib/skills";

const SKILL_BLURB = {
  reading: "1 passage học thuật, 13–14 câu, 20 phút",
  listening: "2 part, 20 câu, chỉ nghe một lần",
  writing: "Task 1 và Task 2 xen kẽ, Claude chấm 4 tiêu chí",
  speaking: "Ghi âm, ra chữ ngay trong trình duyệt",
} as const;

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--skill-listening)_28%,transparent),transparent)]"
      />
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Brand className="text-lg" />
        <Button asChild variant="outline">
          <Link href="/login">Đăng nhập</Link>
        </Button>
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-5 py-10">
        <section className="flex max-w-2xl flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-skill-writing" />
            IELTS Academic · mục tiêu band 8.0
          </span>
          <h1 className="font-heading text-4xl leading-tight font-extrabold tracking-tight text-balance sm:text-6xl">
            Mỗi ngày một bộ đề,{" "}
            <span className="bg-gradient-to-r from-skill-reading via-skill-listening to-skill-writing bg-clip-text text-transparent">
              cả nhóm cùng lên band
            </span>
          </h1>
          <p className="text-lg text-muted-foreground text-pretty">
            Cả nhóm nhận chung một bộ 4 kỹ năng, ai làm giờ nào cũng được, miễn
            xong trước giờ chốt. Xem ai đã xong, so điểm và giữ chuỗi ngày.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="h-11 px-5 text-base">
              <Link href="/login">
                Bắt đầu ôn <ArrowRight />
              </Link>
            </Button>
            <span className="inline-flex items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" /> 2–10 người
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Flame className="size-4 text-streak" /> Streak mỗi ngày
              </span>
            </span>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SKILLS.map((skill) => {
            const meta = SKILL_META[skill];
            const Icon = meta.icon;
            return (
              <div
                key={skill}
                className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
                style={{ borderColor: `color-mix(in oklch, ${meta.color} 35%, transparent)` }}
              >
                <span
                  className="grid size-10 place-items-center rounded-xl"
                  style={{ background: `color-mix(in oklch, ${meta.color} 18%, transparent)` }}
                >
                  <Icon className={`size-5 ${meta.text}`} />
                </span>
                <div>
                  <h2 className="font-heading font-bold">{meta.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{SKILL_BLURB[skill]}</p>
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
