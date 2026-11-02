import { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COMPACT_SCREEN_HEADERS } from "@/components/compact-screen-header";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A button pinned to the bottom of a scrolling screen.
 *
 * <p>It <b>overlays</b> the scroll area rather than sitting below it in flow, so
 * content scrolls underneath it right to the bottom of the screen.
 *
 * <p><b>Separated by a line</b> (user, 2026-11-01): see {@link pinnedFooterEdge}.
 * An opaque strip in the page's own colour, with the same gap under the button as
 * the Property filters page.
 *
 * <p>The scroll view behind it needs bottom padding of roughly
 * {@link PINNED_FOOTER_CLEARANCE} so its last item can still be scrolled clear
 * of the button.
 */
/**
 * The line around any fixed bottom bar: slightly bold, and the same thickness
 * round the curves and down the sides, so the bar reads as a raised sheet (user,
 * 2026-11-01). A top border alone thins to nothing along the curve. A bar that is
 * not a PinnedFooter spreads this too, so they stay one line.
 */
export function pinnedFooterEdge(colors: { borderStrong: string }) {
  return {
    borderColor: colors.borderStrong,
    borderCurve: "continuous",
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1.5,
  } as const;
}

export function PinnedFooter({
  children,
  onLayout,
}: PropsWithChildren<{
  /**
   * Reports the strip's real height.
   *
   * <p>For callers whose footer is not the standard one — a note under the
   * button, or several controls — where {@link PINNED_FOOTER_CLEARANCE} is the
   * wrong number and a second literal would drift from it.
   */
  onLayout?: ViewProps["onLayout"];
}>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={{
        ...pinnedFooterEdge(colors),
        backgroundColor: COMPACT_SCREEN_HEADERS ? colors.surface : colors.background,
        bottom: 0,
        left: 0,
        position: "absolute",
        right: 0,
        // Sum, not max. The inset clears the system bar; the gap is the breathing
        // room below the button. Taking the larger of the two let a tall inset
        // swallow the gap entirely, so on an Android three-button navigation bar
        // the button sat flush against it. Where there is no inset this is still
        // just the gap, so nothing changes on iOS gesture bars or the web.
        // md matches the Property filters page (user, 2026-11-01).
        paddingBottom: insets.bottom + spacing.md,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
      }}
    >
      {children}
    </View>
  );
}

/**
 * Bottom padding a scroll view needs so its last item clears a PinnedFooter.
 *
 * <p>The strip is the top gap, a 48pt button and the bottom gap — 86pt — plus a
 * little room so the last item does not sit flush on the strip's edge. It was
 * 132 while the footer carried a tall runway for its fade.
 */
export const PINNED_FOOTER_CLEARANCE = 104;
