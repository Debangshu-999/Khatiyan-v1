import { Children, cloneElement, isValidElement, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";
import { Animated, Dimensions, Easing, Modal, PanResponder, StyleSheet, View, type ModalProps, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/use-theme";

type BottomSheetModalProps = Omit<ModalProps, "animationType" | "children" | "onRequestClose"> & {
  children: ReactNode | ((dismiss: (afterClose?: () => void) => void) => ReactNode);
  onRequestClose: () => void;
  dismissOnDrag?: boolean;
  onDismissStart?: () => void;
};

/**
 * The enquiry sheet's motion for custom bottom-up layouts that cannot use
 * SheetShell's header and scrolling. Keep the backdrop fixed while the content
 * slides; the native `slide` transition moves the entire modal window instead.
 *
 * The caller owns its sheet layout. Its outer layout must be transparent, since
 * this component draws the backdrop separately. Use the supplied dismiss
 * callback for close buttons so the downward exit completes before unmounting.
 */
export function BottomSheetModal({ children, dismissOnDrag = true, onDismissStart, onRequestClose, visible = true, ...modalProps }: BottomSheetModalProps) {
  const { colors } = useTheme();
  const travel = Dimensions.get("window").height;
  const offset = useMemo(() => new Animated.Value(travel), [dismissOnDrag, travel]);
  const closing = useRef(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    closing.current = false;
    offset.setValue(travel);
    Animated.timing(offset, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: !dismissOnDrag,
    }).start();
    return () => offset.stopAnimation();
  }, [dismissOnDrag, offset, travel, visible]);

  const dismiss = useCallback((afterClose?: () => void) => {
    if (closing.current) {
      return;
    }
    closing.current = true;
    onDismissStart?.();
    Animated.timing(offset, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
      toValue: travel,
      useNativeDriver: !dismissOnDrag,
    }).start(({ finished }) => {
      if (finished) {
        (afterClose ?? onRequestClose)();
      } else {
        closing.current = false;
      }
    });
  }, [dismissOnDrag, offset, onDismissStart, onRequestClose, travel]);

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const dragStart = useRef(0);
  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !closing.current,
    onMoveShouldSetPanResponder: (_, gesture) => !closing.current && Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => offset.stopAnimation((value) => { dragStart.current = value; }),
    onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, dragStart.current + gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 110 || (gesture.dy > 8 && gesture.vy > 0.85)) {
        dismissRef.current();
      } else {
        Animated.spring(offset, { bounciness: 0, toValue: 0, useNativeDriver: false }).start();
      }
    },
    onPanResponderTerminate: () => {
      if (!closing.current) Animated.spring(offset, { bounciness: 0, toValue: 0, useNativeDriver: false }).start();
    },
    onPanResponderTerminationRequest: () => false,
  }), [offset]);

  // Custom callers already own their rounded panel and its scroll/input
  // controls. Add the same grabber directly to that panel without putting a
  // pan responder over those controls or over the modal's full-screen wrapper.
  function withGrabber(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement<{ style?: StyleProp<ViewStyle>; children?: ReactNode }>(node)) return node;
      const style = StyleSheet.flatten(node.props.style);
      const panel = typeof style?.borderTopLeftRadius === "number" && style.borderTopLeftRadius > 0
        && typeof style.borderTopRightRadius === "number" && style.borderTopRightRadius > 0;
      if (panel) {
        const padding = style.paddingTop ?? style.paddingVertical ?? style.padding ?? 0;
        return cloneElement(node, {
          style: [node.props.style, { paddingTop: Math.max(typeof padding === "number" ? padding : 0, 28) }],
          children: [
            <View
              key="sheet-drag-grabber"
              {...drag.panHandlers}
              accessible
              accessibilityLabel="Drag down to close"
              accessibilityActions={[{ name: "activate", label: "Close sheet" }]}
              onAccessibilityAction={() => dismissRef.current()}
              style={{ alignItems: "center", height: 22, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 }}
            >
              <View style={{ backgroundColor: colors.borderStrong, borderRadius: 999, height: 4, width: 36 }} />
            </View>,
            ...Children.toArray(node.props.children),
          ],
        });
      }
      return node.props.children !== undefined
        ? cloneElement(node, { children: withGrabber(node.props.children) })
        : node;
    });
  }

  const content = typeof children === "function" ? children(dismiss) : children;

  return (
    <Modal animationType="none" onRequestClose={() => dismiss()} transparent visible={visible} {...modalProps}>
      <Animated.View
        pointerEvents="none"
        style={{
          backgroundColor: colors.overlay,
          bottom: 0,
          left: 0,
          opacity: offset.interpolate({ extrapolate: "clamp", inputRange: [0, travel], outputRange: [1, 0] }),
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />
      <Animated.View style={{ flex: 1, transform: [{ translateY: offset }] }}>
        {dismissOnDrag ? withGrabber(content) : content}
      </Animated.View>
    </Modal>
  );
}
