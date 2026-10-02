import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, PanResponder, Text } from "react-native";

import { InfoModal } from "@/components/info-modal";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CHEF_WIDTH = 86;
const CHEF_HEIGHT = 156;
const CHEF_IMAGE_WIDTH = 148;
const EDGE_GAP = spacing.lg;

type Viewport = { width: number; height: number };

/** A medium-sized, movable reminder that stays above the scrolling forecast. */
export function FloatingForecastChef({ viewport }: { viewport: Viewport }) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  const translation = useRef(new Animated.ValueXY()).current;
  const position = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const bounds = useRef(viewport);
  bounds.current = viewport;
  const openRef = useRef(() => setOpen(true));

  useEffect(() => {
    if (!viewport.width || !viewport.height) return;
    const maxX = Math.max(0, viewport.width - CHEF_WIDTH - EDGE_GAP * 2);
    const minY = Math.min(0, -(viewport.height - CHEF_HEIGHT - EDGE_GAP * 2));
    const x = Math.min(maxX, Math.max(0, position.current.x));
    const y = Math.min(0, Math.max(minY, position.current.y));
    position.current = { x, y };
    translation.setValue(position.current);
  }, [translation, viewport.height, viewport.width]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragStart.current = { ...position.current };
        },
        onPanResponderMove: (_event, gesture) => {
          const { height, width } = bounds.current;
          const maxX = Math.max(0, width - CHEF_WIDTH - EDGE_GAP * 2);
          const minY = Math.min(0, -(height - CHEF_HEIGHT - EDGE_GAP * 2));
          const x = Math.min(maxX, Math.max(0, dragStart.current.x + gesture.dx));
          const y = Math.min(0, Math.max(minY, dragStart.current.y + gesture.dy));
          position.current = { x, y };
          translation.setValue(position.current);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (Math.hypot(gesture.dx, gesture.dy) < 6) {
            openRef.current();
          }
        },
      }),
    [translation],
  );

  return (
    <>
      <Animated.View
        accessibilityHint="Drag to move the chef, or tap for cooking estimate advice"
        accessibilityLabel="Chef's cooking estimate advice"
        accessibilityRole="button"
        accessible
        onAccessibilityTap={() => setOpen(true)}
        {...pan.panHandlers}
        style={{
          bottom: EDGE_GAP,
          height: CHEF_HEIGHT,
          left: EDGE_GAP,
          overflow: "hidden",
          position: "absolute",
          transform: translation.getTranslateTransform(),
          width: CHEF_WIDTH,
          zIndex: 10,
        }}
      >
        {/* The transparent source has spare room on the right; clip that room
            in the hit target so the chef is a useful medium size, not tiny. */}
        <Image
          resizeMode="stretch"
          source={require("../../../assets/images/workspace/cooking-forecast-chef-3x.png")}
          style={{ height: CHEF_HEIGHT, left: -14, position: "absolute", top: 0, width: CHEF_IMAGE_WIDTH }}
        />
      </Animated.View>
      {open ? (
        <InfoModal closeOnlyWithAction onClose={() => setOpen(false)} title="Trust your own estimate">
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 }}>
            You know your kitchen and your tenants better than this number does. It counts every subscriber as eating and already includes your buffers, so it runs high. Use it as a rough guide and let your own experience decide what actually gets cooked.
          </Text>
        </InfoModal>
      ) : null}
    </>
  );
}
