import { Children, cloneElement, isValidElement, useRef, type ReactElement, type ReactNode } from "react";
import { Animated, Easing, Modal, StyleSheet, View, type ModalProps, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/use-theme";

/** Shared entrance for centred dialogs, matching Secure Wallet confirmation. */
export function CenterModal({ children, onShow, onRequestClose, ...props }: ModalProps) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  // Existing dialog layouts own their scrim. Move that colour out of the
  // animated subtree while preserving their layout and press handling.
  function withoutBackdrop(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const element = node as ReactElement<{ style?: StyleProp<ViewStyle>; children?: ReactNode }>;
      const style = StyleSheet.flatten(element.props.style);
      return cloneElement(element, {
        ...(style?.backgroundColor === colors.overlay ? { style: [element.props.style, { backgroundColor: "transparent" }] } : {}),
        ...(element.props.children !== undefined ? { children: withoutBackdrop(element.props.children) } : {}),
      });
    });
  }
  function dismiss(event: Parameters<NonNullable<ModalProps["onRequestClose"]>>[0]) {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) onRequestClose?.(event);
    });
  }
  return (
    <Modal {...props} animationType="none" onRequestClose={dismiss} onShow={(event) => {
      closing.current = false;
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      onShow?.(event);
    }}>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.overlay }} />
      <Animated.View style={{ flex: 1, opacity: progress, transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
      ] }}>{withoutBackdrop(children)}</Animated.View>
    </Modal>
  );
}
