import { View } from "react-native";

import { Section } from "@/components/section";
import { Skeleton } from "@/components/skeletons/primitives";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type TenantsCardKind = "donut" | "columns" | "bar";

function TenantsCardSkeleton({ kind }: { kind: TenantsCardKind }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
      <View style={{ minHeight: 24, justifyContent: "center" }}>
        <Skeleton height={14} width="44%" />
      </View>
      {kind === "donut" ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ height: 104, justifyContent: "center", width: 104 }}>
            <Skeleton height={104} radius={52} width={104} />
            <View style={{ backgroundColor: colors.surface, borderRadius: 38, height: 76, left: 14, position: "absolute", top: 14, width: 76 }} />
          </View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            {Array.from({ length: 4 }).map((_, index) => <Skeleton height={10} key={index} width={index % 2 ? "72%" : "90%"} />)}
          </View>
        </View>
      ) : null}
      {kind === "columns" ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={27} width="36%" />
          <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, height: 120, paddingHorizontal: spacing.md }}>
            {[70, 96, 48, 110].map((height, index) => (
              <View key={index} style={{ alignItems: "center", flex: 1, gap: spacing.xs }}>
                <Skeleton height={height} radius={5} width="70%" />
                <Skeleton height={10} width="60%" />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {kind === "bar" ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={27} width="30%" />
          <Skeleton height={14} radius={3} />
          <Skeleton height={10} width="64%" />
        </View>
      ) : null}
    </View>
  );
}

/** Mirrors the Tenants screen's first section, Rooms and beds, to the fold, with no sample values. */
export function OwnerTenantsAnalyticsSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: "center" }}><Skeleton height={12} width="52%" /></View>
      <Section title="Rooms and beds">
        <TenantsCardSkeleton kind="donut" />
        <TenantsCardSkeleton kind="columns" />
        <TenantsCardSkeleton kind="bar" />
      </Section>
    </View>
  );
}
