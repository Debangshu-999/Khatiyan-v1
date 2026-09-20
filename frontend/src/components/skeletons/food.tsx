import { View } from "react-native";

import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { Skeleton, SkeletonCard, SkeletonList, SkeletonTiles } from "./primitives";

/** Seven equal weekday cells used by every repeating-menu loading state. */
function FoodDayStripSkeleton() {
  return (
    <View style={{ flexDirection: "row", gap: spacing.xxs }}>
      {Array.from({ length: 7 }).map((_, index) => (
        <View key={index} style={{ flex: 1 }}>
          <Skeleton height={42} radius={radii.sm} />
        </View>
      ))}
    </View>
  );
}

/** Owner Food overview: management card, four metrics and meal summaries. */
export function FoodOverviewSkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <SkeletonCard />
      <SkeletonTiles count={4} />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

/** Catalogue rows reserve the same large image and full-width action bar. */
export function FoodItemsSkeleton({ rows = 3 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Skeleton height={44} radius={radii.md} />
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={{ borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, gap: spacing.sm, padding: spacing.sm }}
        >
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Skeleton height={86} radius={radii.sm} width={86} />
            <View style={{ flex: 1, gap: spacing.sm, justifyContent: "center" }}>
              <Skeleton height={16} width="68%" />
              <Skeleton height={12} width="92%" />
              <Skeleton height={12} width="48%" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Skeleton height={40} radius={radii.md} /></View>
            <View style={{ flex: 1 }}><Skeleton height={40} radius={radii.md} /></View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Food-profile list, including its explanatory card and card actions. */
export function FoodProfilesSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SkeletonCard />
      <SkeletonList action body={1} rows={rows} />
    </View>
  );
}

/** Repeating weekly menu: weekday strip and one card for each meal. */
export function FoodMenuSkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <FoodDayStripSkeleton />
      <SkeletonList body={2} rows={3} />
    </View>
  );
}

/** Date-specific cooking forecast beneath its compact header. */
export function FoodForecastSkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <FoodDayStripSkeleton />
      <Skeleton height={42} radius={radii.sm} />
      <SkeletonList body={1} rows={3} />
    </View>
  );
}

/** Tenant profile chooser/current subscription loading state. */
export function FoodTenantSkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <SkeletonCard />
      <SkeletonList action body={1} rows={2} />
    </View>
  );
}

/** Compact rows used inside a profile's subscriber sheet. */
export function FoodSubscribersSkeleton({ rows = 4 }: { rows?: number }) {
  return <SkeletonList rows={rows} />;
}
