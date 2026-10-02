import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { useKeyboardInset } from "@/components/use-keyboard-inset";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { CodeField } from "@/features/auth/auth-ui";
import { ActionButton, IconButton } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CODE_LENGTH = 6;

/** Matches the server's resend cooldown, so the button unlocks when a resend would be accepted. */
export const RESEND_COOLDOWN_SECONDS = 30;

/**
 * The code itself: what it is for, the field, and Resend beside Confirm.
 *
 * <p>Separate from the sheet so a flow that already has a sheet open can show
 * this as its next step inside it, instead of stacking a second sheet — and a
 * second dimmed backdrop — on top. Cash payment does exactly that; signing an
 * agreement has no sheet of its own, so it uses {@link OtpCodeSheet}.
 */
export function OtpCodeEntry({
  busy,
  busyLabel,
  cooldownSeconds = RESEND_COOLDOWN_SECONDS,
  confirmLabel = "Confirm",
  message,
  onResend,
  onSubmit,
  resending,
}: {
  busy: boolean;
  /** The confirm button's label while the code is being checked. */
  busyLabel: string;
  /**
   * Where the resend countdown starts. The full cooldown when a code has just
   * gone out; less when the step reopens on a code sent a moment ago, so the
   * button unlocks when the server would actually accept another.
   */
  cooldownSeconds?: number;
  confirmLabel?: string;
  message: ReactNode;
  onResend: () => void;
  onSubmit: (otp: string) => void;
  resending: boolean;
}) {
  const { colors, type } = useTheme();
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(cooldownSeconds);

  const complete = otp.length === CODE_LENGTH;

  // Starts on open, because a code was just sent. Without it the resend link is
  // live the instant the step appears, which invites a second code before the
  // first has arrived and burns the first one.
  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[type.modalDescription, { color: colors.muted }]}>
        {message}
      </Text>

      {/* The same one field the auth screens use, not six boxes over a
          hidden input. That arrangement stretched a zero-opacity TextInput
          across the boxes to hold focus, and a field nobody can see is a field
          whose taps are one layout change away from landing nowhere — which is
          exactly how it ended up unusable inside the signing screen. One real
          input cannot fail that way, and it keeps paste, autofill and the SMS
          suggestion. */}
      <CodeField label="Six-digit code" onChangeText={setOtp} value={otp} />

      {/* Side by side: confirming and asking again are the two answers to the
          same question, and stacking them made the resend read as a lesser
          step below the real one. */}
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
          label={busy ? busyLabel : confirmLabel}
          onPress={() => onSubmit(otp)}
        />
      </View>
    </View>
  );
}

/**
 * Six digits from somebody's phone, and the way to ask for them again.
 *
 * <p>Shared by every flow that confirms an act with a code — signing an
 * agreement, confirming a cash payment — so they open, count down and resend
 * identically. Only the words differ, and those are the caller's.
 *
 * <p>A sheet rather than a page, because the code is part of the act it
 * confirms: pushing what is being confirmed off screen to type six digits
 * would leave the person confirming something they can no longer see.
 */
export function OtpCodeSheet({
  busy,
  busyLabel,
  cooldownSeconds = RESEND_COOLDOWN_SECONDS,
  confirmLabel = "Confirm",
  message,
  onClose,
  onResend,
  onSubmit,
  resending,
  title,
}: {
  busy: boolean;
  /** The confirm button's label while the code is being checked. */
  busyLabel: string;
  /**
   * Where the resend countdown starts. The full cooldown when a code has just
   * gone out; less when the sheet reopens on a code sent a moment ago, so the
   * button unlocks when the server would actually accept another.
   */
  cooldownSeconds?: number;
  confirmLabel?: string;
  message: ReactNode;
  onClose: () => void;
  onResend: () => void;
  onSubmit: (otp: string) => void;
  resending: boolean;
  title: string;
}) {
  const { colors, fonts } = useTheme();
  const keyboardInset = useKeyboardInset();

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => <>
      {/* iOS keeps the platform avoider, where it works. Android measures the
          keyboard itself and lifts the sheet by margin: "padding" there is
          broken under edge-to-edge — it infers the height from screen minus
          window, edge-to-edge makes the window the whole display, and the
          padding never returns to zero on dismissal, which left the sheet
          shoved up the screen after the keyboard closed. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
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
                {title}
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={() => dismiss()} />
            </View>

            <OtpCodeEntry
              busy={busy}
              busyLabel={busyLabel}
              confirmLabel={confirmLabel}
              cooldownSeconds={cooldownSeconds}
              message={message}
              onResend={onResend}
              onSubmit={onSubmit}
              resending={resending}
            />

            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.sm }} />
          </View>
        </View>
      </KeyboardAvoidingView>
      </>}
    </BottomSheetModal>
  );
}
