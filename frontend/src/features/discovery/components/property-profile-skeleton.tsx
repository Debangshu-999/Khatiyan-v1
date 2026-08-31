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
      {/* Back button, then the name and its address line. */}
      <Skeleton height={32} radius={999} width={32} />
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={28} width="72%" />
        <Skeleton height={16} width="90%" />
      </View>

      {/* The photograph — the tallest thing on the screen by a long way, and
          the reason an inch-high placeholder felt so wrong. */}
      <Skeleton height={260} radius={16} />

      {/* Enquire. */}
      <Skeleton height={50} radius={14} />

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
