"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateGroupSettings } from "@/app/actions/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Group } from "@/lib/types";

export function GroupSettingsForm({ group }: { group: Group }) {
  const [state, action, pending] = useActionState(updateGroupSettings, undefined);

  useEffect(() => {
    if (state?.ok) toast.success("Đã lưu cài đặt nhóm.");
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="group_id" value={group.id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-name">Tên nhóm</Label>
        <Input id="settings-name" name="name" required maxLength={60} defaultValue={group.name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-cutoff">Giờ chốt ngày (giờ Việt Nam)</Label>
        <Input
          id="settings-cutoff"
          name="cutoff_time"
          type="time"
          required
          defaultValue={group.cutoff_time.slice(0, 5)}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Áp dụng từ bộ đề ngày mai; bộ đề hôm nay giữ giờ chốt cũ.
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="full_test_sunday"
          defaultChecked={group.full_test_sunday}
          className="mt-0.5 size-4 accent-[var(--skill-reading)]"
        />
        <span>
          Bật Full test Chủ nhật
          <span className="block text-xs text-muted-foreground">
            Thêm bộ đủ 3 passage, 4 part, 2 task cho ai muốn (sẽ có ở bản sau).
          </span>
        </span>
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="h-10 w-fit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Lưu cài đặt
      </Button>
    </form>
  );
}
