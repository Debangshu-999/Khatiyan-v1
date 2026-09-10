import { OwnerDataCardSkeleton, OwnerDataListSkeleton, OwnerMetricGridSkeleton, OwnerSummaryCardSkeleton } from "@/components/skeletons/owner/shared";

export function OwnerStaffProfileSkeleton() {
  return <OwnerDataCardSkeleton bodyLines={4} />;
}

export function OwnerStaffListSkeleton({ rows = 3 }: { rows?: number }) {
  return <OwnerDataListSkeleton bodyLines={1} rows={rows} />;
}

export function OwnerSalaryAccountSkeleton() {
  return <OwnerSummaryCardSkeleton />;
}

export function OwnerSettlementSkeleton() {
  return <OwnerMetricGridSkeleton columns={3} count={3} />;
}
