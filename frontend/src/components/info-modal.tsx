import { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { DIALOG_MAX_WIDTH, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The explanation behind an "i".
 *
 * <p>Every one of these ends in a solid **Got it** rather than only a corner ×.
 * The × is a dismissal; "Got it" is an acknowledgement, and on a panel whose
 * whole job is to explain something it is the action the reader actually wants.
 * Tapping the backdrop still closes it, for anyone who has already read enough.
 */
export function InfoModal({
  children,
  closeOnlyWithAction = false,
  onClose,
  title,
}: {
  children: ReactNode;
  /**
   * No ×: an acknowledgement closes with Got it. The device back button still
   * closes it, like every centred modal (user, 2026-09-29).
   */
  closeOnlyWithAction?: boolean;
  onClose: () => void;
  title: string;
}) {
  const { colors, fonts } = useTheme();

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.lg }}>
        {/* The backdrop is a SIBLING behind the card, never its parent. A
            Pressable around the card takes every touch that starts inside it,
            and on Android a Pressable holding the touch blocks native scrolling,
            so a long explanation could not be scrolled on a phone. */}
        {/* A tap on it does nothing (user, 2026-09-29): the × and Got it
            close this, and so does the device back button. */}
        <View
          style={{ backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 18,
            borderWidth: 1,
            gap: spacing.sm,
            maxHeight: "80%",
            maxWidth: DIALOG_MAX_WIDTH,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text
              numberOfLines={2}
              style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 20 }}
            >
              {title}
            </Text>
            {!closeOnlyWithAction ? (
              <Pressable accessibilityLabel="Close" hitSlop={8} onPress={onClose}>
                <X color={colors.ink} size={18} strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={{ gap: spacing.sm }}
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
          >
            {children}
          </ScrollView>

          <AnimatedPressable
            accessibilityRole="button"
            onPress={onClose}
            style={{
              alignItems: "center",
              backgroundColor: colors.ink,
              borderCurve: "continuous",
              borderRadius: 14,
              justifyContent: "center",
              minHeight: 46,
              marginTop: spacing.xs,
            }}
          >
            <Text style={{ color: colors.surface, fontFamily: fonts.sansBold, fontSize: 15 }}>Got it</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}
