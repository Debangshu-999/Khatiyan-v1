import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSegments } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FitText } from "@/components/fit-text";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The app-wide small header (user, 2026-10-31), which the user may ask to revert.
 *
 * <p><b>False puts every screen back on the old collapsing header with its
 * description.</b> See docs/compact-header-change.md for all that goes with it.
 */
export const COMPACT_SCREEN_HEADERS = true;
/** The back circle on its own, so it can go without undoing the rest. */
export const COMPACT_HEADER_BACK_BUTTON = true;

const BACK_SIZE = 36;

export type CompactHeaderContent = {
  badge?: ReactNode;
  italicTail?: string;
  /** Instead of leaving the screen. Return true when it dealt with the press, false to leave anyway. */
  onBack?: () => boolean | void;
  /** Light text and controls over an explicitly dark screen surface. */
  onDark?: boolean;
  title: string;
  trailing?: ReactNode;
};

/**
 * Lets a header anywhere inside a screen's content draw above the scroll area,
 * so it is fixed without the screen being rewritten around it.
 */
export const CompactHeaderSlotContext = createContext<((content: CompactHeaderContent | null) => void) | null>(null);

export function CompactScreenHeader({
  content,
  inlineMargin = 0,
  surface,
}: {
  content: CompactHeaderContent;
  inlineMargin?: number;
  surface?: string;
}) {
  const slot = useContext(CompactHeaderSlotContext);
  const { badge, italicTail, onBack, onDark, title, trailing } = content;

  useLayoutEffect(() => {
    if (!slot) return;
    slot({ badge, italicTail, onBack, onDark, title, trailing });
    return () => slot(null);
  }, [badge, italicTail, onBack, onDark, slot, title, trailing]);

  return slot ? null : <CompactHeaderBar content={content} inlineMargin={inlineMargin} surface={surface} />;
}

export function CompactHeaderBar({
  content,
  inlineMargin = 0,
  surface,
}: {
  content: CompactHeaderContent;
  inlineMargin?: number;
  surface?: string;
}) {
  const { colors, isDark, type } = useTheme();
  const router = useGuardedRouter();
  const segments = useSegments();
  const [rightWidth, setRightWidth] = useState(0);
  const { badge, italicTail, onBack, onDark, title, trailing } = content;

  // A tab is a root, with nothing behind it to go back to. Every other screen
  // has the button even with no history, as after a reload on web, which goes Home.
  const showBack = COMPACT_HEADER_BACK_BUTTON && (Boolean(onBack) || segments[0] !== "(tabs)");
  const hasRight = Boolean(badge || trailing);
  // A tab's title starts at the left (user, 2026-10-31). Everywhere else both
  // sides take the wider one's width, so the title stays on the screen's centre.
  const leftAligned = segments[0] === "(tabs)" && !showBack;
  const sideWidth = Math.max(showBack ? BACK_SIZE : 0, hasRight ? rightWidth : 0);

  return (
    <View
      style={{
        alignItems: "center",
        // Opaque and the same white as the page, with no line or shadow, so the
        // page reads as sliding under it (user, 2026-10-31).
        backgroundColor: surface ?? colors.surface,
        flexDirection: "row",
        gap: spacing.sm,
        marginHorizontal: inlineMargin,
        minHeight: 60,
        paddingHorizontal: 18,
        paddingVertical: spacing.sm,
        zIndex: 2,
      }}
    >
      <View style={{ display: leftAligned ? "none" : "flex", width: sideWidth }}>
        {showBack ? (
          <AnimatedPressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => {
              if (onBack?.() === true) return;
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            style={{ alignItems: "center", backgroundColor: onDark ? "rgba(255, 255, 255, 0.06)" : undefined, borderColor: onDark ? "rgba(255, 255, 255, 0.2)" : colors.border, borderRadius: 999, borderWidth: 1, height: BACK_SIZE, justifyContent: "center", width: BACK_SIZE }}
          >
            <ArrowLeft color={onDark ? "#FFFFFF" : isDark ? colors.ink : "#000000"} size={21} strokeWidth={2.75} />
          </AnimatedPressable>
        ) : null}
      </View>

      <FitText style={[type.brand, { color: onDark ? "#FFFFFF" : colors.ink, flex: 1, fontSize: 21, lineHeight: 27, textAlign: leftAligned ? "left" : "center" }]}>
        {title}
        {italicTail ? (
          <Text style={[type.brandItalic, { color: onDark ? "#FFE4AA" : colors.accent, fontSize: 21, lineHeight: 27 }]}>{` ${italicTail}`}</Text>
        ) : null}
      </FitText>

      <View style={{ height: BACK_SIZE, justifyContent: "center", width: leftAligned ? (hasRight ? rightWidth : 0) : sideWidth }}>
        {hasRight ? (
          <View
            onLayout={(event) => setRightWidth(event.nativeEvent.layout.width)}
            style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, position: "absolute", right: 0 }}
          >
            {badge}
            {trailing}
          </View>
        ) : null}
      </View>
    </View>
  );
}
