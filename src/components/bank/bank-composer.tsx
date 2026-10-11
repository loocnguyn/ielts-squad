"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ClipboardCopy, FileJson, Loader2, PackagePlus, Save } from "lucide-react";
import { toast } from "sonner";
import { importTests } from "@/app/actions/bank";
import { TestPreview } from "@/components/tests/test-preview";
import { Button } from "@/components/ui/button";
import { SKILLS, SKILL_META } from "@/lib/skills";
import { parseImport, type ImportableTest } from "@/lib/tests/import-schema";
import { buildAuthoringPrompt } from "@/lib/tests/prompts";
import type { Skill } from "@/lib/types";
import { cn } from "@/lib/utils";

const PARTS: Partial<Record<Skill, { value: string; label: string }[]>> = {
  writing: [
    { value: "task1", label: "Task 1 (biểu đồ)" },
    { value: "task2", label: "Task 2 (nghị luận)" },
  ],
  speaking: [
    { value: "part1", label: "Part 1" },
    { value: "part2", label: "Part 2 (cue card)" },
    { value: "part3", label: "Part 3" },
  ],
};

const chip = "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:border-ring";
const chipOn = "border-foreground bg-secondary";

export function BankComposer({ existingTitles }: { existingTitles: Record<Skill, string[]> }) {
  const [skill, setSkill] = useState<Skill>("reading");
  const [part, setPart] = useState<string | undefined>(undefined);
  const [count, setCount] = useState(7);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportableTest[] | null>(null);
  const [saving, startSaving] = useTransition();

  const parts = PARTS[skill];
  const activePart = parts ? (part ?? parts[0].value) : undefined;
  const prompt = useMemo(
    () => buildAuthoringPrompt({ skill, part: activePart, count, avoidTitles: existingTitles[skill] }),
    [skill, activePart, count, existingTitles],
  );

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Trình duyệt không cho copy. Mở phần xem prompt bên dưới rồi copy tay.");
    }
  }

  function check(text: string) {
    const result = parseImport(text);
    if (result.ok) {
      setErrors([]);
      setPreview(result.tests);
    } else {
      setErrors(result.errors);
      setPreview(null);
    }
  }

  async function loadStarter() {
    const starter = await import("@/content/starter-tests.json");
    const text = JSON.stringify(starter.default, null, 2);
    setPasted(text);
    check(text);
  }

  function save() {
    startSaving(async () => {
      const result = await importTests(pasted);
      if (result.errors?.length) {
        setErrors(result.errors);
        setPreview(null);
        if (result.imported) toast.warning(`Mới lưu được ${result.imported} đề.`);
        return;
      }
      toast.success(`Đã lưu ${result.imported} đề vào ngân hàng.`);
      setPasted("");
      setPreview(null);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-heading font-bold">1. Lấy prompt soạn đề</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn loại đề, copy prompt rồi dán vào claude.ai. Nên soạn cả lô 7 đề cho một tuần.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {SKILLS.map((s) => {
            const Icon = SKILL_META[s].icon;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={skill === s}
                className={cn(chip, "inline-flex items-center gap-1.5", skill === s && chipOn)}
                onClick={() => {
                  setSkill(s);
                  setPart(undefined);
                }}
              >
                <Icon className={cn("size-4", SKILL_META[s].text)} />
                {SKILL_META[s].label}
              </button>
            );
          })}
        </div>

        {parts && (
          <div className="flex flex-wrap gap-2">
            {parts.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={activePart === p.value}
                className={cn(chip, activePart === p.value && chipOn)}
                onClick={() => setPart(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center gap-3 text-sm">
          Số đề mỗi lần
          <select
            className="h-8 rounded-md border border-input bg-background px-2"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[1, 2, 3, 5, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <Button type="button" className="h-10 w-fit" onClick={copyPrompt}>
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? "Đã copy" : "Copy cho Claude"}
        </Button>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Xem prompt</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
            {prompt}
          </pre>
        </details>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-heading font-bold">2. Dán kết quả</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dán khối JSON Claude trả về. App kiểm tra đủ số câu, có đáp án và đáp án nằm trong bài
            rồi mới lưu.
          </p>
        </div>

        <textarea
          aria-label="JSON đề do Claude trả về"
          className="min-h-40 rounded-lg border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder='{ "tests": [ ... ] }'
          spellCheck={false}
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value);
            setPreview(null);
            setErrors([]);
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!pasted.trim()} onClick={() => check(pasted)}>
            <FileJson /> Kiểm tra
          </Button>
          <Button type="button" disabled={!preview || saving} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {preview ? `Lưu ${preview.length} đề` : "Lưu vào ngân hàng"}
          </Button>
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={loadStarter}>
            <PackagePlus /> Dùng bộ đề mẫu
          </Button>
        </div>

        {errors.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        )}

        {preview && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-success">
              Hợp lệ: {preview.length} đề. Bấm vào từng đề để xem trước.
            </p>
            {preview.map((test, i) => (
              <details key={i} className="rounded-lg border bg-background">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <span className={cn("size-2 shrink-0 rounded-full", SKILL_META[test.skill].bg)} />
                  <span className="font-medium">{test.title}</span>
                  <span className="text-muted-foreground">
                    {SKILL_META[test.skill].label} · {test.part} · {Math.round(test.duration_sec / 60)} phút
                  </span>
                </summary>
                <div className="border-t p-4">
                  <TestPreview skill={test.skill} content={test.content} answerKey={test.answer_key} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
