import type { ComponentType } from "react";
import { Modal, Text, TextInput, View } from "react-native";
import { ArrowLeft, X, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      onPress={onPress}
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 36,
        paddingHorizontal: spacing.sm,
      }}
    >
      <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700" }} selectable>
        Back
      </Text>
    </AnimatedPressable>
  );
}

export function IconButton({
  accessibilityLabel,
  icon: Icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{ alignItems: "center", borderRadius: 18, height: 36, justifyContent: "center", width: 36 }}
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
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor: danger || neutral ? colors.border : "transparent",
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
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: "decimal-pad" | "number-pad" | "phone-pad";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
        {label}
      </Text>
      <TextInput
        autoCapitalize="none"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          color: colors.ink,
          minHeight: multiline ? 96 : 46,
          paddingHorizontal: spacing.md,
          paddingVertical: multiline ? spacing.sm : 0,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
    </View>
  );
}

export function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "800" }} selectable>
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
