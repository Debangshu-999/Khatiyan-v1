import { useCallback, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Explanatory caption used under page/section titles. Styled as an editorial
// annotation — a soft accent rule beside lightly-tracked italic text — with a
// mount entrance: the rule wipes in from the top while the text fades and
// slides in beside it, so the supporting copy reads as intentional rather than
// loose body text.
export function HeaderNote({ children, delay = 120 }: { children: string; delay?: number }) {
  const { colors, type } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  // Replay the entrance every time the screen gains focus — tab screens stay
  // mounted, so a plain mount effect would only ever run once.
  useFocusEffect(
    useCallback(() => {
      progress.setValue(0);
      const animation = Animated.timing(progress, {
        delay,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }, [delay, progress]),
  );

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xxs, maxWidth: 540 }}>
      <Animated.View
        style={{
          backgroundColor: colors.accent,
          borderRadius: 2,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }),
          transform: [{ scaleY: progress }],
          transformOrigin: "top",
          width: 3,
        }}
      />
      {/* Not selectable. This is a screen's own description — nobody copies it,
          and a long press anywhere near it put a selection handle and a
          clipboard bar over the page. Selectable text is for values somebody
          might need elsewhere: a reference code, an amount, a clause. */}
      <Animated.Text
        style={[
          type.body,
          {
            color: colors.muted,
            flex: 1,
            fontSize: 14,
            fontStyle: "italic",
            letterSpacing: 0.2,
            lineHeight: 21,
            opacity: progress,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          },
        ]}
      >
        {children}
      </Animated.Text>
    </View>
  );
}
