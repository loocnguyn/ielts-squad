import Link from "next/link";
import { Suspense } from "react";
import { HeaderNav, MobileNav } from "@/components/app-nav";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/user-menu";

// Signed-in pages show live, per-user data (group progress, attempt clocks), so
// they wait for the request instead of rendering from a prefetched cache. The
// loading.tsx fallbacks still appear at once.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
          <Link href="/groups">
            <Brand />
          </Link>
          {/* usePathname suspends on dynamic routes during prerender. */}
          <Suspense>
            <HeaderNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Suspense fallback={<Skeleton className="size-9 rounded-full" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <Suspense>
        <MobileNav />
      </Suspense>
    </div>
  );
}
