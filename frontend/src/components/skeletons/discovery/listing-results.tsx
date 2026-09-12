import { View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The listing results, waiting.
 *
 * <p>Shown for every search, not only the first, and it REPLACES the previous
 * results rather than sitting under them. A search is a new question: leaving
 * the last answer on screen while the next one loads invites reading it as this
 * one, and a list that changes under the reader without ever going blank gives
 * no signal that anything happened.
 *
 * <p>Listing-shaped, down to the row heights, so the page does not grow by
 * three cards the moment the answer lands.
 *
 * @param reasons reserves the strip the AI writes under each card. Only smart
 *                search has one, and a normal search must not leave a gap for
 *                a line that is never coming
 */
export function ListingResultsSkeleton({
  reasons = false,
  rows = 3,
}: {
  reasons?: boolean;
  rows?: number;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {reasons ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            <Skeleton height={26} radius={999} width={84} />
            <Skeleton height={26} radius={999} width={110} />
            <Skeleton height={26} radius={999} width={68} />
          </View>
          <Skeleton height={16} width="58%" />
        </>
      ) : null}

      {Array.from({ length: rows }).map((_, index) => (
        <GhostListing key={index} reason={reasons} />
      ))}
    </View>
  );
}

function GhostListing({ reason }: { reason: boolean }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 10,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
        <Skeleton height={104} radius={10} width={104} />
        <View style={{ flex: 1, gap: spacing.sm, justifyContent: "space-between" }}>
          <Skeleton height={20} width="76%" />
          <Skeleton height={13} width="92%" />
          <Skeleton height={11} width="46%" />
        </View>
      </View>

      <View
        style={{
          borderTopColor: colors.border,
          borderTopWidth: 1,
          flexDirection: "row",
          gap: spacing.lg,
          padding: spacing.md,
        }}
      >
        <View style={{ gap: 6 }}>
          <Skeleton height={12} width={64} />
          <Skeleton height={18} width={82} />
        </View>
        <View style={{ gap: 6 }}>
          <Skeleton height={12} width={56} />
          <Skeleton height={18} width={74} />
        </View>
      </View>

      {reason ? (
        <View
          style={{
            backgroundColor: colors.primarySoft,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            gap: 6,
            padding: spacing.md,
          }}
        >
          <Skeleton height={11} width="94%" />
          <Skeleton height={11} width="62%" />
        </View>
      ) : null}
    </View>
  );
}
