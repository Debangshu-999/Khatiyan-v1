import type { ComponentType, ReactNode } from "react";
import { Dimensions, Image, Text, View, type ImageSourcePropType } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type EmptyStateProps = {
  /**
   * An illustration drawn in code, shown at the artwork slot's size.
   *
   * <p>For marks that are components rather than files. Takes precedence over
   * both `artwork` and `icon`.
   */
  artworkNode?: ReactNode;
  /**
   * An illustration in place of the line glyph.
   *
   * <p>Wins over {@code icon} when both are given. Screens with artwork of
   * their own use it here so the empty state belongs to the same screen as the
   * header above it, rather than falling back to a generic mark.
   */
  artwork?: ImageSourcePropType;
  icon?: ComponentType<LucideProps>;
  title: string;
  description: string;
  action?: ReactNode;
  /**
   * Sits in the middle of the space the list would have filled. Off for empties
   * that share a screen with real content, where half a viewport of air reads
   * as the screen having failed rather than the list being empty.
   */
  compact?: boolean;
};

/**
 * Nothing to show, said calmly.
 *
 * <p>Centred and unboxed. It used to be a left-aligned sunken Card, which framed
 * absence as a thing — a filled panel announcing a gap — and on screens whose
 * ordinary state IS empty that made every visit look like a problem.
 *
 * <p>There is no eyebrow. Every caller had one ("All clear", "Nothing yet",
 * "Property required") sitting directly above a title that said the same thing
 * in more words.
 */
export function EmptyState({ action, artwork, artworkNode, compact, description, icon: Icon, title }: EmptyStateProps) {
  const { colors, fonts, type } = useTheme();

  // Roughly what is left below a header, filter row and section heading.
  const minHeight = compact ? undefined : Math.round(Dimensions.get("window").height * 0.46);

  return (
    <View
      style={{
        alignItems: "center",
        gap: spacing.md,
        justifyContent: "center",
        minHeight,
        paddingHorizontal: spacing.lg,
        paddingVertical: compact ? spacing.xl : 0,
      }}
    >
      {/* Bigger and closer. With the container's border gone the 58pt box was
          holding a 26pt glyph in the middle of a lot of nothing, and the gap it
          left read as a missing element between the mark and the title it
          belongs to. The icon now fills its own space and sits on the text. */}
      {artworkNode ? (
        // A drawn mark rather than a file — an inline SVG, say. Rendered in the
        // artwork slot, not the icon slot: `icon` is sized for a 46pt lucide
        // glyph, and an illustration at that size is a speck above a heading.
        artworkNode
      ) : artwork ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={artwork}
          style={{ height: 132, marginBottom: -spacing.sm, width: 132 }}
        />
      ) : Icon ? (
        <View style={{ alignItems: "center", justifyContent: "center", marginBottom: -spacing.xs }}>
          <Icon color={colors.ink} size={46} strokeWidth={1.6} />
        </View>
      ) : null}

      <View style={{ alignItems: "center", gap: spacing.xs }}>
        {/* Centred explicitly. alignItems centres the text BOX, which looks
            right until the title wraps — then the second line sets the box to
            full width and the words align left inside it. "No matching deposit
            accounts" wraps on a phone, which is where this showed. */}
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, textAlign: "center" }}>
          {title}
        </Text>
        <Text style={[type.body, { color: colors.muted, maxWidth: 320, textAlign: "center" }]}>
          {description}
        </Text>
      </View>

      {action}
    </View>
  );
}
