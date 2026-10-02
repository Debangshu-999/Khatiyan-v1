import { Check } from "lucide-react-native";
import { View } from "react-native";

import { useTheme } from "@/theme/use-theme";

/**
 * A white tick in a filled green circle: the app's "done" or "chosen" mark
 * (2026-10-02). Ends infinite lists and marks the chosen option in a picker.
 */
export function SuccessTick({ size = 22 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.jade,
        borderRadius: size / 2,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Check color="#FFFFFF" size={Math.round(size * 0.64)} strokeWidth={3} />
    </View>
  );
}
