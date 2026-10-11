import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-10">
      <Brand className="text-2xl" />
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6">
        <h1 className="font-heading text-xl font-bold">Đặt mật khẩu mới</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">Ít nhất 8 ký tự.</p>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
