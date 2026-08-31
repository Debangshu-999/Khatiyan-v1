import { Modal, Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { StatusIcon } from "@/components/status-icon";
import { DIALOG_MAX_WIDTH, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Something that must be acknowledged before going on: a refusal from the
 * server, or a warning raised DURING an operation.
 *
 * <p>For anything the reader cannot fix by retyping. Problems with what they
 * typed belong under the field instead (`FieldError`), because those have
 * somewhere to look and something to change. A PRECAUTION stated up front —
 * "this signs you out everywhere", "this tenancy is exiting early" — belongs
 * on the screen as a `NoticeBar`, not behind a dismissal: it has to be visible
 * while the decision is being made, not before it.
 *
 * <p>Carries the app's status mark, the same red disc a failure toast uses.
 * Without it the dialog is a paragraph and a blue button, which looks like a
 * prompt rather than a refusal — the reader has to finish the sentence to learn
 * something went wrong.
 *
 * <p>No title, though. "Could not continue" over "Room number already exists"
 * is the same sentence twice.
 */
export function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.md,
            // Narrower than the screen: a short refusal stretched full width
            // reads as a page rather than an interruption.
            maxWidth: DIALOG_MAX_WIDTH,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <StatusIcon size={38} tone="error" />
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.sansMedium,
              fontSize: 15,
              lineHeight: 22,
              textAlign: "center",
            }}
          >
            {message}
          </Text>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={onClose}
            style={{
              alignItems: "center",
              alignSelf: "stretch",
              backgroundColor: colors.primary,
              borderCurve: "continuous",
              borderRadius: 14,
              paddingVertical: spacing.md,
            }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 15 }}>
              OK
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}
