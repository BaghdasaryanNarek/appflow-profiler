import { Skeleton } from "@/components/ui/skeleton";

export default function TopologyLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>

      <Skeleton className="h-10 w-full rounded-lg" />

      <Skeleton className="h-[calc(100dvh-13rem)] min-h-[640px] w-full rounded-xl" />
    </div>
  );
}
