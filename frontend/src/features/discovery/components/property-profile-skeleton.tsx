import { View } from "react-native";

import { Skeleton } from "@/components/skeleton";
import { spacing } from "@/theme/spacing";

/**
 * The property profile's own shape, while it loads.
 *
 * <p>The generic `SkeletonScreen` drew a card, then a list of rows — a layout
 * this screen does not have anywhere. A placeholder that does not match makes
 * the real content look like it jumped when it arrives, which is the one thing
 * a skeleton exists to prevent. This mirrors the actual order: name and
 * address, the photograph, the enquire button, then the detail grid, the
 * facilities grid, the room types and the stay-preferences grid.
 *
 * <p>Everything is a soft block — no real borders anywhere, even where the
 * finished screen has them. One crisp edge among the blocks reads as a section
 * that has already loaded, which puts two states on screen at once.
 */
export function PropertyProfileSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" }}>
        <Skeleton height={42} radius={999} width={42} />
        <Skeleton height={42} radius={999} width={42} />
      </View>

      <Skeleton height={224} radius={18} />
      <View style={{ flexDirection: "row", gap: 7 }}>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton height={56} key={index} radius={8} width="18.4%" />
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Skeleton height={24} width="24%" />
        <Skeleton height={32} width="72%" />
        <Skeleton height={18} width="94%" />
        <Skeleton height={42} width="100%" />
      </View>

      <GridBlock rows={2} />
      <Skeleton height={86} radius={10} />

      {/* Property details: two columns, three rows. */}
      <GridBlock rows={3} />

      {/* Facilities: a heading and a wrap of chips. */}
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={18} width="34%" />
        <GridBlock rows={2} />
      </View>

      {/* Room types: a card per type, each with its own photo strip. */}
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={18} width="30%" />
        <Skeleton height={150} radius={16} />
        <Skeleton height={150} radius={16} />
      </View>

      {/* Stay preferences. */}
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={18} width="42%" />
        <GridBlock rows={3} />
      </View>
    </View>
  );
}

/**
 * One detail grid, as two columns of pairs.
 *
 * <p>No border. A real hairline made this the only crisp edge on a screen of
 * soft blocks, so the grids read as finished empty tables while everything
 * above them read as loading — two states at once, which is worse than either.
 * The structure comes through from the column split and the row rhythm alone.
 */
function GridBlock({ rows }: { rows: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={{ flexDirection: "row", gap: spacing.lg }}>
          {[0, 1].map((cell) => (
            <View key={cell} style={{ flex: 1, gap: 7 }}>
              <Skeleton height={10} width="52%" />
              <Skeleton height={15} width="78%" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
