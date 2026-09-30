import { PartyPopper } from "lucide-react-native";
import { Text, View } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The foot of an infinite-scroll list once nothing more is coming: the confetti
 * glyph over a short line, with no fill behind the glyph (user, 2026-09-30).
 *
 * <p>Every infinite list ends with this, so they all end the same way. Without
 * a foot the last card just stops, and a finished list can't be told from one
 * that failed to load more.
 */
export function ListEnd({ message = "That's all for now" }: { message?: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm }}>
      <PartyPopper color={colors.primary} size={20} strokeWidth={2} />
      <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>{message}</Text>
    </View>
  );
}
