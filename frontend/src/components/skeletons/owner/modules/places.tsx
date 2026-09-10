import { OwnerDataListSkeleton } from "@/components/skeletons/owner/shared";

export function OwnerPlacesListSkeleton({ rows = 3 }: { rows?: number }) {
  return <OwnerDataListSkeleton bodyLines={1} rows={rows} />;
}
