import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Animated, Dimensions, Easing, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, Text, View, type GestureResponderEvent, type PanResponderGestureState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// The app's one bottom sheet: grabber handle, serif title with a close button,
// safe-area padding and keyboard avoidance. Every modal sheet should render
// through this so they all open, pad and scroll identically.
export function SheetShell({
  animated = false,
  children,
  dismissOnDrag = false,
  onClose,
  title,
}: {
  /**
   * The hand-run entrance and the fading backdrop, without the drag.
   *
   * <p>
   * Split out of {@link dismissOnDrag}, which used to be the only way to get
   * them. The platform's own "slide" moves the whole window, backdrop included,
   * so the page behind flashes at the edges on the way in — but the pan gesture
   * that came bundled with the fix fights a keyboard and an inner scroll, which
   * is why a sheet holding a form could not have either.
   *
   * <p>Implied by {@code dismissOnDrag}. Set this on its own for a sheet that
   * is filled in rather than read.
   */
  animated?: boolean;
  children: ReactNode;
  /**
   * Opt in to a hand-run entrance and a grabber you can actually drag the sheet
   * down by.
   *
   * <p>Off by default because dragging fights the keyboard and the scroll inside
   * a form. Sheets that are read, not filled in, want this; a sheet that only
   * wants the entrance takes {@link animated}.
   */
  dismissOnDrag?: boolean;
  onClose: () => void;
  title: string;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  // Dragging implies the hand-run entrance: the sheet has to be ours to move
  // before a finger can move it.
  const runsOwnAnimation = animated || dismissOnDrag;
  // See the note on `offset` below: only a sheet nobody drags can hand its
  // translate to the native driver.
  const nativeDriven = runsOwnAnimation && !dismissOnDrag;

  /**
   * The keyboard's height, measured — on Android only.
   *
   * <p>`KeyboardAvoidingView behavior="padding"` is broken on Android under
   * edge-to-edge (mandatory since SDK 53). It infers the keyboard height by
   * comparing screen height to window height, and edge-to-edge makes the window
   * span the whole display — so the number is wrong, and on DISMISSAL its padding
   * does not return to zero. That is the bug where a sheet stays shoved up the
   * screen after the keyboard closes.
   *
   * <p>iOS keeps the avoider, where it works correctly. `ScreenScrollView` solves
   * the same problem the same way; this is the sheet's copy of it.
   */
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const onShow = Keyboard.addListener("keyboardDidShow", (event) =>
      // Minus the safe-area inset: on a gesture-navigation device the keyboard's
      // reported height already includes that strip, and counting it twice lifts
      // the sheet a nav-bar's height too far.
      setKeyboardInset(Math.max(0, event.endCoordinates.height - insets.bottom)),
    );
    const onHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [insets.bottom]);
  // Far enough to be off-screen from any starting point, and the distance a
  // dismissing drag travels. The sheet itself is at most 92% of this.
  const travel = Dimensions.get("window").height;
  // How far down the sheet is sitting: 0 open, travel gone. Drives the slide and
  // the backdrop together, so a half-dragged sheet has a half-lit page behind
  // it and the gesture feels attached to something.
  //
  // Native-driven ONLY when nothing will call setValue on it. A value the
  // native driver owns is reliably moved by native animations alone; setValue
  // from a gesture is forwarded but does not dependably repaint the transform,
  // which is exactly how a drag ends up doing nothing at all. So a draggable
  // sheet keeps its translate on the JS thread, and a merely-animated one does
  // not need to: on the JS thread its 320ms entrance competes with whatever the
  // sheet does on mount — an autofocused field opening the keyboard, a query
  // resolving — and loses, which is a sheet that appears to snap into place
  // rather than slide. Both consumers of this value, a transform and an
  // opacity, are native-driver safe.
  const offset = useRef(new Animated.Value(runsOwnAnimation ? travel : 0)).current;

  useEffect(() => {
    if (!runsOwnAnimation) {
      return;
    }

    Animated.timing(offset, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: nativeDriven,
    }).start();
  }, [nativeDriven, runsOwnAnimation, offset]);

  const dismiss = useCallback(() => {
    if (!runsOwnAnimation) {
      onClose();
      return;
    }

    // Unmounting on the way out rather than at the start of it: calling onClose
    // first would tear the sheet off the screen and leave nothing to animate.
    Animated.timing(offset, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
      toValue: travel,
      useNativeDriver: nativeDriven,
    }).start(({ finished }) => {
      if (finished) {
        onClose();
      }
    });
  }, [nativeDriven, runsOwnAnimation, offset, onClose, travel]);

  // The gesture outlives the renders it was built in, so it reads the current
  // dismiss through a ref instead of capturing the first one it ever saw.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  /**
   * How far the body has scrolled, read by the gesture rather than by React.
   *
   * <p>A PanResponder is built once and keeps whatever it closed over, so state
   * would be stale by the time a finger arrives. The ref is always current.
   */
  const scrollTop = useRef(0);
  /**
   * Named to the gesture, so it can be declared simultaneous with THIS scroll
   * view rather than with scrolling in general.
   *
   * <p>Typed loosely on purpose: simultaneousWithExternalGesture wants a ref to
   * a component or a gesture, and a ScrollView ref does not line up with either
   * of its overloads even though it is exactly what the API is documented to
   * take.
   */
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  // The sheet follows the finger and decides on release. Shared, so the head
  // and the body cannot drift into two different ideas of what a dismissal is.
  const dragBehaviour = useMemo(
    () => ({
      // Nothing below gets to take the gesture back mid-drag — without this the
      // sheet's own ScrollView can claim it and the sheet stops following the
      // finger halfway down.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      // Upward drags are pinned at 0: a sheet that lifts off the bottom edge
      // leaves a strip of page under it and stops looking anchored.
      onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) =>
        offset.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
        // Either far enough or fast enough — a flick that never travels far is
        // still unmistakably a dismissal.
        if (gesture.dy > 110 || gesture.vy > 0.85) {
          dismissRef.current();
          return;
        }

        Animated.spring(offset, { bounciness: 0, toValue: 0, useNativeDriver: false }).start();
      },
    }),
    [offset],
  );

  const drag = useRef(
    PanResponder.create({
      // Claimed on touch DOWN as well as on movement. Waiting for a move alone
      // left the first few pixels of every drag unowned, and on a target this
      // shallow that is most of the gesture.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 3,
      ...dragBehaviour,
    }),
  ).current;

  /**
   * The same drag, from anywhere on the sheet's body.
   *
   * <p>
   * Only the 40pt head used to be draggable, so a sheet already scrolled to its
   * top could not be pushed away by the obvious gesture — a swipe down over its
   * content — and the reader had to go and find the grabber.
   *
   * <p>
   * <b>Capture, and only at the top.</b> The ScrollView claims a vertical drag
   * the moment it starts, so a plain {@code onMoveShouldSetPanResponder} on the
   * parent never sees one. Capturing takes the decision first — but only when
   * the content is already at offset 0 and the finger is heading DOWN, which is
   * exactly the case where the ScrollView has nothing left to give. Scrolling
   * up, or dragging anywhere below the top, is left to it untouched.
   */
  /**
   * The body's own drag, as a gesture rather than a PanResponder.
   *
   * <p>
   * <b>Why this is not a PanResponder.</b> It was one, and it only ever worked
   * from the sheet's head. A ScrollView takes the responder on touch-down, and
   * once it holds it the responder system does not consult an ancestor again —
   * so a parent's move-capture handler never fired over the content, however it
   * was written. That is the negotiation gesture-handler exists to settle.
   *
   * <p>
   * {@code activeOffsetY(12)} means it only wakes on a downward drag, and
   * {@code failOffsetY(-12)} means an upward one is handed straight back to the
   * ScrollView — so scrolling from the top still scrolls. Declared simultaneous
   * with the scroll view because both may legitimately see the same touch: at
   * offset 0 the ScrollView has nothing to give and simply does not move.
   *
   * <p>
   * {@code runOnJS} because the sheet is driven by a react-native
   * {@code Animated.Value}, which cannot be written from the UI thread. These
   * are short, cheap callbacks; the jank this would cost on a list does not
   * arise on a sheet that is being dismissed.
   */
  const startedAtTop = useRef(false);
  const bodyGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(dismissOnDrag)
        .activeOffsetY(12)
        .failOffsetY(-12)
        .simultaneousWithExternalGesture(scrollRef as never)
        .onBegin(() => {
          // Read once, at the start. Mid-drag the offset is whatever the
          // ScrollView last reported, and a sheet that began its travel should
          // finish it rather than stop because a stale number came back.
          startedAtTop.current = scrollTop.current <= 0;
        })
        .onUpdate((event) => {
          if (!startedAtTop.current) {
            return;
          }
          offset.setValue(Math.max(0, event.translationY));
        })
        .onEnd((event) => {
          if (!startedAtTop.current) {
            return;
          }
          // Either far enough or fast enough. Velocity is px/s here, not the
          // px/ms a PanResponder reports.
          if (event.translationY > 110 || event.velocityY > 850) {
            dismissRef.current();
            return;
          }
          Animated.spring(offset, { bounciness: 0, toValue: 0, useNativeDriver: false }).start();
        })
        .runOnJS(true),
    [dismissOnDrag, offset],
  );

  return (
    <Modal animationType={runsOwnAnimation ? "none" : "slide"} navigationBarTranslucent onRequestClose={dismiss} statusBarTranslucent transparent visible>
      {/* The backdrop is absolute and OUTSIDE the keyboard avoider, not a flex
          child of it. As a child its height was the window minus the keyboard
          padding, so dismissing the keyboard animated that padding to zero and
          the backdrop's layout trailed it by a frame — uncovering a strip at the
          bottom of the screen and flashing the page behind the sheet. Only the
          sheet needs to move for the keyboard; the dimming never does.

          pointerEvents="none" because nothing here is tappable — the sheet is
          closed by its X, not by the backdrop — and an absolute layer over the
          whole window would otherwise sit on top of the sheet's own touches. */}
      <Animated.View
        pointerEvents="none"
        style={{
          backgroundColor: colors.overlay,
          bottom: 0,
          left: 0,
          opacity: runsOwnAnimation
            ? offset.interpolate({ extrapolate: "clamp", inputRange: [0, travel], outputRange: [1, 0] })
            : 1,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />

      <KeyboardAvoidingView
        // Android drives itself from the measured inset below; handing it
        // "padding" too would apply the lift twice.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Animated.View
          style={{
            transform: [{ translateY: offset }],
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            // Lifted clear of the keyboard rather than padded behind it, so the
            // sheet's rounded bottom edge stays visible sitting on top of it.
            marginBottom: keyboardInset,
            maxHeight: "92%",
            // The safe-area inset is the nav bar's. With the keyboard up the
            // keyboard covers it, so applying both leaves a dead strip.
            paddingBottom: (keyboardInset > 0 ? 0 : insets.bottom) + spacing.md,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
          }}
        >
          {/* The whole head of the sheet is the handle, not just the 4px bar:
              a grabber that thin is a target you miss. The close button still
              works inside it — a Pressable is deeper in the tree, so it is
              asked about the touch first and wins. */}
          <View {...(dismissOnDrag ? drag.panHandlers : {})}>
            <View style={{ alignItems: "center", marginTop: -spacing.xs, paddingBottom: spacing.xs, paddingTop: spacing.xs }}>
              <View style={{ backgroundColor: colors.borderStrong, borderRadius: 999, height: 4, marginBottom: spacing.sm, width: 36 }} />
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22, }} numberOfLines={1}>
                {title}
              </Text>
              <AnimatedPressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={8}
                onPress={dismiss}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 32,
                  justifyContent: "center",
                  width: 32,
                }}
              >
                <X color={colors.ink} size={16} strokeWidth={2.4} />
              </AnimatedPressable>
            </View>
          </View>
          <GestureDetector gesture={bodyGesture}>
            <ScrollView
              ref={scrollRef}
              // No overscroll. Left on, the ScrollView swallows the first part
              // of a downward drag at the top as a rubber-band, which is
              // exactly the movement the sheet needs to see to know it is being
              // pushed away.
              bounces={false}
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
              keyboardShouldPersistTaps="handled"
              overScrollMode="never"
              onScroll={(event) => {
                scrollTop.current = event.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </GestureDetector>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
