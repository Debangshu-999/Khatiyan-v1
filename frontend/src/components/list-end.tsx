import { Text, View } from "react-native";

import { SuccessTick } from "@/components/success-tick";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The foot of an infinite-scroll list once nothing more is coming: a white
 * tick in a filled green circle over a short line (user, 2026-10-02; it was
 * the confetti glyph).
 *
 * <p>Every infinite list ends with this, so they all end the same way. Without
 * a foot the last card just stops, and a finished list can't be told from one
 * that failed to load more.
 */
export function ListEnd({ message = "That's all for now" }: { message?: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm }}>
      <SuccessTick />
      <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>{message}</Text>
    </View>
  );
}
