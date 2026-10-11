import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { JoinGroupForm } from "@/components/groups/group-forms";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lời mời vào nhóm" };

type Preview = { id: string; name: string; member_count: number; is_member: boolean };

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  await requireProfile(`/join/${code}`);

  const supabase = await createClient();
  const { data } = await supabase.rpc("group_preview", { p_code: code });
  const preview = (data as Preview[] | null)?.[0];

  if (preview?.is_member) redirect(`/groups/${preview.id}`);

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pt-8">
      {preview ? (
        <section className="rounded-2xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Bạn được mời vào nhóm</p>
          <h1 className="mt-1 font-heading text-2xl font-bold">{preview.name}</h1>
          <p className="mt-2 mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-4" /> {preview.member_count}/10 người
          </p>
          {preview.member_count >= 10 ? (
            <p className="text-sm text-destructive">Nhóm này đã đủ 10 người.</p>
          ) : (
            <JoinGroupForm defaultCode={code} />
          )}
        </section>
      ) : (
        <section className="rounded-2xl border bg-card p-6">
          <h1 className="font-heading text-xl font-bold">Mã mời không đúng</h1>
          <p className="mt-2 mb-5 text-sm text-muted-foreground">
            Mã <span className="font-mono">{code}</span> không khớp nhóm nào. Có thể chủ nhóm
            đã đổi mã, hãy xin link mới.
          </p>
          <Button asChild variant="secondary">
            <Link href="/groups">Về danh sách nhóm</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
