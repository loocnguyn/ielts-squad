"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTest } from "@/app/actions/bank";
import { Button } from "@/components/ui/button";

export function DeleteTestButton({ testId, title }: { testId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Xóa đề ${title}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Xóa đề "${title}" khỏi ngân hàng?`)) return;
        startTransition(async () => {
          const result = await deleteTest(testId);
          if (result.error) toast.error(result.error);
          else toast.success("Đã xóa đề.");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
