import { Text, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ActionCardProps = {
  title: string;
  description: string;
  meta?: string;
  // When > 0, renders a red attention badge with the count next to the arrow.
  badge?: number;
  onPress?: () => void;
  tone?: "default" | "primary";
};

// Press-target card with a tracked-out kicker, a serif title, and a quiet
// affordance arrow at the corner so it reads as navigable without a noisy
// "Open" button.
export function ActionCard({ badge, description, meta, onPress, title, tone = "default" }: ActionCardProps) {
  const { colors, fonts, type } = useTheme();
  const badgeLabel = badge != null && badge > 0 ? (badge > 99 ? "99+" : String(badge)) : null;
  const isPrimary = tone === "primary";
  const backgroundColor = isPrimary ? colors.accentSoft : colors.surface;
  const borderColor = isPrimary ? colors.accent : colors.borderStrong;
  const titleColor = colors.ink;
  const metaColor = isPrimary ? colors.accent : colors.kicker;
  const arrowColor = isPrimary ? colors.accent : colors.kicker;

  return (
    <AnimatedPressable onPress={onPress}>
      <View
        style={{
          backgroundColor,
          borderColor,
          borderCurve: "continuous",
          borderRadius: 20,
          borderWidth: 1,
          gap: spacing.sm,
          padding: spacing.lg,
        }}
      >
        {meta ? (
          <Text style={[type.eyebrow, { color: metaColor }]} selectable>
            {meta}
          </Text>
        ) : null}

        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
          <Text
            style={[
              type.display,
              { color: titleColor, flex: 1, fontSize: 19, lineHeight: 25 },
            ]}
            selectable
          >
            {title}
          </Text>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: 3 }}>
            {badgeLabel ? (
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.danger,
                  borderRadius: 999,
                  justifyContent: "center",
                  minWidth: 20,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                }}
              >
                <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 11, fontWeight: "800" }} selectable={false}>
                  {badgeLabel}
                </Text>
              </View>
            ) : null}
            {onPress ? <ArrowUpRight color={arrowColor} size={18} strokeWidth={2} /> : null}
          </View>
        </View>

        <Text style={[type.body, { color: isPrimary ? colors.inkSoft : colors.muted }]} selectable>
          {description}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
