import { Skeleton } from "@/components/ui/skeleton";

// A boundary below the group layout, so switching between the group's tabs
// shows this at once instead of waiting on the next page's data.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Đang tải">
      <Skeleton className="h-6 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}
