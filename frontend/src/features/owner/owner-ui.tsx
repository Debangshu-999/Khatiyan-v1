import { useState, type ComponentType } from "react";
import { Modal, Text, View, type ViewStyle } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { ArrowLeft, X, type LucideProps } from "lucide-react-native";
type LucideIcon = ComponentType<LucideProps>;

import { AnimatedPressable } from "@/components/animated-pressable";
import { StatusPill } from "@/components/status-pill";
import { tapHaptic } from "@/lib/haptics";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Marks a screen a manager may read but not change.
 *
 * <p>
 * Mutating controls on these screens are greyed and disabled rather than
 * removed. An absent button is indistinguishable from a feature that does not
 * exist, so the manager cannot tell whether they lack access or misremembered
 * the app — the chip plus a dead button says "this is here, it is not yours".
 */
export function ViewOnlyChip({ style }: { style?: ViewStyle }) {
  return <StatusPill label="View only" style={style} tone="neutral" />;
}

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
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, }}>
        Back
      </Text>
    </AnimatedPressable>
  );
}

export function IconButton({
  accessibilityLabel,
  bordered,
  disabled,
  icon: Icon,
  onPress,
}: {
  accessibilityLabel: string;
  // When true, renders a bordered square that lines up with secondary
  // ActionButtons (same border, radius and 48px height) — used when the
  // icon button sits in an action row alongside them.
  bordered?: boolean;
  // Greyed and inert, matching ActionButton. Needed since view-only permissions
  // landed: an icon button carrying a destructive action has to be able to say
  // "not yours" without vanishing from a row it shares with live controls.
  disabled?: boolean;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: bordered ? colors.surface : "transparent",
        borderColor: bordered ? colors.border : "transparent",
        borderRadius: bordered ? 14 : 18,
        borderWidth: bordered ? 1 : 0,
        height: bordered ? 48 : 36,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        width: bordered ? 48 : 36,
      }}
    >
      <Icon color={disabled ? colors.muted : colors.ink} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

export function ActionButton({
  compact,
  disabled,
  icon: Icon,
  label,
  onPress,
  variant = "primary",
}: {
  /** Tightens padding and type so three buttons fit one row without wrapping. */
  compact?: boolean;
  disabled?: boolean;
  icon?: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline";
}) {
  const { colors, fonts } = useTheme();
  const primary = variant === "primary";
  const danger = variant === "danger";
  const neutral = variant === "secondary";
  // Outlined: no fill at all and a full-strength ink border, matching the
  // outlined-container/ink-glyph treatment used for icons. "secondary" sits on
  // a surface fill with a soft border, which disappears on a card of the same
  // colour and reads as a tinted block rather than a button.
  const outline = variant === "outline";
  const foreground = disabled ? colors.muted : danger ? colors.danger : neutral || outline ? colors.ink : primary ? colors.onPrimary : colors.primary;
  const backgroundColor = disabled
    ? colors.neutralSoft
    : primary
      ? colors.primary
      : outline
        ? "transparent"
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
        // A disabled button still needs an edge. Its fill sits a shade off the
        // page colour, which is invisible on its own and more so inside a
        // PinnedFooter, where the gradient washes the whole strip — the button
        // read as translucent because nothing marked where it stopped.
        borderColor: disabled
          ? colors.borderStrong
          : danger
            ? colors.danger
            : outline
              ? colors.ink
              : neutral
                ? colors.borderStrong
                : "transparent",
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: compact ? spacing.xxs : spacing.xs,
        justifyContent: "center",
        minHeight: compact ? 40 : 48,
        // Disabled is said with colour — pale fill, muted label, visible border —
        // never with opacity. Dropping the whole button to 0.65 let the page
        // scroll through it, and inside a PinnedFooter the button stopped
        // reading as a solid object at all.
        paddingHorizontal: compact ? spacing.xs : spacing.md,
        paddingVertical: compact ? spacing.xs : spacing.sm,
      }}
    >
      {/* The icon must not shrink, or it squashes before the label does. */}
      {Icon ? <Icon color={foreground} size={compact ? 14 : 16} strokeWidth={2.2} style={{ flexShrink: 0 }} /> : null}
      {/* flexShrink lets a long label ("Send verification link") wrap inside the
          button instead of spilling past its padding. Wrapping, not ellipsis:
          a half-read action is worse than a taller button. */}
      <Text
        style={{
          color: foreground,
          flexShrink: 1,
          fontFamily: fonts.sansBold,
          fontSize: compact ? 13 : 14,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * The red asterisk on a mandatory field's label.
 *
 * <p>Nested inside the label's own Text so it sits on the baseline and wraps
 * with it. Hidden from screen readers: `accessibilityLabel` on the field says
 * "required" in words, and a lone "*" read aloud means nothing.
 */
export function RequiredMark({ required }: { required?: boolean }) {
  const { colors } = useTheme();
  if (!required) {
    return null;
  }
  return (
    <Text accessibilityElementsHidden importantForAccessibility="no" style={{ color: colors.danger }}>
      {" *"}
    </Text>
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
  prefix,
  required,
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
  // Fixed adornment rendered INSIDE the field before the text (e.g. "₹" for
  // rupee amounts). Single-line fields only.
  prefix?: string;
  /** Marks the label with a red asterisk. The form still does the validating. */
  required?: boolean;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [focused, setFocused] = useState(false);
  // Constant border width so focusing never nudges the layout; the colour does
  // the talking — danger wins over focus, focus wins over rest.
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.borderStrong;
  const labelColor = error ? colors.danger : focused ? colors.primary : colors.inkSoft;

  const errorText = error ? (
    <Text style={[type.caption, { color: colors.danger }]}>
      {error}
    </Text>
  ) : null;

  if (prefix && !multiline) {
    // The container owns the border; the prefix sits inside it and the input
    // goes borderless, so the ₹ reads as part of the field.
    return (
      <View style={{ gap: 6 }}>
        <Text style={[type.label, { color: labelColor }]}>
          {label}
          <RequiredMark required={required} />
        </Text>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor,
            borderCurve: "continuous",
            borderRadius: 14,
            borderWidth: 1.5,
            flexDirection: "row",
            minHeight: 50,
            paddingLeft: spacing.md,
          }}
        >
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 15, }}>
            {prefix}
          </Text>
          <AppTextInput
            autoCapitalize={autoCapitalize}
            keyboardType={keyboardType}
            maxLength={maxLength}
            onBlur={() => setFocused(false)}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            placeholderTextColor={colors.kicker}
            style={{
              color: colors.ink,
              flex: 1,
              fontFamily: fonts.sansMedium,
              fontSize: 15,
              minHeight: 47,
              paddingHorizontal: spacing.xs,
              paddingVertical: 0,
              textAlignVertical: "center",
            }}
            value={value}
          />
        </View>
        {errorText}
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: labelColor }]}>
        {label}
        <RequiredMark required={required} />
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
          fontFamily: fonts.sansMedium,
          fontSize: 15,
          minHeight: multiline ? 104 : 50,
          paddingHorizontal: spacing.md,
          paddingVertical: multiline ? spacing.sm : 0,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
      {errorText}
    </View>
  );
}

/**
 * One option in a row of them.
 *
 * <p>`square` swaps the blue pill for a hard-edged black block. It exists for
 * the property forms, where a screen of pills reads as a page of badges rather
 * than of controls; the squared-off ink selection matches the tab switcher and
 * the option-picker rows instead. The pill remains the default everywhere else.
 */
export function ChoiceButton({ active, label, onPress, square }: { active: boolean; label: string; onPress: () => void; square?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        backgroundColor: active ? (square ? colors.ink : colors.primary) : colors.surface,
        borderColor: active ? (square ? colors.ink : colors.primary) : colors.borderStrong,
        borderRadius: square ? 0 : 999,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 40,
        paddingHorizontal: spacing.md,
        paddingVertical: 9,
      }}
    >
      <Text style={{ color: active ? (square ? colors.surface : colors.onPrimary) : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * A squared-off status bar: hairline ink border, a thick coloured rule down the
 * inside of the left edge, and an outlined circular icon.
 *
 * <p>No tinted fill. A wash of colour behind a whole block reads as decoration
 * and gets skimmed; the weight sits in the left rule and the ringed glyph
 * instead, which is what carries the state at a glance.
 *
 * <p>Square corners on purpose — these are structural notices, not cards, and
 * the rounded card language elsewhere would make them look dismissible.
 */
export function NoticeBar({
  icon: Icon,
  message,
  title,
  tone = "success",
}: {
  icon: LucideIcon;
  message: string;
  title: string;
  tone?: "success" | "warning" | "danger";
}) {
  const { colors, type } = useTheme();
  const accent =
    tone === "success" ? colors.jade : tone === "warning" ? colors.warningText : colors.danger;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.ink,
        borderRadius: 0,
        borderWidth: 1,
        flexDirection: "row",
      }}
    >
      {/* Inside the border, not a margin — the rule is part of the box. */}
      <View style={{ backgroundColor: accent, width: 5 }} />
      <View
        style={{
          alignItems: "center",
          flex: 1,
          flexDirection: "row",
          gap: spacing.md,
          padding: spacing.md,
        }}
      >
        <View
          style={{
            alignItems: "center",
            borderColor: accent,
            borderRadius: 999,
            borderWidth: 1.5,
            height: 30,
            justifyContent: "center",
            width: 30,
          }}
        >
          <Icon color={accent} size={16} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.eyebrow, { color: accent }]}>
            {title}
          </Text>
          <Text selectable style={[type.caption, { color: colors.ink, lineHeight: 18 }]}>
            {message}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ConfirmDialog({
  acknowledgeOnly,
  bullets,
  confirmLabel = "Confirm",
  destructive,
  footnote,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  /**
   * Renders a single dismiss button instead of Cancel + Confirm.
   *
   * <p>For a dialog that explains rather than asks. Offering "Cancel" against
   * an explanation invites the reader to decline a fact, and leaves them
   * guessing what declining did.
   */
  acknowledgeOnly?: boolean;
  // Consequences worth reading one at a time. A dialog that buries what it is
  // about to do in a paragraph gets dismissed unread, which defeats the point
  // of asking at all.
  bullets?: string[];
  confirmLabel?: string;
  destructive?: boolean;
  // A qualifier that is not itself a consequence — typically what is NOT
  // included, which belongs after the list rather than inside it.
  footnote?: string;
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
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, }}>
            {title}
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>
            {message}
          </Text>

          {bullets?.length ? (
            <View style={{ gap: spacing.xs }}>
              {bullets.map((bullet) => (
                <View key={bullet} style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Text style={[type.body, { color: colors.kicker }]}>
                    •
                  </Text>
                  <Text style={[type.body, { color: colors.ink, flex: 1 }]}>
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {footnote ? (
            <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
              {footnote}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {acknowledgeOnly ? null : <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />}
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
    // Acronyms would otherwise come back title-cased — "PG" as "Pg", "AC" as
    // "Ac" — which reads as a typo in the middle of an otherwise tidy label.
    .map((part) => (ACRONYMS.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

const ACRONYMS = new Set(["ac", "pg"]);

/**
 * A deposit amount as a person would say it.
 *
 * <p>Zero is a real answer — plenty of PGs take none — but "₹0" reads as a
 * missing value or a bug. Saying so in words is the difference between "we ask
 * for nothing" and "we forgot to fill this in".
 */
export function formatDepositPaise(paise: number | null | undefined) {
  if (paise == null || paise <= 0) {
    return "No deposit";
  }
  return formatMoneyPaise(paise);
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
