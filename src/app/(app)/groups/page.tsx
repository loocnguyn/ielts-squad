import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Clock, Crown, Users } from "lucide-react";
import { CreateGroupForm, JoinGroupForm } from "@/components/groups/group-forms";
import { Badge } from "@/components/ui/badge";
import { requireProfile } from "@/lib/auth";
import { getMyGroups } from "@/lib/data/groups";

export const metadata: Metadata = { title: "Nhóm của bạn" };

export default async function GroupsPage() {
  const profile = await requireProfile("/groups");
  const groups = await getMyGroups(profile.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-bold">Chào {profile.display_name}</h1>
        <p className="mt-1 text-muted-foreground">
          {groups.length === 0
            ? "Bạn chưa ở nhóm nào. Tạo nhóm mới hoặc nhập mã mời từ bạn bè."
            : "Chọn nhóm để xem bộ đề hôm nay."}
        </p>
      </div>

      {groups.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="group flex items-center gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-heading text-lg font-bold">{group.name}</h2>
                    {group.role === "owner" && (
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <Crown className="size-3 text-streak" /> Chủ nhóm
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4" /> {group.member_count}/10 người
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-4" /> Chốt {group.cutoff_time.slice(0, 5)}
                    </span>
                  </p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-heading font-bold">Tạo nhóm mới</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Bạn sẽ là chủ nhóm và nhận link mời để gửi cho bạn bè.
          </p>
          <CreateGroupForm />
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-heading font-bold">Vào nhóm bằng mã</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Nhập mã 6 ký tự mà chủ nhóm gửi cho bạn.
          </p>
          <JoinGroupForm />
        </section>
      </div>
    </div>
  );
}
