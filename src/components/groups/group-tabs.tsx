"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function GroupTabs({ groupId }: { groupId: string }) {
  const pathname = usePathname();
  const base = `/groups/${groupId}`;
  const tabs = [
    { href: base, label: "Hôm nay", active: pathname === base || pathname.startsWith(`${base}/results`) },
    { href: `${base}/speaking`, label: "Buổi nói", active: pathname.startsWith(`${base}/speaking`) },
    { href: `${base}/leaderboard`, label: "Xếp hạng", active: pathname.startsWith(`${base}/leaderboard`) },
    { href: `${base}/members`, label: "Thành viên", active: pathname.startsWith(`${base}/members`) },
  ];

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            tab.active && "border-foreground text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
