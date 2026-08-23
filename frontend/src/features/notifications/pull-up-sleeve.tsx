import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronUp } from "lucide-react-native";

import { selectHaptic, tapHaptic } from "@/lib/haptics";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** How far up it must be dragged before the hold begins. */
const ARM_DISTANCE_PX = 48;

/** How far it can lift. Small — this is feedback, not a drawer being opened. */
const MAX_TRAVEL_PX = 72;

/** How long the finger must stay put once armed. */
const HOLD_DURATION_MS = 1500;

/** The grabber at rest, and the track the hold fills. */
const GRABBER_WIDTH_PX = 64;

/**
 * Thick enough to be aimed at.
 *
 * <p>The whole sleeve accepts the drag, but the handle is what people reach
 * for, and a 4px line reads as decoration rather than as something to grab.
 */
const GRABBER_HEIGHT_PX = 8;

/**
 * The floating tab bar's own height, from `(tabs)/_layout`.
 *
 * <p>That bar is `position: absolute; bottom: 0` too, so a sleeve at bottom 0
 * renders UNDERNEATH it — which is exactly why its text was invisible. This
 * lifts the sleeve clear of it.
 */
const TAB_BAR_HEIGHT_PX = 60;

/**
 * Extra body hanging below the visible face, hidden behind the tab bar.
 *
 * <p>Without it, lifting the sleeve dragged its bottom edge up with it and tore
 * a strip of background open between the sleeve and the tab bar. Matching the
 * travel means the skirt is exactly consumed at full pull.
 */
const SKIRT_PX = MAX_TRAVEL_PX;

/**
 * A sleeve along the bottom of the notifications screen: drag it up, hold a
 * moment, and the older notifications open.
 *
 * <p>Pinned above the tab bar rather than placed at the end of the list. In the
 * list it scrolled away, so the one control answering "is there more?" was only
 * reachable by first reaching the end.
 *
 * <p>Built on PanResponder and the Animated API. Neither gesture-handler nor
 * reanimated is a dependency here, and adding one for a single component would
 * force a native rebuild and end Expo Go iteration.
 *
 * <p><b>Why a hold rather than a release.</b> A pull that fires on release IS
 * pull-to-refresh, a reflex people perform without deciding to. At the bottom of
 * a list that same reflex means "load more", so releasing would navigate away
 * every time somebody reached for the end of the feed. Making the finger stay
 * put turns it into a decision.
 */
export function PullUpSleeve({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();

  const travel = useRef(new Animated.Value(0)).current;
  // Starts FULL: at rest the bar is a grabber, and the hold empties and refills
  // it. Kept as one animated value the whole time — see fillWidth below.
  const holdProgress = useRef(new Animated.Value(1)).current;
  const [armed, setArmed] = useState(false);

  // Read inside responder callbacks, which are built once and would otherwise
  // close over the first render's state for the life of the component.
  const armedRef = useRef(false);
  const openedRef = useRef(false);
  const holdAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const cancelHold = () => {
    holdAnimation.current?.stop();
    holdAnimation.current = null;
    holdProgress.setValue(1);
  };

  const settle = () => {
    cancelHold();
    armedRef.current = false;
    setArmed(false);
    Animated.spring(travel, {
      bounciness: 6,
      toValue: 0,
      // JS driver on purpose: the pan writes this value with setValue on every
      // frame, and driving the same value natively desynchronises the two — the
      // sleeve jumps between the JS position and the native one.
      useNativeDriver: false,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Capture an upward drag before anything behind it can take the gesture.
        // Downward drags are left alone — those belong to the list.
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          gesture.dy < -6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          openedRef.current = false;
        },
        onPanResponderMove: (_event, gesture) => {
          const pulled = Math.max(0, Math.min(-gesture.dy, MAX_TRAVEL_PX));
          travel.setValue(-pulled);

          const nowArmed = pulled >= ARM_DISTANCE_PX;
          if (nowArmed === armedRef.current) {
            return;
          }
          armedRef.current = nowArmed;
          setArmed(nowArmed);

          if (!nowArmed) {
            cancelHold();
            return;
          }

          // Armed. The hold starts now, not on release — the finger staying
          // still IS the confirmation.
          selectHaptic();
          holdProgress.setValue(0);
          const animation = Animated.timing(holdProgress, {
            duration: HOLD_DURATION_MS,
            easing: Easing.linear,
            toValue: 1,
            // Drives a width, which the native driver cannot animate.
            useNativeDriver: false,
          });
          holdAnimation.current = animation;
          animation.start(({ finished }) => {
            if (!finished || openedRef.current) {
              return;
            }
            openedRef.current = true;
            tapHaptic();
            onOpenRef.current();
            settle();
          });
        },
        onPanResponderRelease: settle,
        onPanResponderTerminate: settle,
      }),
    // Built once. Everything mutable lives behind a ref for exactly this reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => cancelHold, []);

  // ALWAYS this animated node. Swapping the width between a plain number and an
  // Animated value on `armed` made React re-create the style every time the
  // threshold was crossed, which dropped the running animation mid-hold.
  const fillWidth = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, GRABBER_WIDTH_PX],
  });

  // Slate grey, not ink: at full ink a permanent full-width band read as dark
  // mode leaking into a white-first app, and every tinted alternative was either
  // claimed (accent is the filters, primary is actions) or carried a status
  // meaning (jade, danger, warning), which a standing control should not.
  //
  // Grey belongs to no module and states nothing, which is what a piece of
  // chrome wants. White on #64748B clears AA for the bold label.
  const sleeveBackground = colors.muted;
  const sleeveForeground = colors.surface;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        backgroundColor: sleeveBackground,
        borderCurve: "continuous",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        // Cast upward, so it lifts off the cards instead of butting against
        // them. The default offset throws the shadow down, where the tab bar
        // would eat it.
        //
        // No elevation on purpose. Android sorts overlapping views by it, and
        // an elevated sleeve can jump above the floating tab bar — which would
        // put the hidden skirt over the tab icons. The ink fill is what makes
        // the sleeve read as separate anyway; the shadow is only refinement.
        shadowColor: colors.ink,
        shadowOffset: { height: -4, width: 0 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
        // Above the tab bar, not under it — but dropped by the skirt, which the
        // tab bar then covers.
        bottom: TAB_BAR_HEIGHT_PX + insets.bottom - SKIRT_PX,
        left: 0,
        paddingBottom: spacing.xxs + SKIRT_PX,
        // Small, so the handle sits ON the upper margin rather than floating
        // below it — it is the edge you grab.
        paddingTop: spacing.xs,
        position: "absolute",
        right: 0,
        transform: [{ translateY: travel }],
      }}
    >
      <View style={{ alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg }}>
        {/* The grabber IS the progress. It already says "drag me", so filling it
            keeps the thing being held and the thing reporting the hold as one
            object — and it costs no colour wash across the sleeve, which read as
            the sheet loading rather than as a gesture completing. */}
        <View
          style={{
            borderRadius: 999,
            height: GRABBER_HEIGHT_PX,
            overflow: "hidden",
            width: GRABBER_WIDTH_PX,
          }}
        >
          {/* Track and fill are siblings, not parent and child: opacity on a
              parent applies to its children too, which would dim the fill by
              exactly the amount that makes the track readable. */}
          <View
            style={{
              backgroundColor: sleeveForeground,
              bottom: 0,
              left: 0,
              opacity: 0.34,
              position: "absolute",
              right: 0,
              top: 0,
            }}
          />
          <Animated.View
            style={{
              backgroundColor: sleeveForeground,
              borderRadius: 999,
              bottom: 0,
              left: 0,
              position: "absolute",
              top: 0,
              width: fillWidth,
            }}
          />
        </View>

        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, maxWidth: "100%" }}>
          {armed ? null : (
            <View style={{ opacity: 0.8 }}>
              <ChevronUp color={sleeveForeground} size={15} strokeWidth={2.4} />
            </View>
          )}
          <Text
            style={{
              color: sleeveForeground,
              flexShrink: 1,
              fontFamily: fonts.sansBold,
              fontSize: 13,
              lineHeight: 18,
              textAlign: "center",
            }}
          >
            {armed ? "Keep holding…" : "Pull up to view older notifications"}
          </Text>
        </View>

        {/* Only while held. At rest the sleeve has one job — say what the gesture
            is — and a count sitting there permanently competed with it. Growing
            upward is safe: the sleeve is anchored at its bottom edge. */}
        {armed ? (
          <Text
            style={[
              type.caption,
              { color: sleeveForeground, lineHeight: 17, opacity: 0.9, textAlign: "center" },
            ]}
          >
            {count} older notification{count === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}
