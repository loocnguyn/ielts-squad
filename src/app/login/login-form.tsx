"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import type { Provider } from "@supabase/supabase-js";
import {
  DiscordIcon,
  GitHubIcon,
  GoogleIcon,
} from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeNextPath } from "@/lib/paths";
import { createClient } from "@/lib/supabase/client";
import { useEnabledProviders, type OAuthProvider } from "@/lib/supabase/providers";

const PROVIDERS: { id: Provider; label: string; icon: React.ReactNode }[] = [
  { id: "google", label: "Tiếp tục với Google", icon: <GoogleIcon /> },
  { id: "github", label: "Tiếp tục với GitHub", icon: <GitHubIcon /> },
  { id: "discord", label: "Tiếp tục với Discord", icon: <DiscordIcon /> },
];

const URL_ERRORS: Record<string, string> = {
  auth: "Liên kết đăng nhập đã hết hạn hoặc được mở ở trình duyệt khác. Thử đăng nhập lại nhé.",
};

function describeAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Email hoặc mật khẩu không đúng.";
  if (m.includes("email not confirmed"))
    return "Email chưa được xác nhận. Kiểm tra hộp thư của bạn.";
  if (m.includes("already registered"))
    return "Email này đã có tài khoản. Hãy đăng nhập.";
  if (m.includes("rate limit") || m.includes("security purposes"))
    return "Bạn thao tác hơi nhanh. Đợi một phút rồi thử lại.";
  if (m.includes("password should be")) return "Mật khẩu cần ít nhất 8 ký tự.";
  if (m.includes("provider is not enabled"))
    return "Kiểu đăng nhập này chưa được bật trên Supabase.";
  return message;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const urlError = searchParams.get("error");

  // Only providers switched on in Supabase get a button; the rest would dead-end on an error page.
  const enabledProviders = useEnabledProviders();
  const providers = PROVIDERS.filter((provider) =>
    enabledProviders?.includes(provider.id as OAuthProvider),
  );

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A full page load, so nothing a previous account left in the client router survives.
  const enter = () => window.location.assign(next);

  const callbackUrl = (destination: string) =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;

  async function signInWithProvider(provider: Provider) {
    setPending(provider);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) {
      toast.error(describeAuthError(error.message));
      setPending(null);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPending("password");
    setNotice(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
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
    setPending(null);
    if (error) {
      toast.error(describeAuthError(error.message));
    } else if (data.session) {
      enter();
    } else {
      setNotice(
        `Đã gửi email xác nhận tới ${email}. Bấm vào liên kết trong thư để vào app.`,
      );
    }
  }

  async function submitMagicLink(event: FormEvent) {
    event.preventDefault();
    setPending("magic");
    setNotice(null);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(next) },
    });
    setPending(null);
    if (error) toast.error(describeAuthError(error.message));
    else
      setNotice(
        `Đã gửi liên kết đăng nhập tới ${email}. Mở thư trên chính trình duyệt này.`,
      );
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
    <div className="flex flex-col gap-5">
      {urlError && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {URL_ERRORS[urlError] ?? "Đăng nhập không thành công. Thử lại nhé."}
        </p>
      )}

      {providers.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                className="h-10 justify-center gap-2.5"
                disabled={busy}
                onClick={() => signInWithProvider(provider.id)}
              >
                {pending === provider.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  provider.icon
                )}
                {provider.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            hoặc dùng email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <Tabs defaultValue="password" onValueChange={() => setNotice(null)}>
        <TabsList className="w-full">
          <TabsTrigger value="password">Mật khẩu</TabsTrigger>
          <TabsTrigger value="magic">Magic link</TabsTrigger>
        </TabsList>

        <TabsContent value="password">
          <form onSubmit={submitPassword} className="mt-3 flex flex-col gap-3">
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
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-10" disabled={busy}>
              {pending === "password" && <Loader2 className="animate-spin" />}
              {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin"
                ? "Chưa có tài khoản? Đăng ký"
                : "Đã có tài khoản? Đăng nhập"}
            </button>
          </form>
        </TabsContent>

        <TabsContent value="magic">
          <form onSubmit={submitMagicLink} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="magic-email">Email</Label>
              <Input
                id="magic-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-10" disabled={busy}>
              {pending === "magic" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Mail />
              )}
              Gửi liên kết đăng nhập
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {notice && (
        <p
          role="status"
          className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
