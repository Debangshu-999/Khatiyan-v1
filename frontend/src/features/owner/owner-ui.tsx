import { useState, type ComponentType } from "react";
import { Modal, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { ArrowLeft, X, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { tapHaptic } from "@/lib/haptics";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Compact pill that hugs the top of the screen. The negative bottom margin
// cancels most of ScreenScrollView's child gap so the header sits close under
// it instead of leaving a band of dead space.
export function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 30,
        marginBottom: -spacing.sm,
        paddingHorizontal: spacing.sm,
      }}
    >
      <ArrowLeft color={colors.ink} size={15} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700" }} selectable={false}>
        Back
      </Text>
    </AnimatedPressable>
  );
}

export function IconButton({
  accessibilityLabel,
  bordered,
  icon: Icon,
  onPress,
}: {
  accessibilityLabel: string;
  // When true, renders a bordered square that lines up with secondary
  // ActionButtons (same border, radius and 48px height) — used when the
  // icon button sits in an action row alongside them.
  bordered?: boolean;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: bordered ? colors.surface : "transparent",
        borderColor: bordered ? colors.border : "transparent",
        borderRadius: bordered ? 14 : 18,
        borderWidth: bordered ? 1 : 0,
        height: bordered ? 48 : 36,
        justifyContent: "center",
        width: bordered ? 48 : 36,
      }}
    >
      <Icon color={colors.ink} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

export function ActionButton({
  disabled,
  icon: Icon,
  label,
  onPress,
  variant = "primary",
}: {
  disabled?: boolean;
  icon?: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { colors, fonts } = useTheme();
  const primary = variant === "primary";
  const danger = variant === "danger";
  const neutral = variant === "secondary";
  const foreground = disabled ? colors.muted : danger ? colors.danger : neutral ? colors.ink : primary ? colors.onPrimary : colors.primary;
  const backgroundColor = disabled
    ? colors.neutralSoft
    : primary
      ? colors.primary
      : danger || neutral
        ? colors.surface
        : colors.primarySoft;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        // A little physical confirmation when committing an action; quiet
        // secondary buttons stay silent.
        if (primary || danger) {
          tapHaptic();
        }
        onPress();
      }}
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor: danger ? colors.danger : neutral ? colors.borderStrong : "transparent",
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 48,
        opacity: disabled ? 0.65 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {Icon ? <Icon color={foreground} size={16} strokeWidth={2.2} /> : null}
      <Text style={{ color: foreground, fontFamily: fonts.sans, fontSize: 14, fontWeight: "800" }} selectable>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function FormInput({
  autoCapitalize = "sentences",
  error,
  keyboardType,
  label,
  maxLength,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  autoCapitalize?: "characters" | "none" | "sentences" | "words";
  // Inline validation message; tints the field and label red while present.
  error?: string;
  keyboardType?: "decimal-pad" | "number-pad" | "phone-pad";
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [focused, setFocused] = useState(false);
  // Constant border width so focusing never nudges the layout; the colour does
  // the talking — danger wins over focus, focus wins over rest.
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.borderStrong;
  const labelColor = error ? colors.danger : focused ? colors.primary : colors.inkSoft;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: labelColor }]} selectable>
        {label}
      </Text>
      <AppTextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          backgroundColor: colors.surface,
          borderColor,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1.5,
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 15,
          fontWeight: "500",
          minHeight: multiline ? 104 : 50,
          paddingHorizontal: spacing.md,
          paddingVertical: multiline ? spacing.sm : 0,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
      {error ? (
        <Text style={[type.caption, { color: colors.danger }]} selectable>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : colors.borderStrong,
        borderRadius: 999,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 40,
        paddingHorizontal: spacing.md,
        paddingVertical: 9,
      }}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" }} selectable>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function ConfirmDialog({
  confirmLabel = "Confirm",
  destructive,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  confirmLabel?: string;
  destructive?: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 420,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: "600" }} selectable>
            {title}
          </Text>
          <Text style={[type.body, { color: colors.muted }]} selectable>
            {message}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />
            <ActionButton label={confirmLabel} onPress={onConfirm} variant={destructive ? "danger" : "primary"} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatMoneyPaise(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value / 100);
}

export function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const amount = Math.round(Number(trimmed) * 100);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function paiseToRupees(value: number | null | undefined): string {
  if (value == null) {
    return "";
  }
  return String(Math.round(value / 100));
}

export function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}
