import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A stable hue per name so fallback avatars are easy to tell apart.
function hueFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 360;
  return hash;
}

export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9", className)}>
      {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback
        className="font-semibold text-white"
        style={{ background: `oklch(0.55 0.14 ${hueFor(name)})` }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
