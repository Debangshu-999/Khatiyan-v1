import { PropsWithChildren } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A button pinned to the bottom of a scrolling screen.
 *
 * <p>It <b>overlays</b> the scroll area rather than sitting below it in flow.
 * The older pattern — a solid bar with a top border, stacked under the
 * ScrollView — cut the screen short: content stopped dead at the bar, and the
 * bar read as a wall rather than as something floating above the page.
 *
 * <p>Here the backdrop is a gradient from fully transparent at the top to the
 * page colour at the bottom, so content scrolls underneath and dissolves as it
 * approaches the button instead of disappearing behind a hard edge. No border:
 * the fade is the edge.
 *
 * <p>The scroll view behind it needs bottom padding of roughly
 * {@link PINNED_FOOTER_CLEARANCE} so its last item can still be scrolled clear
 * of the button.
 */
export function PinnedFooter({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        bottom: 0,
        left: 0,
        position: "absolute",
        right: 0,
        // Sum, not max. The inset clears the system bar; the gap is the breathing
        // room below the button. Taking the larger of the two let a tall inset
        // swallow the gap entirely, so on an Android three-button navigation bar
        // the button sat flush against it. Where there is no inset this is still
        // just the gap, so nothing changes on iOS gesture bars or the web.
        //
        // The gap is xl rather than md: at md the button read as touching the
        // bottom edge on devices with no inset at all, which is where the whole
        // floating effect falls apart.
        paddingBottom: insets.bottom + spacing.xl,
        // Top padding is the runway the dim needs to build over. Too little and
        // the gradient reads as a line rather than a fade.
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xxxl,
      }}
    >
      {/* Two veils, not one. A single ramp can only do one of these: fading
          toward the page colour washes content pale, and a dark ramp darkens it
          — opposite directions. Stacked, they do both, which is what "recedes
          into the button" actually looks like: contrast drains AND the area
          sinks. Neither reaches full opacity, so content stays visible the whole
          way down rather than hitting a wall.

          Both start transparent at the top edge and build downward, so the
          effect begins above the button rather than at it. */}
      <LinearGradient
        colors={[
          withAlpha(colors.background, 0),
          withAlpha(colors.background, 0.45),
          withAlpha(colors.background, 0.72),
        ]}
        locations={[0, 0.45, 1]}
        pointerEvents="none"
        style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
      />
      <LinearGradient
        colors={[DIM_TRANSPARENT, withAlpha(DIM, 0.08), withAlpha(DIM, 0.26)]}
        locations={[0, 0.42, 1]}
        pointerEvents="none"
        style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
      />
      {children}
    </View>
  );
}

/** A fixed slate, not a theme colour: this layer must always darken. */
const DIM = "#0F172A";
const DIM_TRANSPARENT = "rgba(15, 23, 42, 0)";

/**
 * `#RRGGBB` to `rgba(...)`. The theme stores opaque hex, but the gradient needs
 * an alpha ramp of the SAME colour — mixing in a different one tints the fade.
 */
function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return hex;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Bottom padding a scroll view needs so its last item clears a PinnedFooter. */
export const PINNED_FOOTER_CLEARANCE = 132;
