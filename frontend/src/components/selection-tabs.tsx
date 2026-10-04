import { useState, type ReactNode } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { CircleAlert, CircleCheck } from "lucide-react-native";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useTheme } from "@/theme/use-theme";

/** Transaction-style selection: grey pill and a rounded-top black indicator. */
export function SelectionTabs<T extends string>({ active, onChange, options, distributed = false, bleed = 0, horizontalPadding = 0, topPadding = 0, gap = 12, compact = false }: {
  active: T;
  onChange: (value: T) => void;
  // badge: a count after the label in a blue circle, shown above zero (the Enquiries tabs' "new since seen").
  options: { value: T; label: string; done?: boolean; warning?: boolean; badge?: number; icon?: (color: string) => ReactNode }[];
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
            {selected ? <SelectedFill color={colors.neutralSoft} /> : null}
            {option.icon?.(color)}
            <Text numberOfLines={1} style={{ color, fontFamily: fonts.sansSemiBold, fontSize: compact ? 12 : 14 }}>{option.label}</Text>
            {option.done ? <CircleCheck color={colors.jade} size={12} strokeWidth={2.6} /> : null}
            {option.warning ? <CircleAlert accessibilityLabel="No room types created" color={colors.warning} size={12} strokeWidth={2.6} /> : null}
            {option.badge && option.badge > 0 ? <View style={{ alignItems: "center", backgroundColor: colors.primary, borderRadius: 999, marginLeft: 3, minWidth: 17, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ color: colors.surface, fontSize: 10, fontWeight: "700" }}>{option.badge}</Text></View> : null}
          </View>
          {selected ? <SelectedBar color={colors.ink} /> : <View style={{ height: 4 }} />}
        </View>
      </AnimatedPressable>;
    })}
  </View>;
}

/**
 * The size a box was last laid out at.
 *
 * <p>The two marks below are drawn to it in numbers. Given "100%", an Svg on a
 * phone keeps the width it was first laid out with, so a tab that grows after
 * it mounts (a count arriving beside its label once the data loads) kept a
 * fill too narrow for it, until the tab was switched away from and back, which
 * mounts the Svg afresh. The percentage is still what is drawn before the
 * first layout, so nothing flashes in.
 */
function useBoxSize() {
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);
  function onLayout(event: LayoutChangeEvent) {
    const { height, width } = event.nativeEvent.layout;
    setSize((current) => (current && current.height === height && current.width === width ? current : { height, width }));
  }
  return { onLayout, size };
}

/** The grey pill behind the selected tab's label, as wide as the label row is now. */
function SelectedFill({ color }: { color: string }) {
  const { onLayout, size } = useBoxSize();
  return <View onLayout={onLayout} pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>
    <Svg width={size?.width ?? "100%"} height={size?.height ?? "100%"}><Rect width={size?.width ?? "100%"} height={size?.height ?? "100%"} rx={10} ry={10} fill={color} /></Svg>
  </View>;
}

/** The rounded-top black bar under the selected tab, as wide as the tab is now. */
function SelectedBar({ color }: { color: string }) {
  const { onLayout, size } = useBoxSize();
  return <View onLayout={onLayout} style={{ height: 4 }}>
    <Svg width={size?.width ?? "100%"} height={4}><Rect x={0} y={0} width={size?.width ?? "100%"} height={8} rx={4} ry={4} fill={color} /></Svg>
  </View>;
}
