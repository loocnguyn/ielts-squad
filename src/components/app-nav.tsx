"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, UserRound, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/groups", label: "Nhóm", icon: Users },
  { href: "/bank", label: "Ngân hàng đề", icon: Library },
  { href: "/profile", label: "Hồ sơ", icon: UserRound },
];

function useActiveHref() {
  const pathname = usePathname();
  return LINKS.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))?.href;
}

/** Inline links for the desktop header. */
export function HeaderNav() {
  const active = useActiveHref();
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={active === link.href ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            active === link.href && "bg-secondary text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Bottom tab bar on phones. */
export function MobileNav() {
  const active = useActiveHref();
  return (
    <nav className="sticky bottom-0 z-30 grid grid-cols-3 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={active === link.href ? "page" : undefined}
          className={cn(
            "flex flex-col items-center gap-1 py-2.5 text-xs font-medium text-muted-foreground",
            active === link.href && "text-foreground",
          )}
        >
          <link.icon className="size-5" />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
