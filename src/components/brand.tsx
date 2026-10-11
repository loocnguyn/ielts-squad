import { cn } from "@/lib/utils";

/** Four skill-colored dots: the app mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-7 grid-cols-2 gap-1", className)} aria-hidden>
      <span className="rounded-full bg-skill-reading" />
      <span className="rounded-full bg-skill-listening" />
      <span className="rounded-full bg-skill-writing" />
      <span className="rounded-full bg-skill-speaking" />
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-heading font-extrabold tracking-tight", className)}>
      <BrandMark />
      <span>IELTS Squad</span>
    </span>
  );
}
