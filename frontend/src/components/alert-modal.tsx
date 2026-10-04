import { useRef } from "react";
import { usePathname, useRouter } from "expo-router";
import { CenterModal } from "@/components/center-modal";
import { Modal, Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FORM_ROUTES, leaveTopSurface } from "@/components/leave-on-stale";
import { StatusIcon } from "@/components/status-icon";
import { isStaleRefusal } from "@/store/stale-refusal";
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
 *
 * <p>One refusal does more than close (user, 2026-10-04): "The data has
 * changed since you opened it." Closing that one also closes the sheet it was
 * raised in, or goes back a screen when the screen is a form, so what was
 * typed against the old record is not saved over the other person's change.
 * A list stays where it is. See `leave-on-stale`.
 */
export function AlertModal({
  message,
  onClose,
  tone = "error",
}: {
  message: string;
  onClose: () => void;
  /**
   * "info" for a plain "not yet" that nothing went wrong to cause, such as a
   * request that opens once the stay starts. Refusals keep the red mark.
   */
  tone?: "error" | "info" | "warning";
}) {
  const { colors, fonts, type } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  // Decided as the dialog opens: by the time it is closed the refusal is old.
  const stale = useRef(isStaleRefusal(message)).current;

  function close() {
    onClose();
    if (!stale || leaveTopSurface()) {
      return;
    }
    if (FORM_ROUTES.has(pathname) && router.canGoBack()) {
      router.back();
    }
  }

  return (
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={close} statusBarTranslucent transparent visible>
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
          <StatusIcon size={38} tone={tone} />
          <Text style={[type.modalDescription, { color: colors.muted, textAlign: "center" }]}>
            {message}
          </Text>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={close}
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
    </CenterModal>
  );
}
