import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { useKeyboardInset } from "@/components/use-keyboard-inset";
import { CodeField } from "@/features/auth/auth-ui";
import { ActionButton, IconButton } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CODE_LENGTH = 6;

/** Matches the wait the auth screens use, so a resend feels the same everywhere. */
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * The second factor on a signature.
 *
 * <p>A sheet rather than another page, because signing is one act and the code
 * is part of it — pushing the agreement off screen to type six digits would
 * leave the tenant confirming something they can no longer see.
 *
 * <p>Deliberately never calls the code a signature. Under the IT Act this is
 * neither a s.3 digital signature nor a Second Schedule electronic signature;
 * it is evidence of assent, which is what makes the contract enforceable under
 * s.10A. Saying more would misstate the legal effect to the person relying on
 * it.
 */
export function OtpSigningSheet({
  busy,
  onClose,
  onResend,
  onSubmit,
  resending,
  sentTo,
}: {
  busy: boolean;
  onClose: () => void;
  onResend: () => void;
  onSubmit: (otp: string) => void;
  resending: boolean;
  /** Last four digits of the number the code went to. */
  sentTo: string;
}) {
  const { colors, fonts, type } = useTheme();
  const keyboardInset = useKeyboardInset();
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const complete = otp.length === CODE_LENGTH;

  // Starts on open, because a code was just sent. Without it the resend link is
  // live the instant the sheet appears, which invites a second code before the
  // first has arrived and burns the first one.
  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* iOS keeps the platform avoider, where it works. Android measures the
          keyboard itself and lifts the sheet by margin: "padding" there is
          broken under edge-to-edge — it infers the height from screen minus
          window, edge-to-edge makes the window the whole display, and the
          padding never returns to zero on dismissal, which left the sheet
          shoved up the screen after the keyboard closed. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              gap: spacing.md,
              marginBottom: keyboardInset,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22 }}>
                Confirm it&apos;s you
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>

            <Text style={[type.body, { color: colors.muted, fontSize: 13.5, lineHeight: 20 }]}>
              We sent a six-digit code to the number ending {sentTo}. Entering it records your
              agreement to the terms you just read.
            </Text>

            {/* The same one field the auth screens use, not six boxes over a
                hidden input. That arrangement stretched a zero-opacity
                TextInput across the boxes to hold focus, and a field nobody
                can see is a field whose taps are one layout change away from
                landing nowhere — which is exactly how it ended up unusable
                inside the signing screen. One real input cannot fail that way,
                and it keeps paste, autofill and the SMS suggestion. */}
            <CodeField label="Six-digit code" onChangeText={setOtp} value={otp} />

            {/* Side by side: confirming and asking again are the two answers to
                the same question, and stacking them made the resend read as a
                lesser step below the real one. */}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton
                disabled={cooldown > 0 || resending || busy}
                label={cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend"}
                onPress={() => {
                  setCooldown(RESEND_COOLDOWN_SECONDS);
                  setOtp("");
                  onResend();
                }}
                variant="secondary"
              />
              <ActionButton
                disabled={!complete || busy}
                label={busy ? "Signing…" : "Confirm"}
                onPress={() => onSubmit(otp)}
              />
            </View>

            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.sm }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
