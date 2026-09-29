import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Animated, Dimensions, Easing, Modal, type ModalProps } from "react-native";

import { useTheme } from "@/theme/use-theme";

type BottomSheetModalProps = Omit<ModalProps, "animationType" | "children" | "onRequestClose"> & {
  children: ReactNode | ((dismiss: (afterClose?: () => void) => void) => ReactNode);
  onRequestClose: () => void;
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
export function BottomSheetModal({ children, onRequestClose, visible = true, ...modalProps }: BottomSheetModalProps) {
  const { colors } = useTheme();
  const travel = Dimensions.get("window").height;
  const offset = useRef(new Animated.Value(travel)).current;
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
      useNativeDriver: true,
    }).start();
  }, [offset, travel, visible]);

  const dismiss = useCallback((afterClose?: () => void) => {
    if (closing.current) {
      return;
    }
    closing.current = true;
    Animated.timing(offset, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
      toValue: travel,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        (afterClose ?? onRequestClose)();
      } else {
        closing.current = false;
      }
    });
  }, [offset, onRequestClose, travel]);

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
        {typeof children === "function" ? children(dismiss) : children}
      </Animated.View>
    </Modal>
  );
}
