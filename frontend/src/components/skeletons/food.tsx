import { ScrollView, View } from "react-native";

import { Card } from "@/components/card";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { Skeleton, SkeletonCard, SkeletonList } from "./primitives";

/** Seven equal weekday cells used by every repeating-menu loading state. */
function FoodDayStripSkeleton({ contained = false, showDates = false }: { contained?: boolean; showDates?: boolean }) {
  if (contained) {
    return (
      <ScrollView contentContainerStyle={{ gap: spacing.sm }} horizontal showsHorizontalScrollIndicator={false} style={{ alignSelf: "stretch" }}>
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton height={showDates ? 64 : 54} key={index} radius={radii.lg} width={112} />
        ))}
      </ScrollView>
    );
  }
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

/** Owner Food overview: tabs, management, four metrics and the cooking forecast preview. */
export function FoodOverviewSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingBottom: spacing.sm }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <View key={index} style={{ alignItems: "center", flex: 1 }}>
            <Skeleton height={14} width="56%" />
          </View>
        ))}
      </View>

      <View style={{ borderColor: colors.borderStrong, borderRadius: radii.card, borderWidth: 1, overflow: "hidden" }}>
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Skeleton height={42} radius={radii.pill} width={42} />
            <View style={{ flex: 1, gap: spacing.xs, justifyContent: "center" }}>
              <Skeleton height={17} width="82%" />
            </View>
            <Skeleton height={25} radius={radii.pill} width={42} />
          </View>
          <View style={{ backgroundColor: colors.neutralSoft, borderRadius: radii.card, gap: spacing.xs, padding: spacing.md }}>
            <Skeleton height={12} width="94%" />
            <Skeleton height={12} width="72%" />
          </View>
          <View style={{ backgroundColor: colors.neutralSoft, borderRadius: radii.card, gap: spacing.sm, padding: spacing.md }}>
            <Skeleton height={13} width="55%" />
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              {[78, 66, 72].map((width) => (
                <Skeleton height={28} key={width} radius={radii.pill} width={width} />
              ))}
            </View>
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, padding: spacing.sm }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Skeleton height={13} width="52%" />
              <Skeleton height={11} width="76%" />
            </View>
            <Skeleton height={28} radius={radii.pill} width={50} />
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View
            key={index}
            style={{
              borderColor: colors.border,
              borderRadius: radii.card,
              borderWidth: 1,
              flexBasis: "47%",
              flexGrow: 1,
              gap: spacing.xs,
              minHeight: 108,
              minWidth: 0,
              padding: spacing.md,
            }}
          >
            <Skeleton height={22} radius={radii.sm} width={22} />
            <Skeleton height={26} width="42%" />
            <Skeleton height={12} width="78%" />
          </View>
        ))}
      </View>

      <Card>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <Skeleton height={18} width={18} />
          <View style={{ flex: 1 }}><Skeleton height={16} width="42%" /></View>
          <Skeleton height={12} width={52} />
        </View>
        <Skeleton height={12} width="34%" />
        {Array.from({ length: 3 }).map((_, index) => (
          <View key={index} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Skeleton height={13} width="58%" />
            <Skeleton height={13} width={54} />
          </View>
        ))}
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.sm }}>
          <Skeleton height={13} width={120} />
        </View>
      </Card>
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
export function FoodMenuSkeleton({ contained = false }: { contained?: boolean } = {}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <FoodDayStripSkeleton contained={contained} />
      <SkeletonList body={2} rows={3} />
    </View>
  );
}

/** Date-specific cooking forecast beneath its compact header. */
export function FoodForecastSkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <FoodDayStripSkeleton contained showDates />
      <Skeleton height={42} radius={radii.sm} />
      <SkeletonList body={1} rows={3} />
    </View>
  );
}

/** Full-width dish rows used while the tenant's menu items load. */
export function FoodTenantMenuRowsSkeleton({ rows = 4 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={{ alignItems: "center", backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, padding: spacing.xs }}>
          <Skeleton height={46} radius={radii.sm} width={46} />
          <View style={{ flex: 1 }}><Skeleton height={14} width="70%" /></View>
          <Skeleton height={12} width={80} />
        </View>
      ))}
    </View>
  );
}

/** Tenant food overview: next meal, plan actions, menu row and preview note. */
export function FoodTenantSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ borderColor: colors.borderStrong, borderRadius: radii.card, borderWidth: 1, gap: spacing.md, padding: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Skeleton height={36} radius={18} width={36} />
          <View style={{ flex: 1 }}><Skeleton height={14} width="72%" /></View>
          <Skeleton height={27} radius={14} width={72} />
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Skeleton height={25} radius={8} width={25} />
          <View style={{ flex: 1 }}><Skeleton height={22} width="74%" /></View>
        </View>
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.sm }}>
          <Skeleton height={14} width={70} />
        </View>
        <FoodTenantMenuRowsSkeleton />
      </View>

      <View style={{ borderColor: colors.borderStrong, borderRadius: radii.card, borderWidth: 1, gap: spacing.md, padding: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Skeleton height={42} radius={21} width={42} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton height={16} width="72%" />
            <Skeleton height={12} width="54%" />
          </View>
          <Skeleton height={25} radius={13} width={64} />
        </View>
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.xs, paddingTop: spacing.sm }}>
          <View style={{ flex: 1 }}><Skeleton height={48} radius={radii.md} /></View>
          <View style={{ flex: 1 }}><Skeleton height={48} radius={radii.md} /></View>
        </View>
      </View>

      <View style={{ alignItems: "center", borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
        <Skeleton height={34} radius={17} width={34} />
        <View style={{ flex: 1 }}><Skeleton height={16} width="48%" /></View>
        <Skeleton height={16} width={18} />
      </View>

      <View style={{ backgroundColor: colors.primarySoft, borderRadius: radii.card, flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
        <Skeleton height={36} radius={18} width={36} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Skeleton height={15} width="55%" />
          <Skeleton height={12} width="96%" />
          <Skeleton height={12} width="78%" />
        </View>
      </View>
    </View>
  );
}

/** Compact rows used inside a profile's subscriber sheet. */
export function FoodSubscribersSkeleton({ rows = 4 }: { rows?: number }) {
  return <SkeletonList rows={rows} />;
}
