import { CenterModal } from "@/components/center-modal";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Keyboard, LayoutAnimation, Modal, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Eye, EyeOff, KeyRound, Lock, Pencil, SquarePen, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { StatusIcon } from "@/components/status-icon";
import { errorBody, errorCode, errorMessage } from "@/features/forms/server-error";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// ---------------------------------------------------------------- helpers

// Re-exported so the many auth call sites keep working unchanged.
export { errorBody, errorCode, errorMessage };

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidPhone(value: string) {
  return /^(\+91)?\d{10}$/.test(value.trim());
}

export function isValidPin(value: string) {
  return /^\d{6}$/.test(value);
}

// ---------------------------------------------------------------- surfaces

export function AuthBackground() {
  const { isDark } = useTheme();
  return (
    <LinearGradient
      colors={isDark ? ["#05070B", "#0A0D14", "#111827"] : ["#F7FAFF", "#EEF4FF", "#FFFFFF"]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={{ flex: 1 }}
    />
  );
}

export function AuthCard({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "sunken" }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tone === "sunken" ? colors.surfaceSunken : colors.surface,
        // Flat card, no shadow — a slightly stronger tinted border keeps it
        // legible against the near-white gradient background.
        borderColor: isDark ? colors.border : "rgba(63,110,216,0.22)",
        borderCurve: "continuous",
        borderRadius: 30,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.xl,
      }}
    >
      {children}
    </View>
  );
}

/**
 * The auth screen's refusal dialog.
 *
 * <p>Keeps its status mark, unlike the shared {@link ErrorModal} used by forms
 * elsewhere — the user specified this icon deliberately. See the note at the
 * call site if the two ever need to converge.
 */
/**
 * The auth screen's interrupt.
 *
 * <p>Keeps its status icon, unlike the plain {@code AlertModal} the rest of the
 * app uses — settled deliberately: on a screen with no chrome around it, the
 * mark is what says "this is a refusal" before a word is read.
 */
export function AuthAlertModal({ message, onClose }: { message: string; onClose: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.sm,
            maxWidth: 330,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <StatusIcon tone="error" />
          <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 22, textAlign: "center" }}>
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
              marginTop: spacing.xs,
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

export function StepProgress({ step, total, label }: { step: number; total: number; label?: string }) {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 5 }}>
        {Array.from({ length: total }, (_unused, index) => (
          <View
            key={index}
            style={{
              backgroundColor: index < step ? colors.primary : colors.borderStrong,
              borderRadius: 2,
              flex: 1,
              height: 3,
            }}
          />
        ))}
      </View>
      {label ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12.5, letterSpacing: 0.2 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** Countdown label for the resend button while it is on cooldown, e.g. "23s". */
export function otpTimerLabel(seconds: number) {
  return `${seconds}s`;
}

/** "9876543210" -> "98765 43210" for display. */
export function formatIndianPhone(value: string) {
  const digits = digitsOnly(value);
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

/**
 * Plain "Sent to +91 98765 43210 ✎" line — where the OTP went, with an inline
 * edit action that returns to the previous step (the indirect linkback).
 */
export function PhoneSummaryRow({ phone, onEdit }: { phone: string; onEdit: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, marginTop: -spacing.xs }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 15 }}>
        Sent to
      </Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15, letterSpacing: 0.3 }}>
        +91 {formatIndianPhone(phone)}
      </Text>
      <AnimatedPressable
        accessibilityLabel="Edit phone number"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onEdit}
        style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}
      >
        {/* The square-and-pencil "edit" mark most apps use, in black
            (user, 2026-10-02). */}
        <SquarePen color={colors.ink} size={17} strokeWidth={2.2} />
      </AnimatedPressable>
    </View>
  );
}

/** Grows into spare height between two fields, up to a ceiling. */
export function FieldSpacer() {
  return <View style={{ flexGrow: 1, maxHeight: spacing.xxxl - spacing.md * 2 }} />;
}

/**
 * Six-box OTP entry, copied from the wallet lock's PIN sheet
 * (`WalletPinModal`): the same boxes, the same single hidden input laid over
 * them, and the same keyboard handling (user, 2026-10-02).
 *
 * <p>Typing the sixth digit dismisses the keyboard smoothly and hands the code
 * to {@code onComplete}, so the step verifies itself; its Verify button stays
 * as the fallback. The caller clears {@code value} after a refusal, and the
 * keyboard stays down until a box is tapped, as on the wallet sheet.
 *
 * <p>Unlike the PIN sheet it shows the digits (a texted code is not a secret
 * to the person holding the phone) and opts into SMS autofill.
 */
export function OtpBoxes({
  value,
  onChangeText,
  onComplete,
  busy = false,
  error,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onComplete: (code: string) => void;
  busy?: boolean;
  error?: string;
}) {
  const { colors, fonts } = useTheme();
  const input = useRef<TextInput>(null);
  const active = useRef(true);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyboardOpen = useRef(false);
  const message = error?.trim().replace(/\.+$/, "");

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => {
      keyboardOpen.current = true;
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardOpen.current = false;
    });
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  // Open the keyboard once the step has settled: a request during the screen's
  // own entrance is ignored on Android, as it is during the sheet's opening.
  useEffect(() => {
    active.current = true;
    focusTimer.current = setTimeout(() => { if (active.current) focusBoxes(); }, 300);
    return () => { active.current = false; clearTimeout(focusTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A refusal empties the boxes: drop the keyboard so the message is seen,
  // and let a tap on a box bring it back for the next attempt.
  const previousError = useRef(error);
  useEffect(() => {
    if (error && error !== previousError.current) {
      clearTimeout(focusTimer.current);
      dismissKeyboardSmoothly();
    }
    previousError.current = error;
  }, [error]);

  function focusBoxes() {
    if (busy) return;
    if (input.current?.isFocused() && keyboardOpen.current) return;
    // A dismissed Android keyboard can leave its input focused. Refocusing
    // alone does nothing in that state; reset focus before requesting it.
    input.current?.blur();
    requestAnimationFrame(() => { if (active.current) input.current?.focus(); });
  }

  function dismissKeyboardSmoothly() {
    LayoutAnimation.configureNext({
      duration: 250,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    input.current?.blur();
    Keyboard.dismiss();
  }

  return (
    <View>
      <AnimatedPressable onPress={focusBoxes} accessible={false} style={{ flexDirection: "row", gap: 8 }}>
        {Array.from({ length: 6 }, (_, index) => (
          <View
            key={index}
            style={{
              alignItems: "center",
              backgroundColor: colors.surface,
              borderColor: message ? colors.danger : index === Math.min(value.length, 5) ? colors.ink : colors.borderStrong,
              borderRadius: 9,
              borderWidth: 1.5,
              flex: 1,
              height: 54,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 24 }}>{value[index] ?? ""}</Text>
          </View>
        ))}
      </AnimatedPressable>
      <TextInput
        ref={input}
        accessibilityLabel="Enter six-digit code"
        value={value}
        keyboardType="number-pad"
        showSoftInputOnFocus
        maxLength={6}
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        importantForAutofill="yes"
        autoCorrect={false}
        caretHidden
        onPressIn={focusBoxes}
        style={{ backgroundColor: "transparent", color: "transparent", height: 54, left: 0, opacity: 0.02, position: "absolute", right: 0, top: 0 }}
        onChangeText={(text) => {
          if (busy) return;
          const next = digitsOnly(text).slice(0, 6);
          onChangeText(next);
          if (next.length === 6) {
            dismissKeyboardSmoothly();
            onComplete(next);
          }
        }}
      />
      {message ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger, fontFamily: fonts.sansBold, fontSize: 11, paddingTop: 6 }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- fields

export function AuthTextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none",
  icon: Icon,
  error,
  locked,
  onEdit,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  icon?: ComponentType<LucideProps>;
  error?: string;
  /** Committed: the value is being acted on, so it must not drift under it. */
  locked?: boolean;
  /** Required when locked — a field with no way back is a dead end. */
  onEdit?: () => void;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: locked ? colors.surfaceSunken : colors.surfaceRaised,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          borderCurve: "continuous",
          borderRadius: 8,
          borderWidth: FIELD_BORDER_WIDTH,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 56,
          paddingHorizontal: spacing.lg,
        }}
      >
        <FieldNotch error={error} fill={locked ? colors.surfaceSunken : colors.surfaceRaised} focused={focused} label={label} />
        {Icon ? <Icon color={focused ? colors.primary : colors.kicker} size={19} strokeWidth={2.2} /> : null}
        <AppTextInput
          value={value}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          editable={!locked}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry}
          underlineColorAndroid="transparent"
          style={{
            backgroundColor: "transparent",
            color: locked ? colors.muted : colors.ink,
            flex: 1,
            fontFamily: fonts.sansMedium,
            fontSize: 16,
            paddingVertical: spacing.md,
          }}
        />
        {locked && onEdit ? (
          <AnimatedPressable
            accessibilityLabel={`Edit ${label.toLowerCase()}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onEdit}
            style={{ paddingHorizontal: spacing.xxs, paddingVertical: spacing.xs }}
          >
            <Pencil color={colors.primary} size={17} strokeWidth={2.4} />
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
}

// Phone entry with a fixed India country-code chip. This is a single, real
// TextInput so the caret, selection and Android autofill all behave natively.
// autoComplete="tel" + importantForAutofill="no" stop the keyboard from
// offering "save a password" on what is plainly a phone field.
export function PhoneField({
  label,
  value,
  onChangeText,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 8 }}>
      {/* One box, not two. The dial code is part of the number being typed, so
          boxing it separately read as a second field to fill in — and the gap
          between them broke the line the eye follows while reading the digits
          back. A hairline keeps the two halves legible without splitting them. */}
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          borderCurve: "continuous",
          borderRadius: 8,
          borderWidth: FIELD_BORDER_WIDTH,
          flexDirection: "row",
          minHeight: 56,
          paddingHorizontal: spacing.md,
        }}
      >
        <FieldNotch error={error} fill={colors.surfaceRaised} focused={focused} label={label} />
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Text style={{ fontSize: 18 }}>{String.fromCodePoint(0x1f1ee, 0x1f1f3)}</Text>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
            +91
          </Text>
        </View>
        {/* Shorter than the box so it reads as a separator rather than an inner
            border. Follows the focus/error colour, or the divider stays grey
            through a red field and looks like a rendering fault. */}
        <View
          style={{
            backgroundColor: error ? colors.danger : focused ? colors.primary : colors.borderStrong,
            height: 24,
            marginHorizontal: spacing.md,
            opacity: error || focused ? 0.5 : 1,
            width: 1,
          }}
        />
        <AppTextInput
          value={value}
          onChangeText={(next) => onChangeText(digitsOnly(next).slice(0, 10))}
          autoCapitalize="none"
          autoComplete="tel"
          autoCorrect={false}
          importantForAutofill="no"
          keyboardType="phone-pad"
          maxLength={10}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          placeholder="Enter your phone"
          placeholderTextColor={colors.muted}
          textContentType="telephoneNumber"
          underlineColorAndroid="transparent"
          style={{
            backgroundColor: "transparent",
            color: colors.ink,
            flex: 1,
            fontFamily: fonts.sansBold,
            fontSize: 16,
            letterSpacing: 0.6,
            paddingVertical: spacing.md,
          }}
        />
      </View>
    </View>
  );
}

/** How far the notch rises above the box's inner edge. */
const NOTCH_RISE = 9;
/** Every auth box's border width. */
const FIELD_BORDER_WIDTH = 1.5;
/** Where the border's centre line crosses the notch, measured from its top. */
const NOTCH_SPLIT = NOTCH_RISE - FIELD_BORDER_WIDTH / 2;

/**
 * The field's label, set into its top border (user, 2026-10-02). While the
 * field has an error the message takes the label's place in red, so the notch
 * only ever holds one line.
 *
 * <p>Its ground is split at the border line: the screen colour above, the
 * field's own fill below, so the label reads as cut into the border rather
 * than pasted over it (user, 2026-10-02).
 */
function FieldNotch({ error, fill, focused, label }: { error?: string; fill: string; focused: boolean; label: string }) {
  const { colors, fonts } = useTheme();
  const message = error?.trim().replace(/\.+$/, "");
  return (
    <View pointerEvents="none" style={{ flexDirection: "row", left: 12, position: "absolute", right: 12, top: -NOTCH_RISE }}>
      <View style={{ flexShrink: 1, overflow: "hidden" }}>
        <View style={{ backgroundColor: colors.authSurface, height: NOTCH_SPLIT, left: 0, position: "absolute", right: 0, top: 0 }} />
        <View style={{ backgroundColor: fill, bottom: 0, left: 0, position: "absolute", right: 0, top: NOTCH_SPLIT }} />
        <Text
          accessibilityRole={message ? "alert" : undefined}
          numberOfLines={1}
          style={{
            color: message ? colors.danger : focused ? colors.primary : colors.inkSoft,
            fontFamily: fonts.sansBold,
            fontSize: 11,
            letterSpacing: message ? 0 : 0.3,
            lineHeight: 16,
            paddingHorizontal: 5,
          }}
        >
          {message || label}
        </Text>
      </View>
    </View>
  );
}

// Shared six-digit OTP / PIN entry with validation embedded in its border.
export function CodeField({
  label,
  value,
  onChangeText,
  secureTextEntry,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  error?: string;
}) {
  const { colors, fonts } = useTheme();
  const [showValue, setShowValue] = useState(false);
  const [focused, setFocused] = useState(false);
  const hideValue = Boolean(secureTextEntry && !showValue);
  const Icon = secureTextEntry ? Lock : KeyRound;
  const placeholderText = secureTextEntry ? "Enter 6-digit PIN" : "Enter 6-digit code";

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          borderCurve: "continuous",
          borderRadius: 8,
          borderWidth: FIELD_BORDER_WIDTH,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 56,
          paddingHorizontal: spacing.lg,
        }}
      >
        <FieldNotch error={error} fill={colors.surfaceRaised} focused={focused} label={label} />
        <Icon color={error ? colors.danger : focused ? colors.primary : colors.kicker} size={18} strokeWidth={2.2} />
        <View style={{ flex: 1, justifyContent: "center", minHeight: 56 }}>
          {/* Placeholder yields as soon as the field is focused, not on typing. */}
          {!value && !focused ? (
            <Text
              numberOfLines={1}
              pointerEvents="none"
              style={{
                color: colors.muted,
                fontFamily: fonts.sansBold,
                fontSize: 15,
                left: 4,
                position: "absolute",
                right: 0,
              }}
            >
              {placeholderText}
            </Text>
          ) : null}
          <AppTextInput
            value={value}
            onChangeText={(next) => onChangeText(digitsOnly(next).slice(0, 6))}
            autoComplete={secureTextEntry ? "off" : "sms-otp"}
            importantForAutofill="no"
            keyboardType="number-pad"
            maxLength={6}
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            secureTextEntry={hideValue}
            textContentType={secureTextEntry ? "password" : "oneTimeCode"}
            underlineColorAndroid="transparent"
            style={{
              backgroundColor: "transparent",
              color: colors.ink,
              fontFamily: fonts.sansBold,
              fontSize: 16,
              letterSpacing: 0.6,
              minHeight: 56,
              paddingVertical: 0,
            }}
          />
        </View>
        {secureTextEntry ? (
          <AnimatedPressable
            accessibilityLabel={showValue ? `Hide ${label}` : `Show ${label}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setShowValue((currentValue) => !currentValue)}
            style={{ alignItems: "center", justifyContent: "center", paddingLeft: spacing.xs }}
          >
            {showValue ? (
              <EyeOff color={colors.muted} size={20} strokeWidth={2.1} />
            ) : (
              <Eye color={colors.muted} size={20} strokeWidth={2.1} />
            )}
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
}

export function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.surface : "transparent",
        borderColor: active ? colors.border : "transparent",
        borderCurve: "continuous",
        borderRadius: 13,
        borderWidth: 1,
        flex: 1,
        justifyContent: "center",
        minHeight: 46,
      }}
    >
      <Text
        style={{
          color: active ? colors.primary : colors.muted,
          fontFamily: fonts.sansBold,
          fontSize: 14.5,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------- actions


export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  muted,
  grow,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  muted?: boolean;
  grow?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const filled = !muted && !disabled;
  const textColor = disabled ? colors.neutralText : muted ? colors.primary : "#FFFFFF";

  const content = busy ? (
    <ActivityIndicator color={textColor} />
  ) : (
    <Text
      style={{
        color: textColor,
        fontFamily: fonts.sansBold,
        fontSize: 15.5,
        letterSpacing: 0.4,
      }}
    >
      {label}
    </Text>
  );

  const innerStyle = {
    alignItems: "center" as const,
    borderCurve: "continuous" as const,
    borderRadius: 16,
    justifyContent: "center" as const,
    minHeight: 56,
    paddingHorizontal: spacing.xl,
  };

  return (
    <AnimatedPressable
      onPress={busy || disabled ? undefined : onPress}
      style={{
        alignSelf: "stretch",
        borderCurve: "continuous",
        borderRadius: 16,
        flex: grow ? 1 : undefined,
        width: grow ? undefined : "100%",
      }}
    >
      {filled ? (
        <LinearGradient colors={[colors.primary, colors.primaryDeep]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={innerStyle}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={{
            ...innerStyle,
            backgroundColor: disabled ? colors.neutralSoft : "transparent",
            borderColor: colors.border,
            borderWidth: 1.5,
          }}
        >
          {content}
        </View>
      )}
    </AnimatedPressable>
  );
}

/**
 * A secondary route out of the current step, as an outlined chip.
 *
 * <p>These used to be plain text links stacked under the primary button, where
 * they read as equal alternatives to it. A chip is quiet until you are looking
 * for it and unmistakable once you are — which is what a side door should be.
 */
export function AuthChipLink({
  align = "center",
  icon: Icon,
  label,
  onPress,
}: {
  /** "end" lines the chip up with the right edge of the field above it. */
  align?: "center" | "end" | "auto";
  icon?: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        alignSelf: align === "end" ? "flex-end" : align === "auto" ? "auto" : "center",
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      {Icon ? <Icon color={colors.kicker} size={14} strokeWidth={2.2} /> : null}
      <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12.5 }}>{label}</Text>
    </AnimatedPressable>
  );
}

export function LinkButton({ label, onPress, center, muted }: { label: string; onPress: () => void; center?: boolean; muted?: boolean }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable onPress={onPress} style={{ alignSelf: center ? "center" : "auto", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}>
      <Text
        style={{
          color: muted ? colors.muted : colors.primary,
          fontFamily: fonts.sansBold,
          fontSize: 13,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
