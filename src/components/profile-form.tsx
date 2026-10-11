"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BAND_OPTIONS } from "@/lib/bands";
import type { Profile } from "@/lib/types";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Props = {
  profile: Pick<Profile, "display_name" | "current_band" | "target_band" | "exam_date">;
  /** First-run mode: marks onboarding done and redirects to `next`. */
  onboarding?: boolean;
  next?: string;
};

export function ProfileForm({ profile, onboarding = false, next }: Props) {
  const [state, action, pending] = useActionState(saveProfile, undefined);

  useEffect(() => {
    if (state?.ok) toast.success("Đã lưu hồ sơ.");
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      {onboarding && <input type="hidden" name="onboarding" value="1" />}
      {next && <input type="hidden" name="next" value={next} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">Tên hiển thị</Label>
        <Input
          id="display_name"
          name="display_name"
          required
          maxLength={40}
          defaultValue={profile.display_name}
          placeholder="Tên mà cả nhóm sẽ thấy"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current_band">Band hiện tại</Label>
          <select
            id="current_band"
            name="current_band"
            className={selectClass}
            defaultValue={profile.current_band ?? ""}
          >
            <option value="">Chưa biết</option>
            {BAND_OPTIONS.map((band) => (
              <option key={band} value={band}>
                {band.toFixed(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target_band">Band mục tiêu</Label>
          <select
            id="target_band"
            name="target_band"
            className={selectClass}
            defaultValue={profile.target_band}
          >
            {BAND_OPTIONS.map((band) => (
              <option key={band} value={band}>
                {band.toFixed(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exam_date">Ngày thi dự kiến</Label>
        <Input id="exam_date" name="exam_date" type="date" defaultValue={profile.exam_date ?? ""} />
        <p className="text-xs text-muted-foreground">Để trống nếu chưa đăng ký thi.</p>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="h-10" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {onboarding ? "Bắt đầu" : "Lưu hồ sơ"}
      </Button>
    </form>
  );
}
