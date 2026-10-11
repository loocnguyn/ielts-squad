"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { startAttempt } from "@/app/actions/attempts";
import { Button } from "@/components/ui/button";
import { SKILL_META } from "@/lib/skills";
import type { Skill } from "@/lib/types";

const RULES: Record<Skill, string[]> = {
  reading: [
    "Một passage học thuật và 13–14 câu hỏi.",
    "Đáp án được lưu tự động trong lúc làm.",
  ],
  listening: [
    "Audio tự phát ngay khi bắt đầu và chỉ phát một lần, không tua, không dừng.",
    "Hãy đeo tai nghe và kiểm tra âm lượng trước.",
    "Sau khi audio hết, bạn còn 2 phút để soát đáp án.",
  ],
  writing: [
    "Viết trực tiếp trên trang, có đếm từ.",
    "Bài viết được lưu tự động trong lúc làm.",
    "Nộp xong, bạn copy gói chấm sang Claude Pro để lấy điểm 4 tiêu chí.",
  ],
  speaking: [
    "Cần micro. Trình duyệt sẽ hỏi quyền ghi âm.",
    "Bản ghi được chuyển thành chữ ngay trên máy bạn, rồi cả nhóm có thể nghe lại.",
    "Tìm chỗ yên tĩnh trước khi bắt đầu.",
  ],
};

type Props = {
  groupId: string;
  dailySetId: string;
  skill: Skill;
  title: string;
  minutes: number;
  closed: boolean;
};

/** Shown before the clock starts, so opening the page never starts it by accident. */
export function StartScreen({ groupId, dailySetId, skill, title, minutes, closed }: Props) {
  const meta = SKILL_META[skill];
  const [pending, startTransition] = useTransition();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Link
        href={`/groups/${groupId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Về bảng ngày
      </Link>

      <div className="rounded-2xl border bg-card p-6">
        <span
          className="grid size-12 place-items-center rounded-xl"
          style={{ background: `color-mix(in oklch, ${meta.color} 18%, transparent)` }}
        >
          <meta.icon className={`size-6 ${meta.text}`} />
        </span>
        <p className="mt-4 text-sm text-muted-foreground">
          {meta.label} · {minutes} phút
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-balance">{title}</h1>

        <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Đồng hồ {minutes} phút chạy ngay khi bạn bấm Bắt đầu và không dừng lại, kể cả khi đóng tab.
          </li>
          {RULES[skill].map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        {closed ? (
          <p className="mt-5 text-sm font-medium text-destructive">
            Ngày hôm nay đã chốt, không bắt đầu bài mới được nữa.
          </p>
        ) : (
          <Button
            className="mt-5 h-11 w-full text-base text-white"
            style={{ background: meta.color }}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await startAttempt(dailySetId, skill);
                if (result.error) toast.error(result.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Play />}
            Bắt đầu
          </Button>
        )}
      </div>
    </main>
  );
}
