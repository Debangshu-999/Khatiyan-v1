import { Text, View } from "react-native";
import { Lightbulb } from "lucide-react-native";

import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A tip: advice worth taking, not a rule or a warning (user, 2026-10-29).
 * Shaped like the notice board, with a lightbulb on a yellow ground.
 */
export function TipBoard({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return (
    <View
      style={{
        alignItems: "flex-start",
        backgroundColor: colors.warningSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <Lightbulb color={colors.warningText} size={16} strokeWidth={2.2} style={{ marginTop: 1 }} />
      <Text style={[type.caption, { color: colors.ink, flex: 1, fontSize: 12.5, lineHeight: 18 }]}>{children}</Text>
    </View>
  );
}
