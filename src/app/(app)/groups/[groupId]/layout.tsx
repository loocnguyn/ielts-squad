import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GroupTabs } from "@/components/groups/group-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { requireProfile } from "@/lib/auth";
import { getGroup } from "@/lib/data/groups";

export default function GroupLayout({ children, params }: LayoutProps<"/groups/[groupId]">) {
  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<Skeleton className="h-20 w-full rounded-xl" />}>
        <GroupHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function GroupHeader({ params }: Pick<LayoutProps<"/groups/[groupId]">, "params">) {
  const { groupId } = await params;
  await requireProfile(`/groups/${groupId}`);
  const group = await getGroup(groupId);
  if (!group) notFound();

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-2xl font-bold">{group.name}</h1>
      <GroupTabs groupId={group.id} />
    </div>
  );
}
