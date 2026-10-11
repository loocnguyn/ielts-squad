import Link from "next/link";
import { UserRound } from "lucide-react";
import { SignOutItem } from "@/components/sign-out-item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { getProfile, getSessionUser } from "@/lib/auth";

export async function UserMenu() {
  const [user, profile] = await Promise.all([getSessionUser(), getProfile()]);
  if (!user || !profile) return null;
  const name = profile.display_name || user.email || "Bạn";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Tài khoản"
      >
        <UserAvatar name={name} src={profile.avatar_url} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium text-foreground">{name}</span>
          {user.email && <span className="truncate text-xs font-normal">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound /> Hồ sơ & tiến độ
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
