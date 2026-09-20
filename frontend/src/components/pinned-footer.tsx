import { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A button pinned to the bottom of a scrolling screen.
 *
 * <p>It <b>overlays</b> the scroll area rather than sitting below it in flow, so
 * content scrolls underneath it right to the bottom of the screen.
 *
 * <p><b>Seamless.</b> An opaque strip in the page's own colour, with no rule
 * above it and no fade — the way the chat composer sits under its messages. It
 * used to veil the content behind it with two gradients, a page-colour wash and
 * a dark dim. That read as a grey band laid across the form, a second surface
 * where there should be none. The button's own shape is enough to say where the
 * page ends and the action begins.
 *
 * <p>The page colour is `colors.background`. Every screen that pins a footer
 * sits on that or `formSurface`, which is the same colour in both themes; a
 * screen on any other ground would show this as a band and needs a prop here.
 *
 * <p>The scroll view behind it needs bottom padding of roughly
 * {@link PINNED_FOOTER_CLEARANCE} so its last item can still be scrolled clear
 * of the button.
 */
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
        backgroundColor: colors.background,
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
        // bottom edge on devices with no inset at all.
        paddingBottom: insets.bottom + spacing.xl,
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
