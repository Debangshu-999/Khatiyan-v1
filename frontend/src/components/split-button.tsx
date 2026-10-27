import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { tapHaptic } from "@/lib/haptics";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Half = { label: string; onPress: () => void };

/**
 * Two ways on from the same place, of equal weight, drawn as one button cut in
 * two with a sliver between the halves (user, 2026-10-10).
 *
 * <p>Two whole buttons side by side read as a choice with a preferred answer:
 * the eye takes the first for the main one. One shape split down the middle
 * says they are the same kind of thing, and that either will do.
 *
 * <p>It takes the primary button's fill, height and type from the shared
 * `ActionButton`, so beside one it is the same object. The outer corners are
 * the button's own. The corners along the cut are square, which is what makes
 * it read as a cut.
 *
 * <p>It fills the width it is given, so its parent decides how wide the pair
 * is. It never grows taller than a button.
 */
export function SplitButton({ left, right }: { left: Half; right: Half }) {
  const { colors, fonts } = useTheme();
  const half = (side: Half, edge: "left" | "right") => (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => {
        tapHaptic();
        side.onPress();
      }}
      style={{
        alignItems: "center",
        backgroundColor: colors.primary,
        borderBottomLeftRadius: edge === "left" ? radii.md : 0,
        borderBottomRightRadius: edge === "right" ? radii.md : 0,
        borderCurve: "continuous",
        borderTopLeftRadius: edge === "left" ? radii.md : 0,
        borderTopRightRadius: edge === "right" ? radii.md : 0,
        flex: 1,
        justifyContent: "center",
        minHeight: 48,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      <Text numberOfLines={1} style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 14, textAlign: "center" }}>
        {side.label}
      </Text>
    </AnimatedPressable>
  );
  // A fixed height for the row: the halves share its width, never its spare height.
  return (
    <View style={{ flexDirection: "row", gap: 3, height: 48 }}>
      {half(left, "left")}
      {half(right, "right")}
    </View>
  );
}
