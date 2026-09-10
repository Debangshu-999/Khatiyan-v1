import { View } from "react-native";

import { Card } from "@/components/card";
import { Skeleton } from "@/components/skeletons/primitives";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Loading shapes used by owner workspaces.
 *
 * These deliberately contain no headings, filters or actions. Those parts of a
 * screen are local and immediately available; only values and rows supplied by
 * the API should shimmer.
 */

export function OwnerMetricGridSkeleton({
  columns = 2,
  count = 4,
  square = false,
}: {
  columns?: number;
  count?: number;
  square?: boolean;
}) {
  const rows = Array.from({ length: Math.ceil(count / columns) });

  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((_, rowIndex) => {
        const cells = Math.min(columns, count - rowIndex * columns);
        return (
          <View key={rowIndex} style={{ flexDirection: "row", gap: spacing.sm }}>
            {Array.from({ length: cells }).map((__, cellIndex) => (
              <OwnerMetricTileSkeleton key={cellIndex} square={square} />
            ))}
            {Array.from({ length: columns - cells }).map((__, cellIndex) => (
              <View key={`spacer-${cellIndex}`} style={{ flex: 1 }} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function OwnerMetricTileSkeleton({ square = false }: { square?: boolean }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        alignItems: square ? "center" : "stretch",
        aspectRatio: square ? 1 : undefined,
        backgroundColor: colors.surface,
        borderBottomColor: colors.borderStrong,
        borderBottomWidth: square ? 4 : 1,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: square ? 16 : 12,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        justifyContent: "center",
        minHeight: square ? 102 : 100,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    >
      {square ? (
        <View style={{ alignItems: "center", gap: spacing.xs, width: "100%" }}>
          <Skeleton height={24} radius={8} width={24} />
          <Skeleton height={18} width="58%" />
          <Skeleton height={10} width="46%" />
        </View>
      ) : (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
            <Skeleton height={38} radius={11} width={38} />
          </View>
          <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
            <Skeleton height={10} width="64%" />
            <Skeleton height={19} width="48%" />
            <Skeleton height={9} width="76%" />
          </View>
        </View>
      )}
    </View>
  );
}

/** One raised API record, matching owner queue, notice and person cards. */
export function OwnerDataCardSkeleton({
  actions = 0,
  bodyLines = 0,
}: {
  actions?: number;
  bodyLines?: number;
}) {
  const widths = ["96%", "84%", "62%"] as const;

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <Skeleton height={44} radius={14} width={44} />
        <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <Skeleton height={11} width="42%" />
          <Skeleton height={18} width="72%" />
          <Skeleton height={10} width="56%" />
        </View>
        <Skeleton height={22} radius={999} width={58} />
      </View>

      {bodyLines > 0 ? (
        <View style={{ gap: 7 }}>
          {Array.from({ length: bodyLines }).map((_, index) => (
            <Skeleton height={11} key={index} width={widths[index % widths.length]} />
          ))}
        </View>
      ) : null}

      {actions > 0 ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" }}>
          {Array.from({ length: actions }).map((_, index) => (
            <Skeleton height={42} key={index} radius={12} width={actions === 1 ? "42%" : "34%"} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function OwnerDataListSkeleton({
  actions = 0,
  bodyLines = 0,
  rows = 3,
}: {
  actions?: number;
  bodyLines?: number;
  rows?: number;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, index) => (
        <OwnerDataCardSkeleton actions={actions} bodyLines={bodyLines} key={index} />
      ))}
    </View>
  );
}

/** A single outer card containing touching rows, used by boards and ledgers. */
export function OwnerInsetListSkeleton({ header = true, rows = 3 }: { header?: boolean; rows?: number }) {
  const { colors } = useTheme();

  return (
    <Card>
      {header ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <Skeleton height={42} radius={999} width={42} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={18} width="56%" />
            <Skeleton height={10} width="28%" />
          </View>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: rows }).map((_, index) => (
          <View
            key={index}
            style={{
              borderBottomColor: colors.border,
              borderBottomWidth: index === rows - 1 ? 0 : 1,
              gap: 6,
              justifyContent: "center",
              minHeight: 68,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton height={15} width={index % 2 ? "48%" : "62%"} />
                <Skeleton height={10} width={index % 2 ? "72%" : "84%"} />
              </View>
              <Skeleton height={18} radius={6} width={18} />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Headline figure, supporting lines and an optional progress track. */
export function OwnerSummaryCardSkeleton({ progress = true }: { progress?: boolean }) {
  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Skeleton height={11} width="38%" />
          <Skeleton height={30} width="58%" />
          <Skeleton height={10} width="74%" />
        </View>
        <Skeleton height={25} radius={999} width={82} />
      </View>
      {progress ? <Skeleton height={8} radius={999} width="100%" /> : null}
    </Card>
  );
}

/** A titled digest card with the three small figures used on owner Home. */
export function OwnerDigestCardSkeleton() {
  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <Skeleton height={30} radius={9} width={30} />
        <Skeleton height={19} width="48%" />
        <View style={{ flex: 1 }} />
        <Skeleton height={18} radius={6} width={18} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <View key={index} style={{ borderRadius: radii.card, flex: 1, gap: 5, minWidth: 0, padding: spacing.sm }}>
            <Skeleton height={9} width="70%" />
            <Skeleton height={17} width="58%" />
            <Skeleton height={9} width="82%" />
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Label-and-input placeholders for API-seeded owner forms. */
export function OwnerFormSkeleton({ fields = 4, media = false }: { fields?: number; media?: boolean }) {
  return (
    <Card>
      {media ? <Skeleton height={154} radius={14} width="100%" /> : null}
      {Array.from({ length: fields }).map((_, index) => (
        <View key={index} style={{ gap: spacing.xs }}>
          <Skeleton height={10} width={index % 2 ? "31%" : "42%"} />
          <Skeleton height={48} radius={12} width="100%" />
        </View>
      ))}
    </Card>
  );
}
