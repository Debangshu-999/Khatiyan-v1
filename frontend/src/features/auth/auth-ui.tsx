import { useState, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Eye, EyeOff, KeyRound, Lock, Pencil, Phone, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// ---------------------------------------------------------------- helpers

/** Plain-language fallback for a response that carried no usable message. */
function statusMessage(status: number) {
  if (status === 401 || status === 403) {
    return "You do not have access to do that.";
  }
  if (status === 404) {
    return "We could not find what you asked for.";
  }
  if (status === 408 || status === 504) {
    return "That took too long. Check your connection and try again.";
  }
  if (status === 429) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (status >= 500) {
    return "Something went wrong at our end. Please try again.";
  }
  return "Please check the details and try again.";
}

export function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: { message?: string } }).data;
    if (data?.message) {
      return data.message;
    }
  }

  if (typeof error === "object" && error && "status" in error) {
    const queryError = error as { status?: unknown; error?: unknown; data?: unknown };
    if (queryError.status === "TIMEOUT_ERROR") {
      return "The server took too long to respond. Check your connection and try again.";
    }
    if (queryError.status === "FETCH_ERROR") {
      return "Could not reach the backend. If you are on Expo Go, use the detected laptop URL.";
    }
    if (queryError.status === "PARSING_ERROR") {
      return "Backend responded, but the app could not read the response.";
    }
    if (typeof queryError.status === "number") {
      if (typeof queryError.data === "object" && queryError.data && "message" in queryError.data) {
        const message = (queryError.data as { message?: unknown }).message;
        if (typeof message === "string") {
          return message;
        }
      }
      // A body that came back as plain text rather than our ErrorResponse
      // shape — a proxy page, a gateway error, a filter that rejected before
      // the handler ran. Still more use to the reader than a status code.
      if (typeof queryError.data === "string" && queryError.data.trim()) {
        return queryError.data.trim();
      }
      // Last resort. Never show a raw HTTP status: it tells the person nothing
      // they can act on and reads like the app broke. Say what it means.
      return statusMessage(queryError.status);
    }
    if (typeof queryError.error === "string") {
      return queryError.error;
    }
  }

  // A plain Error is OUR bug, not the server's — a TypeError, a storage
  // failure, a bad assumption. Its message is written for whoever is reading
  // the stack trace, not for the person holding the phone, and shipping it to a
  // toast has already put "Cannot read properties of null" in front of a user.
  // Keep it in the console where it is useful; say something actionable on
  // screen.
  if (error instanceof Error) {
    console.warn("Unexpected client error surfaced to the user", error);
    return "Something went wrong. Please try again.";
  }

  return "Something went wrong. Please try again.";
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidPhone(value: string) {
  return /^(\+91)?\d{10}$/.test(value.trim());
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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

export function FieldLabel({ children }: { children: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 12.5, letterSpacing: 0.3 }}>
      {children}
    </Text>
  );
}

export function StepBadge({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: colors.primarySoft,
        borderCurve: "continuous",
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: colors.primaryDeep, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {text}
      </Text>
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
        <Pencil color={colors.primary} size={16} strokeWidth={2.4} />
      </AnimatedPressable>
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  icon?: ComponentType<LucideProps>;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: focused ? colors.primary : colors.border,
          borderCurve: "continuous",
          borderRadius: 16,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 56,
          paddingHorizontal: spacing.lg,
        }}
      >
        {Icon ? <Icon color={focused ? colors.primary : colors.kicker} size={19} strokeWidth={2.2} /> : null}
        <AppTextInput
          value={value}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry}
          underlineColorAndroid="transparent"
          style={{
            backgroundColor: "transparent",
            color: colors.ink,
            flex: 1,
            fontFamily: fonts.sansMedium,
            fontSize: 16,
            paddingVertical: spacing.md,
          }}
        />
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1.5,
            flexDirection: "row",
            gap: 6,
            justifyContent: "center",
            minHeight: 56,
            paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ fontSize: 18 }}>{String.fromCodePoint(0x1f1ee, 0x1f1f3)}</Text>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15, }}>
            +91
          </Text>
        </View>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceRaised,
            borderColor: focused ? colors.primary : colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1.5,
            flex: 1,
            flexDirection: "row",
            gap: spacing.sm,
            minHeight: 56,
            paddingHorizontal: spacing.lg,
          }}
        >
          <Phone color={focused ? colors.primary : colors.kicker} size={18} strokeWidth={2.2} />
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
    </View>
  );
}

// Six-digit OTP / PIN entry. The placeholder is a separate overlay because the
// filled state uses wide letter-spaced mono digits which would distort a hint.
export function CodeField({
  label,
  value,
  onChangeText,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const [showValue, setShowValue] = useState(false);
  const [focused, setFocused] = useState(false);
  const hideValue = Boolean(secureTextEntry && !showValue);
  const Icon = secureTextEntry ? Lock : KeyRound;
  const placeholderText = secureTextEntry ? "Enter 6-digit PIN" : "Enter 6-digit code";

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: focused ? colors.primary : colors.border,
          borderCurve: "continuous",
          borderRadius: 16,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 56,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Icon color={focused ? colors.primary : colors.kicker} size={18} strokeWidth={2.2} />
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
              fontFamily: value ? fonts.mono : fonts.sans,
              fontSize: value ? 21 : 15,
              fontVariant: ["tabular-nums"],
              fontWeight: "700",
              letterSpacing: value ? 9 : 0,
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
