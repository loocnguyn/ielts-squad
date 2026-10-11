import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-10">
      <Brand className="text-3xl" />
      <Button asChild size="lg" className="h-11 px-5 text-base">
        <Link href="/login">
          Bắt đầu ôn <ArrowRight />
        </Link>
      </Button>
    </main>
  );
}
