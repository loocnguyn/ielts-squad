"use client";

import { useState, useTransition } from "react";
import { Check, ClipboardCopy, ClipboardPaste, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveClaudeGrade } from "@/app/actions/grades";
import { Button } from "@/components/ui/button";
import { parseClaudeGrade } from "@/lib/tests/grading";

type Props = {
  attemptId: string;
  skill: "writing" | "speaking";
  /** The full grading package: rubric, task, the answer and the JSON schema. */
  prompt: string;
  hasGrade: boolean;
};

/** The copy-paste loop with Claude Pro: copy the package out, paste the JSON back. */
export function ClaudeGradePanel({ attemptId, skill, prompt, hasGrade }: Props) {
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, startSaving] = useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Trình duyệt không cho copy. Mở phần xem gói chấm bên dưới rồi copy tay.");
    }
  }

  function save() {
    // Checked here for an instant answer, and again on the server before saving.
    const local = parseClaudeGrade(pasted, { attemptId, skill });
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }
    startSaving(async () => {
      const result = await saveClaudeGrade(attemptId, skill, pasted);
      if (result.errors) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      setPasted("");
      toast.success("Đã lưu điểm từ Claude. Cả nhóm xem được rồi.");
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div>
        <h3 className="font-heading font-bold">{hasGrade ? "Chấm lại bằng Claude Pro" : "Chấm bằng Claude Pro"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Không tốn tiền API: copy gói chấm, dán vào claude.ai, rồi dán khối JSON Claude trả về vào đây.
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        <li className="flex flex-col gap-2">
          <p className="text-sm font-semibold">1. Copy gói chấm và dán vào claude.ai</p>
          <Button type="button" className="h-10 w-fit" onClick={copy}>
            {copied ? <Check /> : <ClipboardCopy />}
            {copied ? "Đã copy" : "Copy cho Claude"}
          </Button>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Xem gói chấm</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
              {prompt}
            </pre>
          </details>
        </li>
        <li className="flex flex-col gap-2">
          <p className="text-sm font-semibold">2. Dán kết quả</p>
          <textarea
            aria-label="JSON điểm do Claude trả về"
            className="min-h-28 rounded-lg border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder='{ "attempt_id": "...", "overall_band": 7.5, ... }'
            spellCheck={false}
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              setErrors([]);
            }}
          />
          {errors.length > 0 && (
            <ul role="alert" className="flex flex-col gap-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          )}
          <Button type="button" variant="secondary" className="h-10 w-fit" disabled={!pasted.trim() || saving} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : <ClipboardPaste />}
            Lưu điểm
          </Button>
        </li>
      </ol>
    </section>
  );
}
