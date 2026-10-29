import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react-native";
import { View } from "react-native";

import { useTheme } from "@/theme/use-theme";

/**
 * An up, down or right chevron on a grey disc: the dropdowns' mark, and every
 * expand/collapse toggle's (user, 2026-10-29). Same disc as SelectField's.
 */
export function ChevronDisc({
  color,
  direction = "down",
  size = 26,
}: {
  color?: string;
  direction?: "down" | "up" | "right";
  size?: number;
}) {
  const { colors } = useTheme();
  const Icon = direction === "up" ? ChevronUp : direction === "right" ? ChevronRight : ChevronDown;
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderRadius: size / 2,
        flexShrink: 0,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Icon color={color ?? colors.muted} size={Math.round(size * 0.62)} strokeWidth={2.2} />
    </View>
  );
}
