import { useState, type ComponentType } from "react";
import { Modal, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { statusTonePalette, type StatusTone } from "@/components/status-icon";
import { ArrowLeft, X, type LucideProps } from "lucide-react-native";
type LucideIcon = ComponentType<LucideProps>;

import { AnimatedPressable } from "@/components/animated-pressable";
import { StatusPill } from "@/components/status-pill";
import { tapHaptic } from "@/lib/haptics";
import { DIALOG_MAX_WIDTH, radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { useIsSkeleton } from "@/components/skeleton-boundary";

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
  filled,
  icon: Icon,
  onPress,
}: {
  accessibilityLabel: string;
  // When true, renders a bordered square that lines up with secondary
  // ActionButtons (same border, radius and 48px height) — used when the
  // icon button sits in an action row alongside them.
  bordered?: boolean;
  // A sunken disc behind the glyph, for an icon button that sits ON a form
  // rather than in a header — a clear button beside a field, a close on a card.
  // Without a ground of its own a bare glyph next to an input reads as part of
  // the input, and there is nothing to aim at.
  filled?: boolean;
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
        backgroundColor: bordered ? colors.surface : filled ? colors.surfaceSunken : "transparent",
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
  /**
   * "danger" is the outlined red used inline, where a destructive control sits
   * among others and must not shout. "dangerFilled" is for a confirmation
   * dialog, where it is the answer to a question already asked and the weight
   * is the point.
   */
  variant?: "primary" | "secondary" | "danger" | "outline" | "dangerFilled";
}) {
  const { colors, fonts } = useTheme();
  const primary = variant === "primary";
  const dangerFilled = variant === "dangerFilled";
  const danger = variant === "danger";
  const neutral = variant === "secondary";
  // Outlined: no fill at all and a full-strength ink border, matching the
  // outlined-container/ink-glyph treatment used for icons. "secondary" sits on
  // a surface fill with a soft border, which disappears on a card of the same
  // colour and reads as a tinted block rather than a button.
  const outline = variant === "outline";
  const foreground = disabled
    ? colors.muted
    : dangerFilled
      ? "#FFFFFF"
      : danger
        ? colors.danger
        : neutral || outline
          ? colors.ink
          : primary
            ? colors.onPrimary
            : colors.primary;
  // A ghost screen must not carry a live-looking control. Same footprint, so
  // the layout it reserves is exact — only the fill and the label go.
  const isSkeleton = useIsSkeleton();
  const backgroundColor = disabled
    ? colors.neutralSoft
    : dangerFilled
      ? colors.danger
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
        if (primary || danger || dangerFilled) {
          tapHaptic();
        }
        onPress();
      }}
      style={{
        alignItems: "center",
        backgroundColor: isSkeleton ? colors.surfaceSunken : backgroundColor,
        // A disabled button still needs an edge. Its fill sits a shade off the
        // page colour, which is invisible on its own and more so inside a
        // PinnedFooter, where the gradient washes the whole strip — the button
        // read as translucent because nothing marked where it stopped.
        borderColor: isSkeleton
          ? "transparent"
          : disabled
          ? colors.borderStrong
          : danger || dangerFilled
            ? colors.danger
            : outline
              ? colors.ink
              : neutral
                ? colors.borderStrong
                : "transparent",
        borderCurve: "continuous",
        // radii.md, the card's own corner. At 14 the buttons were rounder than
        // every card they sit inside, which reads as a pill trying to be a
        // button; squaring them up to the surface they live on makes the two
        // look like one system.
        borderRadius: radii.md,
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
  icon: Icon,
  keyboardType,
  label,
  maxLength,
  multiline,
  onChangeText,
  placeholder,
  prefix,
  radius = 14,
  required,
  value,
  disabled,
}: {
  autoCapitalize?: "characters" | "none" | "sentences" | "words";
  /**
   * Greys the field and refuses input, for an answer that is not yet
   * answerable — a room number before the room type that numbers it.
   *
   * <p>Shown rather than hidden: a field that appears once something else is
   * chosen makes the form jump and hides how much is left to fill in.
   */
  disabled?: boolean;
  // Inline validation message; tints the field and label red while present.
  error?: string;
  /**
   * A glyph on the LABEL line, left of the text.
   *
   * <p>On the label rather than inside the box on purpose: the input then still
   * spans the full width of its column, so a stack of fields shares one left
   * margin instead of each one starting wherever its icon ended.
   */
  icon?: ComponentType<LucideProps>;
  keyboardType?: "decimal-pad" | "number-pad" | "phone-pad";
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  // Fixed adornment rendered INSIDE the field before the text (e.g. "₹" for
  // rupee amounts). Single-line fields only.
  prefix?: string;
  /**
   * Corner radius of the box, for a form that wants a crisper edge than the
   * app's default 14.
   *
   * <p>A prop rather than a new default: changing it here would restyle every
   * form in the app, and only the screen that asked for it should move.
   */
  radius?: number;
  /** Marks the label with a red asterisk. The form still does the validating. */
  required?: boolean;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [focused, setFocused] = useState(false);
  // Constant border width so focusing never nudges the layout; the colour does
  // the talking — danger wins over focus, focus wins over rest.
  const borderColor = disabled
    ? colors.border
    : error
      ? colors.danger
      : focused
        ? colors.primary
        : colors.borderStrong;
  // A slate grey at rest. Near-black competed with the value inside the box —
  // two dark lines stacked, and no way to tell at a glance which was the
  // question. Focus and error still take it over.
  const labelColor = disabled
    ? colors.kicker
    : error
      ? colors.danger
      : focused
        ? colors.primary
        : colors.muted;

  // Built once and rendered by both branches below, so the prefixed and plain
  // forms of this field cannot drift into two different label treatments.
  const labelRow = (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
      {Icon ? <Icon color={labelColor} size={15} strokeWidth={2.2} /> : null}
      <Text style={[type.label, { color: labelColor }]}>
        {label}
        <RequiredMark required={required} />
      </Text>
    </View>
  );

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
        {labelRow}
        <View
          style={{
            alignItems: "center",
            backgroundColor: disabled ? colors.surfaceSunken : colors.surface,
            borderColor,
            borderCurve: "continuous",
            borderRadius: radius,
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
            editable={!disabled}
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
      {labelRow}
      <AppTextInput
        editable={!disabled}
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
          backgroundColor: disabled ? colors.surfaceSunken : colors.surface,
          borderColor,
          borderCurve: "continuous",
          borderRadius: radius,
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
        // Square is the segmented look, and it takes the app's selection green
        // rather than a solid ink slab: a row of these sat on a form as the
        // darkest thing present, pulling the eye to a control instead of to
        // what it was answering. The pill keeps its solid primary — it is a
        // single choice acting as a button, not one segment among several.
        backgroundColor: active ? (square ? colors.jadeSoft : colors.primary) : colors.surface,
        borderColor: active ? (square ? colors.jade : colors.primary) : colors.borderStrong,
        borderRadius: square ? 0 : 999,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 40,
        paddingHorizontal: spacing.md,
        paddingVertical: 9,
      }}
    >
      <Text style={{ color: active && !square ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * A standing notice on the screen: a precaution to read while deciding, not
 * something to dismiss.
 *
 * <p>The tone is carried by one quiet rule on the left. Keeping the title and
 * message in one text column makes longer notices easier to scan and avoids
 * putting a decorative status icon beside every heading.
 */
export function NoticeBar({
  message,
  messageStyle,
  title,
  tone = "success",
}: {
  message: string;
  messageStyle?: TextStyle;
  title: string;
  /** "info" is the blue one: an explanation rather than a precaution. */
  tone?: "success" | "warning" | "danger" | "info";
}) {
  const { colors, fonts, type } = useTheme();
  // "danger" predates the shared tones; it means the same as error.
  const statusTone: StatusTone = tone === "danger" ? "error" : tone;
  const { fill } = statusTonePalette(statusTone, colors);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderLeftColor: fill,
        borderLeftWidth: 4,
        gap: spacing.xs,
        paddingLeft: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 0.8 }}>
        {title}
      </Text>
      <Text selectable style={[type.caption, { color: colors.muted, lineHeight: 18 }, messageStyle]}>
        {message}
      </Text>
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
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onCancel} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: DIALOG_MAX_WIDTH,
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
            <ActionButton
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? "dangerFilled" : "primary"}
            />
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
