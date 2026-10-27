import { useState, type ReactNode } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { CircleAlert, CircleCheck } from "lucide-react-native";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useTheme } from "@/theme/use-theme";

/**
 * Transaction-style selection: a pale blue pill behind the chosen tab and a
 * rounded-top bar under it in a faded black (user, 2026-10-11: "make the fill
 * pale blue instead of grey", then "revert the bottom bar to black but a
 * faded black"). This is one of the few places a pale blue fill is asked for:
 * it marks what is selected.
 *
 * <p>A row that bleeds to the screen's edges keeps its tabs a little in from
 * them, so the pill never touches the edge of the screen (user, 2026-10-11).
 * The rule under the tabs still runs the whole way across. A caller that sets
 * its own {@code horizontalPadding} is left as it asked.
 *
 * <p>With {@code distributed} every tab takes an equal share of the row, and
 * the chosen one's pill and bar fill that whole share, edge to edge (user,
 * 2026-10-11). They used to hug the label, and only looked full width in a
 * browser, where an Svg given "100%" pushes its box out before it is measured.
 * A phone measured the label first, so the same tabs drew a narrow pill there.
 * The share is now the tab's own width on both, and nothing depends on that.
 */
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
  // In from the screen's edge by as much as the tabs are apart, so the row reads evenly spaced.
  const edge = horizontalPadding || (bleed > 0 ? Math.min(bleed, gap) : 0);
  return <View style={{ flexDirection: "row", gap, marginHorizontal: -bleed, paddingHorizontal: edge, paddingTop: topPadding, borderBottomWidth: 1, borderBottomColor: colors.border }}>
    {options.map((option) => {
      const selected = option.value === active;
      const color = selected ? colors.ink : colors.muted;
      // A distributed tab stretches what is in it to its full share. Any other tab is as wide as its label.
      return <AnimatedPressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={distributed ? { alignItems: "stretch", flex: 1, minWidth: 0 } : { alignItems: "center" }}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: compact ? 5 : 15, paddingVertical: 7 }}>
            {/* Mount the selected vector fill rather than changing a native
                view's background, which can lose its corner mask on web. */}
            {selected ? <SelectedFill color={colors.primarySoft} /> : null}
            {option.icon?.(color)}
            <Text adjustsFontSizeToFit={distributed} minimumFontScale={0.8} numberOfLines={1} style={{ color, flexShrink: distributed ? 1 : 0, fontFamily: fonts.sansSemiBold, fontSize: compact ? 12 : 14 }}>{option.label}</Text>
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

/** The pale blue pill behind the selected tab's label, as wide as the label row is now. */
function SelectedFill({ color }: { color: string }) {
  const { onLayout, size } = useBoxSize();
  return <View onLayout={onLayout} pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>
    <Svg width={size?.width ?? "100%"} height={size?.height ?? "100%"}><Rect width={size?.width ?? "100%"} height={size?.height ?? "100%"} rx={10} ry={10} fill={color} /></Svg>
  </View>;
}

/** How strong the bar under the selected tab is drawn: the ink, faded, so it sits under the pill without outweighing it. */
const BAR_OPACITY = 0.6;

/**
 * The rounded-top bar under the selected tab, as wide as the tab is now. The
 * ink at part strength: a faded black on a light screen, and a faded white on
 * a dark one.
 */
function SelectedBar({ color }: { color: string }) {
  const { onLayout, size } = useBoxSize();
  return <View onLayout={onLayout} style={{ height: 4 }}>
    <Svg width={size?.width ?? "100%"} height={4}><Rect x={0} y={0} width={size?.width ?? "100%"} height={8} rx={4} ry={4} fill={color} fillOpacity={BAR_OPACITY} /></Svg>
  </View>;
}
