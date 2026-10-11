"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNextPath } from "@/lib/paths";
import { createClient } from "@/lib/supabase/client";

const URL_ERRORS: Record<string, string> = {
  // Opening the confirmation link in another browser still confirms the email;
  // only the automatic sign-in fails, so point people at the password form.
  auth: "Liên kết đã hết hạn hoặc được mở ở trình duyệt khác. Nếu bạn vừa xác nhận email, hãy đăng nhập bằng mật khẩu ở dưới.",
};

function describeAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email hoặc mật khẩu không đúng.";
  if (m.includes("email not confirmed")) return "Email chưa được xác nhận. Kiểm tra hộp thư của bạn.";
  if (m.includes("already registered")) return "Email này đã có tài khoản. Hãy đăng nhập.";
  if (m.includes("rate limit") || m.includes("security purposes"))
    return "Bạn thao tác hơi nhanh. Đợi một phút rồi thử lại.";
  if (m.includes("password should be")) return "Mật khẩu cần ít nhất 8 ký tự.";
  return message;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const urlError = searchParams.get("error");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"submit" | "reset" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A full page load, so nothing a previous account left in the client router survives.
  const enter = () => window.location.assign(next);

  const callbackUrl = (destination: string) =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending("submit");
    setNotice(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(describeAuthError(error.message));
        setPending(null);
        return;
      }
      enter();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl(next) },
    });
    if (error) {
      setPending(null);
      toast.error(describeAuthError(error.message));
    } else if (data.session) {
      enter();
    } else {
      setPending(null);
      setNotice(`Đã gửi email xác nhận tới ${email}. Bấm vào liên kết trong thư để vào app.`);
    }
  }

  async function sendPasswordReset() {
    if (!email) {
      toast.error("Nhập email trước, rồi bấm lại Quên mật khẩu.");
      return;
    }
    setPending("reset");
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl("/auth/reset-password"),
    });
    setPending(null);
    if (error) toast.error(describeAuthError(error.message));
    else setNotice(`Đã gửi liên kết đặt lại mật khẩu tới ${email}.`);
  }

  const busy = pending !== null;

  return (
    <div className="flex flex-col gap-4">
      {urlError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {URL_ERRORS[urlError] ?? "Đăng nhập không thành công. Thử lại nhé."}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mật khẩu</Label>
            {mode === "signin" && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                disabled={busy}
                onClick={sendPasswordReset}
              >
                Quên mật khẩu?
              </button>
            )}
          </div>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && <p className="text-xs text-muted-foreground">Ít nhất 8 ký tự.</p>}
        </div>
        <Button type="submit" className="h-10" disabled={busy}>
          {pending === "submit" && <Loader2 className="animate-spin" />}
          {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setNotice(null);
          }}
        >
          {mode === "signin" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </form>

      {notice && (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}
    </div>
  );
}
