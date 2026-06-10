import { Text, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ActionCardProps = {
  title: string;
  description: string;
  meta?: string;
  onPress?: () => void;
  tone?: "default" | "primary";
};

// Press-target card with a tracked-out kicker, a serif title, and a quiet
// affordance arrow at the corner so it reads as navigable without a noisy
// "Open" button.
export function ActionCard({ description, meta, onPress, title, tone = "default" }: ActionCardProps) {
  const { colors, type } = useTheme();
  const isPrimary = tone === "primary";
  const backgroundColor = isPrimary ? colors.primarySoft : colors.surface;
  const borderColor = isPrimary ? colors.primarySoft : colors.border;
  const titleColor = isPrimary ? colors.primaryDeep : colors.ink;
  const metaColor = isPrimary ? colors.primaryDeep : colors.kicker;
  const arrowColor = isPrimary ? colors.primary : colors.kicker;

  return (
    <AnimatedPressable onPress={onPress}>
      <View
        style={{
          backgroundColor,
          borderColor,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1,
          gap: spacing.sm,
          padding: spacing.lg,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
          {meta ? (
            <Text style={[type.eyebrow, { color: metaColor }]} selectable>
              {meta}
            </Text>
          ) : (
            <View />
          )}
          {onPress ? <ArrowUpRight color={arrowColor} size={18} strokeWidth={2} /> : null}
        </View>

        <Text
          style={[
            type.display,
            { color: titleColor, fontSize: 19, lineHeight: 25 },
          ]}
          selectable
        >
          {title}
        </Text>
        <Text style={[type.body, { color: isPrimary ? colors.inkSoft : colors.muted }]} selectable>
          {description}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
