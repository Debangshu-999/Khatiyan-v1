import { OwnerDataListSkeleton } from "@/components/skeletons/owner/shared";

export function OwnerRequestListSkeleton({ rows = 2 }: { rows?: number }) {
  return <OwnerDataListSkeleton actions={1} bodyLines={2} rows={rows} />;
}

export function OwnerEnquiryListSkeleton({ rows = 3 }: { rows?: number }) {
  return <OwnerDataListSkeleton actions={1} bodyLines={2} rows={rows} />;
}
