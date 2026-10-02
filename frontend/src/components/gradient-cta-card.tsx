import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { ChevronRight, type LucideProps } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The app's headline call-to-action: a gradient hero that reads as the way IN
 * to somewhere, rather than as one more card in the stack.
 *
 * <p>Home's "Open workspace" is the canonical one. Lifted out of that screen
 * once a second surface wanted the same treatment — the alternative was a
 * second copy, and the two would have drifted the first time either was
 * touched.
 */
export function GradientCtaCard({
  description,
  icon: Icon,
  kicker,
  onPress,
  title,
  light = false,
}: {
  description: string;
  icon: ComponentType<LucideProps>;
  kicker?: string;
  light?: boolean;
  onPress: () => void;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onPress}>
      <LinearGradient
        colors={light ? ["#FFFFFF", "#EAF2FF"] : [colors.primary, colors.primaryDeep]}
        end={{ x: 1, y: light ? 0 : 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          borderCurve: "continuous",
          borderRadius: 20,
          borderWidth: light ? 1 : 0,
          borderColor: colors.borderStrong,
          gap: spacing.sm,
          overflow: "hidden",
          padding: spacing.lg,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: light ? colors.primarySoft : "rgba(255, 255, 255, 0.18)",
              borderCurve: "continuous",
              borderRadius: 14,
              height: 48,
              justifyContent: "center",
              width: 48,
            }}
          >
            <Icon color={light ? colors.primary : colors.onPrimary} size={24} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            {kicker ? <Text style={[type.eyebrow, { color: colors.onPrimary, opacity: 0.82 }]}>
              {kicker}
            </Text> : null}
            <Text style={{ color: light ? colors.ink : colors.onPrimary, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.3 }}>
              {title}
            </Text>
          </View>
          <View
            style={{
              alignItems: "center",
              backgroundColor: "rgba(255, 255, 255, 0.18)",
              borderRadius: 999,
              height: 34,
              justifyContent: "center",
              width: 34,
            }}
          >
            <ChevronRight color={light ? colors.inkSoft : colors.onPrimary} size={19} strokeWidth={2.6} />
          </View>
        </View>
        <Text style={{ color: light ? colors.muted : colors.onPrimary, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, opacity: light ? 1 : 0.85 }}>
          {description}
        </Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}
