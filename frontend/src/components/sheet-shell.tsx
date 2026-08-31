import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, Easing, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// The app's one bottom sheet: grabber handle, serif title with a close button,
// safe-area padding and keyboard avoidance. Every modal sheet should render
// through this so they all open, pad and scroll identically.
export function SheetShell({
  children,
  dismissOnDrag = false,
  onClose,
  title,
}: {
  children: ReactNode;
  /**
   * Opt in to a hand-run entrance and a grabber you can actually drag the sheet
   * down by.
   *
   * <p>Off by default because it replaces the platform's slide with our own, and
   * a sheet holding a form wants the platform's — dragging fights the keyboard
   * and the scroll inside it. Sheets that are read, not filled in, want this.
   */
  dismissOnDrag?: boolean;
  onClose: () => void;
  title: string;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();

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
  // Deliberately NOT native-driven. A value the native driver owns is only
  // reliably moved by native animations; setValue from a gesture is forwarded
  // but does not dependably repaint the transform, which is exactly how a drag
  // ends up doing nothing at all. A single translate on the JS thread is cheap.
  const offset = useRef(new Animated.Value(dismissOnDrag ? travel : 0)).current;

  useEffect(() => {
    if (!dismissOnDrag) {
      return;
    }

    Animated.timing(offset, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: false,
    }).start();
  }, [dismissOnDrag, offset]);

  const dismiss = useCallback(() => {
    if (!dismissOnDrag) {
      onClose();
      return;
    }

    // Unmounting on the way out rather than at the start of it: calling onClose
    // first would tear the sheet off the screen and leave nothing to animate.
    Animated.timing(offset, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
      toValue: travel,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        onClose();
      }
    });
  }, [dismissOnDrag, offset, onClose, travel]);

  // The gesture outlives the renders it was built in, so it reads the current
  // dismiss through a ref instead of capturing the first one it ever saw.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const drag = useRef(
    PanResponder.create({
      // Claimed on touch DOWN as well as on movement. Waiting for a move alone
      // left the first few pixels of every drag unowned, and on a target this
      // shallow that is most of the gesture.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 3,
      // Nothing below gets to take the gesture back mid-drag — without this the
      // sheet's own ScrollView can claim it and the sheet stops following the
      // finger halfway down.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      // Upward drags are pinned at 0: a sheet that lifts off the bottom edge
      // leaves a strip of page under it and stops looking anchored.
      onPanResponderMove: (_event, gesture) => offset.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_event, gesture) => {
        // Either far enough or fast enough — a flick that never travels far is
        // still unmistakably a dismissal.
        if (gesture.dy > 110 || gesture.vy > 0.85) {
          dismissRef.current();
          return;
        }

        Animated.spring(offset, { bounciness: 0, toValue: 0, useNativeDriver: false }).start();
      },
    }),
  ).current;

  return (
    <Modal animationType={dismissOnDrag ? "none" : "slide"} navigationBarTranslucent onRequestClose={dismiss} statusBarTranslucent transparent visible>
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
          opacity: dismissOnDrag
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
          <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
