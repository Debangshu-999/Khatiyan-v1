import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A wizard's title, progress bar and step count, held still while the form
 * scrolls beneath them.
 *
 * <p>
 * <b>Why pinned.</b> The step count and the bar answer "where am I and how much
 * is left" — the two questions a long form provokes precisely when someone is
 * deep enough in it to have scrolled the answer off the screen. Sitting at the
 * top of the scroll view they were readable only from the top of the step.
 *
 * <p>
 * <b>Why an overlay rather than a row above the scroller.</b> The content passes
 * UNDER the bar, so the page keeps its full height and the scroll indicator
 * still describes the whole step. It is opaque, so nothing shows through.
 *
 * <p>
 * The height is measured rather than guessed: the header grows and shrinks with
 * the step — the last one drops the progress bar entirely — and a hardcoded
 * inset would leave a gap on one step and clip the first field on another. The
 * measurement is handed back so the caller can pad its scroll content by it.
 */
export function PinnedWizardHeader({
  children,
  onHeightChange,
}: {
  children: ReactNode;
  onHeightChange: (height: number) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
      style={{
        // Blue, not the page's own colour. Matching the page made the panel
        // invisible until something scrolled behind it, so the form appeared to
        // slide under nothing — and the grey that replaced it was four shades
        // off white, which read as an artefact rather than a surface.
        backgroundColor: colors.primarySoft,
        // Rounded at the bottom only. The top edge runs under the status bar,
        // where a curve would show the page through the corner; the bottom is
        // where the panel ends and reads as an object sitting on the form.
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        // A tight shadow, not a soft one. onLayout measures the view's BOX and
        // not the shadow it casts, so an 8px blur spilled into the gap the
        // caller pads below the panel and closed it again — the content looked
        // welded to the edge however much padding was added. The tinted fill
        // already separates the panel from the form; the shadow only needs to
        // lift it, not to draw the separation.
        borderCurve: "continuous",
        elevation: 2,
        shadowColor: "#0F172A",
        shadowOffset: { height: 1, width: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        left: 0,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        // The status bar is the caller's problem nowhere else, but this view is
        // absolutely positioned and so escapes the screen's own safe area.
        paddingTop: insets.top + spacing.sm,
        position: "absolute",
        right: 0,
        top: 0,
        zIndex: 2,
      }}
    >
      {children}
    </View>
  );
}

/**
 * Tracks the panel's height, and what the scroller underneath should clear.
 *
 * <p>
 * <b>They are not the same number.</b> The panel is absolutely positioned, so it
 * pads itself past the status bar — but {@code ScreenScrollView} already sits
 * inside a SafeAreaView with a top edge on native, so its content starts below
 * the status bar too. Padding by the raw height counted that strip twice and
 * dropped the first field a status bar's depth too far down the screen. It looks
 * right on web, where the inset is zero, which is exactly why it survived a
 * browser check.
 *
 * <p>
 * Callers use {@code contentInset}. The raw {@code height} is exposed for the
 * rare caller whose scroller is not safe-area inset.
 */
export function usePinnedWizardHeader() {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  return {
    contentInset: Math.max(0, height - insets.top),
    height,
    onHeightChange: setHeight,
  };
}
