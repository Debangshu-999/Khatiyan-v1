import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";
import { EMPTY_ART_FOR_PICTURE, EMPTY_TONE, type EmptyArt } from "@/components/empty-art";
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
  /** Visual gap between an image artwork and the title block. */
  artworkTextGap?: number;
  icon?: ComponentType<LucideProps>;
  title: string;
  /** Legacy helper copy is accepted for callers, but empty states now show only their title. */
  description?: string;
  action?: ReactNode;
  /**
   * Sits in the middle of the space the list would have filled. Off for empties
   * that share a screen with real content, where half a viewport of air reads
   * as the screen having failed rather than the list being empty.
   */
  compact?: boolean;
  /**
   * The height of a footer pinned under it. Given, it centres in the room between
   * where it starts and that footer, rather than on the whole screen.
   */
  footerHeight?: number;
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
export function EmptyState({ action, artwork, artworkNode, artworkTextGap = spacing.sm, compact, footerHeight, icon: Icon, title }: EmptyStateProps) {
  const { colors, fonts } = useTheme();
  const anchor = useRef<View>(null);
  const [centredHeight, setCentredHeight] = useState(0);
  // Hidden until it knows where the centre is, so it never shows high and then
  // drops into place as a screen opens (user, 2026-11-09). A compact one has
  // nothing to measure and shows at once.
  const [placed, setPlaced] = useState(Boolean(compact));
  useEffect(() => {
    // Never left invisible: if the measurement does not come back, show it anyway.
    if (placed) return undefined;
    const timer = setTimeout(() => setPlaced(true), 300);
    return () => clearTimeout(timer);
  }, [placed]);

  // In the middle of the screen itself, on every screen (user, 2026-11-01). The
  // middle of the room below the header read as too low on a phone. From where it
  // starts, this height puts its centre on the screen's centre. 46 percent is the
  // floor until that is measured, and when too much sits above it to reach the centre.
  const floor = Math.round(Dimensions.get("window").height * 0.46);
  const minHeight = compact ? undefined : footerHeight != null ? centredHeight : Math.max(floor, centredHeight);

  function measureCentre() {
    if (compact) return;
    anchor.current?.measureInWindow((_x, y) => {
      const screen = Dimensions.get("window").height;
      setCentredHeight(Math.round(footerHeight != null ? screen - footerHeight - y : screen - 2 * y));
      setPlaced(true);
    });
  }

  return (
    <View
      onLayout={measureCentre}
      ref={anchor}
      style={{
        alignItems: "center",
        gap: spacing.md,
        justifyContent: "center",
        minHeight,
        opacity: placed ? 1 : 0,
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
      ) : artwork && EMPTY_ART_FOR_PICTURE.has(artwork) ? (
        // The old picture's vector redraw, in the one empty-state tone (user, 2026-11-14).
        <View style={{ marginBottom: artworkTextGap - spacing.md - 18, marginTop: -10 }}>
          {renderEmptyArt(EMPTY_ART_FOR_PICTURE.get(artwork)!)}
        </View>
      ) : artwork ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={artwork}
          style={{ height: 132, marginBottom: artworkTextGap - spacing.md, width: 132 }}
        />
      ) : Icon ? (
        <View style={{ alignItems: "center", justifyContent: "center", marginBottom: -spacing.xs }}>
          <Icon color={EMPTY_TONE.deep} size={46} strokeWidth={1.6} />
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
      </View>

      {action}
    </View>
  );
}

/** Draws a redraw at the picture slot's size. */
function renderEmptyArt(Art: EmptyArt) {
  return <Art size={132} />;
}
