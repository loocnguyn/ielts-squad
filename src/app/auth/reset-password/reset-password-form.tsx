"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setPending(false);
      toast.error(
        error.message.toLowerCase().includes("session")
          ? "Liên kết đã hết hạn. Hãy yêu cầu đặt lại mật khẩu lần nữa."
          : error.message,
      );
      return;
    }
    toast.success("Đã đổi mật khẩu.");
    router.replace("/groups");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Mật khẩu mới</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="h-10" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Lưu mật khẩu
      </Button>
    </form>
  );
}
