import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Modal, PanResponder, ScrollView, Text, View } from "react-native";
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
    <Modal animationType={dismissOnDrag ? "none" : "slide"} onRequestClose={dismiss} transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Animated.View
          style={{
            backgroundColor: colors.overlay,
            flex: 1,
            justifyContent: "flex-end",
            opacity: dismissOnDrag
              ? offset.interpolate({ extrapolate: "clamp", inputRange: [0, travel], outputRange: [1, 0] })
              : 1,
          }}
        >
          <Animated.View
            style={{
              transform: [{ translateY: offset }],
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingBottom: insets.bottom + spacing.md,
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
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
