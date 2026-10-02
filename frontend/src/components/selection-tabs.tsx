import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { CircleAlert, CircleCheck } from "lucide-react-native";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useTheme } from "@/theme/use-theme";

/** Transaction-style selection: grey pill and a rounded-top black indicator. */
export function SelectionTabs<T extends string>({ active, onChange, options, distributed = false, bleed = 0, horizontalPadding = 0, topPadding = 0, gap = 12, compact = false }: {
  active: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; done?: boolean; warning?: boolean; icon?: (color: string) => ReactNode }[];
  compact?: boolean;
  distributed?: boolean;
  bleed?: number;
  horizontalPadding?: number;
  topPadding?: number;
  gap?: number;
}) {
  const { colors, fonts } = useTheme();
  return <View style={{ flexDirection: "row", gap, marginHorizontal: -bleed, paddingHorizontal: horizontalPadding, paddingTop: topPadding, borderBottomWidth: 1, borderBottomColor: colors.border }}>
    {options.map((option) => {
      const selected = option.value === active;
      const color = selected ? colors.ink : colors.muted;
      return <AnimatedPressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={{ alignItems: "center", ...(distributed ? { flex: 1 } : {}) }}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: compact ? 5 : 15, paddingVertical: 7 }}>
            {/* Mount the selected vector fill rather than changing a native
                view's background, which can lose its corner mask on web. */}
            {selected ? <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}><Svg width="100%" height="100%"><Rect width="100%" height="100%" rx={10} ry={10} fill={colors.neutralSoft} /></Svg></View> : null}
            {option.icon?.(color)}
            <Text numberOfLines={1} style={{ color, fontFamily: fonts.sansSemiBold, fontSize: compact ? 12 : 14 }}>{option.label}</Text>
            {option.done ? <CircleCheck color={colors.jade} size={12} strokeWidth={2.6} /> : null}
            {option.warning ? <CircleAlert accessibilityLabel="No room types created" color={colors.warning} size={12} strokeWidth={2.6} /> : null}
          </View>
          <View style={{ height: 4 }}>
            {selected ? <Svg width="100%" height={4}><Rect x={0} y={0} width="100%" height={8} rx={4} ry={4} fill={colors.ink} /></Svg> : null}
          </View>
        </View>
      </AnimatedPressable>;
    })}
  </View>;
}
