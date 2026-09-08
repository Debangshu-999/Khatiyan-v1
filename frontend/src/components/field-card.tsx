import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
// Aliased: this file also imports expo-clipboard as `Clipboard`, and the two
// names would otherwise collide.
import { ChevronRight, Clipboard as ClipboardIcon, Info, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { useToast } from "@/components/toast";
import { CLIPBOARD_ANNOUNCES_ITSELF } from "@/lib/clipboard";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The app's card of stored facts: ruled rows, a muted label, the value under it.
 *
 * <p>
 * Lifted out of the owner's active-tenancy detail screen, where it was written
 * and where the type scale below was settled. The tenant's side had its own
 * version of the same idea in different sizes and weights, so one stay looked
 * like two records depending on which account was reading it. One vocabulary
 * now, and a change to it lands on both sides at once.
 */

/**
 * A card whose rows draw their own padding.
 *
 * <p>Zero padding and no gap, so the rules between rows run the full width of
 * the card and the rows sit flush against them.
 */
export function FlatCard({ children }: PropsWithChildren) {
  return <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>{children}</Card>;
}

/** The hairline between rows, inset so it stops short of the card's corners. */
export function CardRule() {
  return <Divider style={{ marginHorizontal: spacing.lg }} />;
}

export function FieldRow({ children }: PropsWithChildren) {
  return <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>{children}</View>;
}

/**
 * Two fields side by side, split by a vertical rule.
 *
 * <p>The left cell is a fixed 48% rather than flex, so the divider lands in the
 * same place on every pair down the card. Two flexed cells put it wherever the
 * longer value happened to end.
 */
export function FieldPair({ left, right }: { left: ReactNode; right: ReactNode }) {
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ minWidth: 0, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, width: "48%" }}>
        {left}
      </View>
      <View style={{ alignSelf: "stretch", backgroundColor: colors.border, marginVertical: spacing.md, width: 1 }} />
      <View style={{ flex: 1, minWidth: 0, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        {right}
      </View>
    </View>
  );
}

/**
 * A label and its value on one line, in {@link FieldPair}'s two columns.
 *
 * <p>
 * The geometry is copied from the pair on purpose — 48%, a 1pt gutter, then the
 * rest — so the value's left edge lands exactly under the right-hand value of
 * any pair above it. A plain {@link FieldRow} with the value pushed to the right
 * margin put it under nothing, and a card of aligned columns with one row
 * hanging off the edge reads as a mistake rather than as emphasis.
 *
 * <p>
 * No rule down the middle, though the gutter is still there: the columns are
 * borrowed for alignment, and a divider between a label and its own value would
 * be dividing one fact from itself.
 */
export function AlignedFieldRow({
  copyable,
  icon,
  label,
  mono,
  value,
}: {
  /** Adds a copy button beside the LABEL, and a toast confirming the copy. */
  copyable?: boolean;
  icon?: ComponentType<LucideProps>;
  label: string;
  mono?: boolean;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const toast = useToast();

  async function copy() {
    await Clipboard.setStringAsync(value);
    // Silent on Android 13+, which posts its own clipboard confirmation. Two
    // notices for one copy is the same word twice.
    if (!CLIPBOARD_ANNOUNCES_ITSELF) {
      toast.ok(`${label} copied.`);
    }
  }

  return (
    <View style={{ alignItems: "center", flexDirection: "row" }}>
      {/* The button rides with the LABEL, not with the value.
          <p>In the value's cell it was taking 28pt out of a column already
          fixed at 52% of the card, and a 16-character reference code has no
          28pt to give — the code ellipsised, which is the one thing a reference
          code must never do. The label is the short half of the row and has the
          room to spare, the value column stays whole and still starts under the
          value above it, and what the button copies is unambiguous either
          way. */}
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: spacing.xs,
          minWidth: 0,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          width: "48%",
        }}
      >
        <FieldLabel icon={icon} text={label} />
        {copyable ? (
          <AnimatedPressable
            accessibilityLabel={`Copy ${label.toLowerCase()}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              void copy();
            }}
            // A bare glyph. In a ruled row the row is already the container, and
            // a bordered box inside it stood one row's control taller than its
            // neighbours. hitSlop keeps the target honest at this size.
            style={{ alignItems: "center", height: 18, justifyContent: "center", width: 18 }}
          >
            <ClipboardIcon color={colors.primary} size={13} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}
      </View>
      <View style={{ width: 1 }} />
      <View style={{ flex: 1, minWidth: 0, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          numberOfLines={1}
          selectable
          style={{
            color: colors.ink,
            fontFamily: mono ? fonts.mono : fonts.sansBold,
            fontSize: mono ? 13 : 15,
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** The muted caption over — or beside — a value, with its optional glyph. */
function FieldLabel({ icon: Icon, text }: { icon?: ComponentType<LucideProps>; text: string }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 5, minWidth: 0 }}>
      {Icon ? <Icon color={colors.muted} size={13} strokeWidth={2.2} /> : null}
      <Text numberOfLines={1} style={[type.caption, { color: colors.muted, flexShrink: 1 }]}>{text}</Text>
    </View>
  );
}

/**
 * One stored fact: a muted label with the value under it.
 *
 * <p>No box around the value. It used to sit in a bordered, filled well, which
 * read as an input you could type into on a screen where nothing is editable.
 *
 * <p>A row with `onPress` is a doorway and takes a chevron. A row with
 * `onInfoPress` has something to explain instead and takes an ⓘ.
 */
export function ReadonlyField({
  icon,
  label,
  mono,
  onInfoPress,
  onPress,
  prefix,
  status,
  tone = "default",
  value,
}: {
  /**
   * A glyph on the label, naming the KIND of fact.
   *
   * <p>On the label rather than the value: it is a hint about what is being
   * read, and beside the figure it competed with the figure. Muted and small,
   * so a column of them reads as punctuation rather than as a row of buttons.
   */
  icon?: ComponentType<LucideProps>;
  label: string;
  mono?: boolean;
  onInfoPress?: () => void;
  onPress?: () => void;
  /** Sits inside the value row, left of it — the dial code on a phone. */
  prefix?: ReactNode;
  status?: string;
  tone?: "default" | "danger";
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const valueColor = tone === "danger" ? colors.danger : colors.ink;

  const body = (
    <View style={{ gap: spacing.xxs }}>
      <FieldLabel icon={icon} text={label} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 24 }}>
        {prefix}
        <Text
          numberOfLines={1}
          style={{
            color: valueColor,
            flex: 1,
            fontFamily: mono ? fonts.mono : fonts.sansBold,
            // Mono runs smaller. Its glyphs are wider than the sans at the same
            // point size, so a 16-character reference code set at 15 optically
            // outweighed every other value in the card — it read as the headline
            // rather than as the footnote a reference number is. The face and
            // the ink colour still separate it from its muted label.
            fontSize: mono ? 13 : 15,
          }}
        >
          {value}
        </Text>
        {status ? (
          <Text
            style={[
              type.caption,
              { color: status === "Verified" ? colors.jade : colors.muted, fontFamily: fonts.sansBold },
            ]}
          >
            {status}
          </Text>
        ) : null}
        {onInfoPress ? (
          <AnimatedPressable accessibilityLabel={`About ${label.toLowerCase()}`} accessibilityRole="button" hitSlop={10} onPress={onInfoPress}>
            <Info color={colors.kicker} size={15} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}
        {onPress ? <ChevronRight color={colors.kicker} size={16} strokeWidth={2.2} /> : null}
      </View>
    </View>
  );

  if (!onPress) {
    return body;
  }
  return (
    <AnimatedPressable accessibilityRole="button" onPress={onPress}>
      {body}
    </AnimatedPressable>
  );
}
