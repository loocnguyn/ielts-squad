import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-10">
      <Link href="/">
        <Brand className="text-2xl" />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl shadow-black/10">
        <h1 className="font-heading text-xl font-bold">Vào ôn cùng nhóm</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Đăng nhập kiểu nào cũng được, sau này liên kết lại thành một tài khoản.
        </p>
        {/* The form reads ?next and ?error, which only exist at request time. */}
        <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
