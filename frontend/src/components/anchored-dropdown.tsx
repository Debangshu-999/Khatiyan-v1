import { useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";

import { softShadow } from "@/theme/shadows";
import { radii } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Where the trigger sits, straight from `measureInWindow`. */
export type DropdownTrigger = { height: number; width: number; x: number; y: number };

/** Measures a trigger for an {@link AnchoredDropdown}. */
export function useDropdownTrigger() {
  const ref = useRef<View>(null);
  const [trigger, setTrigger] = useState<DropdownTrigger | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, width, height) => setTrigger({ height, width, x, y }));
  return { close: () => setTrigger(null), open, ref, trigger };
}

/**
 * A dropdown's list, floating right under its field (user, 2026-11-07: the Level now list
 * on Mark repaired opened far below its field).
 *
 * <p>The trigger is measured in its own window, a bottom sheet's or the screen's, and
 * Android starts those at different heights depending on the status bar. So the layer
 * measures where ITS window starts and places the list relative to that, which lines up
 * in a sheet, on a screen, on the web and on a phone alike. With too little room below,
 * the list opens upward instead.
 */
export function AnchoredDropdown({
  children,
  maxHeight = 320,
  onClose,
  trigger,
  width: listWidth,
}: {
  children: ReactNode;
  /** The list's own cap. It scrolls inside, the caller's ScrollView. */
  maxHeight?: number;
  onClose: () => void;
  trigger: DropdownTrigger;
  /** Defaults to the trigger's width. */
  width?: number;
}) {
  const { colors } = useTheme();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const root = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [listHeight, setListHeight] = useState(0);

  const gap = 6;
  const edge = 16;
  const cardWidth = Math.min(listWidth ?? trigger.width, screenWidth - edge * 2);
  const left = origin ? Math.max(edge, Math.min(trigger.x - origin.x, screenWidth - cardWidth - edge)) : 0;
  const fieldTop = origin ? trigger.y - origin.y : 0;
  const below = screenHeight - (fieldTop + trigger.height + gap) - edge;
  const above = fieldTop - gap - edge;
  // Upward only when the list does not fit below and there is more room above.
  const openUp = listHeight > 0 && listHeight > below && above > below;
  const cap = Math.max(120, Math.min(maxHeight, openUp ? above : below));

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View
        collapsable={false}
        onLayout={() => root.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
        ref={root}
        style={{ flex: 1 }}
      >
        <Pressable accessibilityLabel="Close list" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
        <View
          onLayout={(event) => setListHeight(event.nativeEvent.layout.height)}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            left,
            maxHeight: cap,
            // Hidden until both measurements are in, so it never flashes in the wrong place.
            opacity: origin && listHeight > 0 ? 1 : 0,
            overflow: "hidden",
            position: "absolute",
            // The phone-visible shadow, as every card now wears (2026-11-09).
            ...softShadow(colors.shadow, 6, 14),
            ...(openUp ? { top: Math.max(edge, fieldTop - gap - Math.min(listHeight, cap)) } : { top: fieldTop + trigger.height + gap }),
            width: cardWidth,
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Where a Modal's own window starts, in `measureInWindow` terms, for a hand-placed
 * popover: subtract `originY` from a trigger's measured y. Put `rootProps` on a
 * full-screen View that holds the popover.
 */
export function useModalOrigin() {
  const ref = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  return {
    originY: origin?.y ?? 0,
    ready: origin !== null,
    rootProps: {
      collapsable: false,
      onLayout: () => ref.current?.measureInWindow((x, y) => setOrigin({ x, y })),
      ref,
      style: { flex: 1 },
    },
  };
}

/**
 * A dropdown drawn inside the screen rather than in a modal window (user, 2026-11-14).
 *
 * <p>{@link AnchoredDropdown} places its list from two `measureInWindow` readings, one
 * in the screen and one in its own modal window, and on a phone those disagreed: the
 * list landed over its pill (the deposit history, then Damages). Here the trigger and
 * `host`, a View that fills the screen, are both measured in the SAME window and
 * subtracted, which also takes in scrolling and a sticky row's pinning. The list is
 * drawn inside the host, never in another window. Render {@link InPageDropdown} as the
 * host's last child.
 */
export function useInPageDropdown() {
  const host = useRef<View>(null);
  const ref = useRef<View>(null);
  const [trigger, setTrigger] = useState<DropdownTrigger | null>(null);
  const open = () => {
    const anchor = ref.current;
    const frame = host.current;
    if (!anchor || !frame) return;
    anchor.measureInWindow((ax, ay, width, height) =>
      frame.measureInWindow((hx, hy) => setTrigger({ height, width, x: ax - hx, y: ay - hy })));
  };
  return { close: () => setTrigger(null), host, open, ref, trigger };
}

export function InPageDropdown({
  children,
  onClose,
  trigger,
  width: listWidth,
}: {
  children: ReactNode;
  onClose: () => void;
  trigger: DropdownTrigger;
  /** Defaults to the trigger's width. */
  width?: number;
}) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const edge = 16;
  const cardWidth = Math.min(listWidth ?? trigger.width, screenWidth - edge * 2);
  // Right-aligned with the pill, kept on screen.
  const left = Math.max(edge, Math.min(trigger.x + trigger.width - cardWidth, screenWidth - cardWidth - edge));
  return (
    <>
      <Pressable accessibilityLabel="Close list" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 20 }} />
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          elevation: 12,
          left,
          overflow: "hidden",
          position: "absolute",
          top: trigger.y + trigger.height + 6,
          width: cardWidth,
          zIndex: 21,
          ...softShadow(colors.shadow, 6, 14),
        }}
      >
        {children}
      </View>
    </>
  );
}
