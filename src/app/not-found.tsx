import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <Brand className="text-xl" />
      <h1 className="font-heading text-2xl font-bold">Không tìm thấy trang này</h1>
      <p className="max-w-sm text-muted-foreground">
        Trang không tồn tại, hoặc bạn không ở trong nhóm này.
      </p>
      <Button asChild>
        <Link href="/groups">Về danh sách nhóm</Link>
      </Button>
    </main>
  );
}
