import { useCallback, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { useHardwareBack } from "@/components/use-hardware-back";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type ChefAnchor = { height: number; width: number; x: number; y: number };

// The picture is 444 by 468. Cut from the hat to the waist and across his width,
// so he stands behind the header's edge (user, 2026-11-01).
const CHEF_HEIGHT = 48;
const CUT = { bottom: 280, left: 50, right: 258, top: 10 };
const SCALE = CHEF_HEIGHT / (CUT.bottom - CUT.top);
const CHEF_WIDTH = Math.round((CUT.right - CUT.left) * SCALE);
// The drawing's canvas. It keeps clear room above and beside the triangle, so the
// tip and its line never touch the canvas edge, where a phone trims them (user, 2026-11-01).
const POINTER_WIDTH = 24;
const POINTER_HEIGHT = 15;

/** The chef, fixed beside the screen header. A tap asks for the card under him. */
export function ForecastChefButton({ onOpen }: { onOpen: (anchor: ChefAnchor) => void }) {
  const button = useRef<View>(null);
  return (
    <AnimatedPressable
      accessibilityLabel="Chef's cooking estimate advice"
      accessibilityRole="button"
      onPress={() => button.current?.measureInWindow((x, y, width, height) => onOpen({ height, width, x, y }))}
      style={{ height: CHEF_HEIGHT, marginVertical: -6, width: CHEF_WIDTH }}
    >
      <View collapsable={false} ref={button} style={{ height: CHEF_HEIGHT, overflow: "hidden", width: CHEF_WIDTH }}>
        <Image
          resizeMode="stretch"
          source={require("../../../assets/images/workspace/cooking-forecast-chef-3x.png")}
          style={{
            height: 468 * SCALE,
            left: -CUT.left * SCALE,
            position: "absolute",
            top: -CUT.top * SCALE,
            width: 444 * SCALE,
          }}
        />
      </View>
    </AnimatedPressable>
  );
}

/**
 * The chef's advice, in a card under him that points up at him (user, 2026-11-01).
 *
 * <p>Drawn inside the screen rather than in a Modal, like the forecast's floating
 * note: a Modal is its own window on Android, whose origin differs from the window
 * the chef was measured in. Any touch outside closes it, and so does device back.
 */
export function ForecastChefTip({ anchor, onClose }: { anchor: ChefAnchor; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  const layer = useRef<View>(null);
  const [frame, setFrame] = useState<ChefAnchor | null>(null);

  const closeOnBack = useCallback(() => {
    onClose();
    return true;
  }, [onClose]);
  useHardwareBack(closeOnBack);

  const cardWidth = frame ? Math.min(300, frame.width - spacing.lg * 2) : 0;
  const left = frame ? frame.width - spacing.lg - cardWidth : 0;
  const top = frame ? anchor.y - frame.y + anchor.height - 2 : 0;
  // The pointer sits under the chef's middle, whatever the screen's width.
  // Stopped short of the card's rounded corner, or its base would hang off the
  // curve instead of sitting on the straight edge (user, 2026-11-01).
  const pointerLeft = frame
    ? Math.min(anchor.x - frame.x + anchor.width / 2 - left - POINTER_WIDTH / 2, cardWidth - radii.card - POINTER_WIDTH - 2)
    : 0;

  return (
    <View
      collapsable={false}
      onLayout={() => layer.current?.measureInWindow((x, y, width, height) => setFrame({ height, width, x, y }))}
      ref={layer}
      // Above the header, which has zIndex 2. On a phone its plain parents are
      // flattened away, so it competes with this layer directly and covered the
      // pointer's tip and the chef (user, 2026-11-01). The browser does not do this.
      style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
    >
      {/* Over the whole screen, the chef included, so tapping him closes it too. On
          release: closed on touch-down, the same tap went on to him and opened it again. */}
      <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
      {frame ? (
        // The pointer sits beside the card, inside this wrapper's own bounds: as a
        // child hanging off the card's edge, a phone cut its tip off (user, 2026-11-01).
        // Drawn after the card, so it covers the card's border where they meet.
        <View accessibilityLiveRegion="polite" style={{ left, paddingTop: POINTER_HEIGHT - 1, position: "absolute", top, width: cardWidth }}>
        <View
          style={{
            alignItems: "flex-start",
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderRadius: radii.card,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            padding: spacing.md,
            ...cardShadow(colors.shadow),
          }}
        >
          <Image
            source={require("../../../assets/images/workspace/how-it-works-lightbulb.png")}
            style={{ height: 44, width: 44 }}
          />
          <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
            <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 19 }}>
              Trust your own estimate
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 }}>
              You know your kitchen and your tenants better than this number does. It counts every subscriber as eating and already includes your buffers, so it runs high. Use it as a rough guide and let your own experience decide what actually gets cooked.
            </Text>
          </View>
        </View>
          {/* Its base lies exactly on the card's top border and hides it between the two sides. */}
          <Svg
            height={POINTER_HEIGHT}
            pointerEvents="none"
            style={{ left: pointerLeft, position: "absolute", top: 0 }}
            viewBox={`0 0 ${POINTER_WIDTH} ${POINTER_HEIGHT}`}
            width={POINTER_WIDTH}
          >
            <Path d="M2 15 L12 4 L22 15 Z" fill={colors.surface} />
            <Path d="M2.5 14.5 L12 4 L21.5 14.5" fill="none" stroke={colors.borderStrong} strokeLinejoin="miter" strokeWidth={1} />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}
