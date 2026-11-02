import { View } from "react-native";
import { ArrowRight } from "lucide-react-native";

import { useTheme } from "@/theme/use-theme";

/**
 * The point marker in a modal: a bold black arrow, never a dot (user, 2026-11-01).
 * Pass the line height of the text beside it, so the arrow sits level with the first line.
 */
export function ArrowBullet({ lineHeight }: { lineHeight: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: lineHeight, justifyContent: "center" }}>
      <ArrowRight color={colors.ink} size={16} strokeWidth={3} />
    </View>
  );
}
