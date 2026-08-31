import { useEffect, useRef } from "react";
import { Animated, Easing, View, type DimensionValue } from "react-native";

import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Calm loading placeholder: a sunken block that breathes (opacity pulse, native
// driver). Compose blocks to sketch the layout that is about to appear — a far
// better wait state than a lone spinner.
export function Skeleton({ height = 14, radius = 8, width = "100%" }: { height?: number; radius?: number; width?: DimensionValue }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 720, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 720, easing: Easing.inOut(Easing.quad), toValue: 0.55, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: radius, height, opacity: pulse, width }} />;
}

// Row-shaped placeholder matching the app's list rows: icon chip + two lines +
// trailing figure, inside the standard bordered card.
export function SkeletonRow() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <Skeleton height={40} radius={12} width={40} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Skeleton height={13} width="62%" />
        <Skeleton height={11} width="38%" />
      </View>
      <Skeleton height={16} width={44} />
    </View>
  );
}

// Stack of row placeholders — the ghost of a list about to load.
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  );
}

// Row of metric-tile placeholders (eyebrow + value), like the snapshot grids.
export function SkeletonTiles({ count = 2 }: { count?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            flex: 1,
            gap: spacing.xs,
            padding: spacing.md,
          }}
        >
          <Skeleton height={10} width="55%" />
          <Skeleton height={20} width="70%" />
          <Skeleton height={9} width="40%" />
        </View>
      ))}
    </View>
  );
}

// Full-page ghost: header card + metric tiles + list rows, composable so each
// screen can sketch its own real layout while it loads.
export function SkeletonScreen({ header = true, tiles = 2, rows = 3 }: { header?: boolean; tiles?: number; rows?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {header ? <SkeletonCard /> : null}
      {tiles > 0 ? <SkeletonTiles count={tiles} /> : null}
      {rows > 0 ? <SkeletonList rows={rows} /> : null}
    </View>
  );
}

// Card-shaped placeholder: an eyebrow line, a wide value line, and a hint line.
export function SkeletonCard() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.lg,
      }}
    >
      <Skeleton height={11} width="30%" />
      <Skeleton height={22} width="55%" />
      <Skeleton height={12} width="72%" />
    </View>
  );
}
