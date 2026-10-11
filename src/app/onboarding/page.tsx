import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { ProfileForm } from "@/components/profile-form";
import { getProfile } from "@/lib/auth";
import { safeNextPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Chào mừng" };

// Reads the signed-in profile at request time.
export const instant = false;

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-10">
      <Brand className="text-2xl" />
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6">
        <h1 className="font-heading text-xl font-bold">Chào mừng bạn</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Vài thông tin để nhóm biết bạn là ai và bạn đang nhắm band nào.
        </p>
        <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
          <OnboardingForm searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function OnboardingForm({
  searchParams,
}: Pick<PageProps<"/onboarding">, "searchParams">) {
  const [profile, params] = await Promise.all([getProfile(), searchParams]);
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  if (!profile) redirect("/login");
  if (profile.onboarded_at) redirect(next);

  return <ProfileForm profile={profile} onboarding next={next} />;
}
