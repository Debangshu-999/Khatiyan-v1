import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { AppTextInput } from "@/components/app-text-input";
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
      {/* Expo 56 Android is edge-to-edge, where adjustResize no longer resizes
          the modal window — KeyboardAvoidingView with "padding" is what lifts
          the sheet above the keyboard on BOTH platforms. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              gap: spacing.md,
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

            <CodeBoxes onChange={setOtp} value={otp} />

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

/**
 * Six boxes over one hidden field.
 *
 * <p>Six real inputs would mean six refs, focus juggling on every keystroke and
 * a backspace that has to decide which box it belongs to. One input holds the
 * whole code and the boxes are only a rendering of it, so paste, autofill and
 * the SMS one-tap suggestion all keep working — none of which survive being
 * split across six fields.
 */
function CodeBoxes({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const { colors, fonts } = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const digits = Array.from({ length: CODE_LENGTH }, (_, at) => value[at] ?? "");
  // The box the next digit lands in, so exactly one carries the caret.
  const active = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <Pressable
      accessibilityLabel="Enter the six-digit code"
      onPress={() => input.current?.focus()}
      style={{ flexDirection: "row", gap: spacing.sm }}
    >
      {digits.map((digit, at) => {
        const caret = focused && at === active;

        return (
          <View
            key={at}
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceRaised,
              borderColor: caret ? colors.primary : digit ? colors.ink : colors.borderStrong,
              borderCurve: "continuous",
              borderRadius: 12,
              borderWidth: caret ? 1.8 : 1.2,
              flex: 1,
              height: 54,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 22 }}>
              {digit}
            </Text>
          </View>
        );
      })}

      {/* Invisible rather than unmounted: it has to stay in the tree to hold
          focus and the keyboard. Zero opacity over the boxes, not off-screen,
          because Android will not open the keyboard for a field it considers
          out of view. */}
      <AppTextInput
        autoFocus
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        onBlur={() => setFocused(false)}
        onChangeText={(next) => onChange(next.replace(/[^0-9]/g, ""))}
        onFocus={() => setFocused(true)}
        ref={input}
        style={{
          bottom: 0,
          left: 0,
          opacity: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
        textContentType="oneTimeCode"
        value={value}
      />
    </Pressable>
  );
}
