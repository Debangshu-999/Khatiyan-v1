import { Text, View } from "react-native";

import { Section } from "@/components/section";
import { Skeleton } from "@/components/skeletons/primitives";
import {
  OwnerDigestCardSkeleton,
  OwnerMetricGridSkeleton,
} from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export function OwnerPropertySelectorSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.kicker, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>
        PROPERTY SELECTOR
      </Text>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderCurve: "continuous",
          borderRadius: 18,
          elevation: 2,
          flexDirection: "row",
          gap: spacing.md,
          minHeight: 72,
          padding: spacing.md,
          shadowColor: colors.shadow,
          shadowOffset: { height: 2, width: 0 },
          shadowOpacity: 1,
          shadowRadius: 6,
        }}
      >
        <Skeleton height={42} radius={12} width={42} />
        <View style={{ flex: 1, gap: 5 }}>
          <Skeleton height={9} width="34%" />
          <Skeleton height={18} width="62%" />
          <Skeleton height={9} width="88%" />
        </View>
      </View>
    </View>
  );
}

/** Six shortcut placeholders keep the pinned panel at its full two-row height
 * until Home has measured the carousel width. */
export function OwnerPinnedServicesSkeleton({
  tileHeight,
  tileWidth,
}: {
  tileHeight: number;
  tileWidth: number;
}) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityLabel="Loading pinned services"
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
        height: tileHeight * 2 + spacing.sm,
      }}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <View
          key={index}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            gap: spacing.xs,
            height: tileHeight,
            justifyContent: "center",
            padding: spacing.sm,
            width: tileWidth,
          }}
        >
          <Skeleton height={56} radius={12} width={56} />
          <Skeleton height={10} width="64%" />
        </View>
      ))}
    </View>
  );
}

export function OwnerDashboardDataSkeleton() {
  const { colors, type } = useTheme();

  return (
    <Section title="Analytics">
      <Text style={[type.caption, { color: colors.muted, marginTop: -spacing.xs }]}>
        Tap a section to see its analytics
      </Text>
      {/* The four full-width division rows: icon, name and caption, figure. */}
      <View style={{ gap: spacing.sm }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View
            key={index}
            style={{
              alignItems: "center",
              backgroundColor: colors.surface,
              borderBottomColor: colors.borderStrong,
              borderBottomWidth: 4,
              borderColor: colors.border,
              borderRadius: 16,
              borderWidth: 1,
              flexDirection: "row",
              gap: spacing.md,
              minHeight: 84,
              paddingHorizontal: spacing.md,
            }}
          >
            <Skeleton height={34} radius={8} width={34} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Skeleton height={14} width="42%" />
              <Skeleton height={10} width="70%" />
            </View>
            <Skeleton height={18} width={64} />
          </View>
        ))}
      </View>
    </Section>
  );
}

export function OwnerLiveDigestSkeleton() {
  return (
    <Section title="Live digest">
      <OwnerMetricGridSkeleton count={4} />
      <OwnerDigestCardSkeleton />
      <OwnerDigestCardSkeleton />
      <OwnerDigestCardSkeleton />
    </Section>
  );
}
