import { useRef } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ban, FileText } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { selectHaptic } from "@/lib/haptics";
import { messageStamp } from "@/features/chat/chat-time";
import type { ChatMessage } from "@/store/services/chat-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * How much of the row one bubble may take.
 *
 * <p>Kept well under the full width so the side a message came from is legible
 * at a glance: a bubble that reaches nearly edge to edge has no visible margin
 * to be aligned against, and a column of them reads as one block of text rather
 * than a conversation.
 */
const MAX_BUBBLE_WIDTH = "58%";

/**
 * How dark a held message goes.
 *
 * <p>An ink wash rather than a surface colour. The chat sits on #FAFAFB and
 * every grey in the palette is within a few points of it, so a swap to one of
 * them is invisible in daylight — the highlight has to be a shade the
 * background does not already contain.
 */
const SELECTION_TINT = "rgba(15, 23, 42, 0.14)";

/**
 * The outgoing bubble's border and stamp.
 *
 * <p>The fill itself is `colors.jadeSoft` — the palette already has a pale
 * green wash and a second one invented here would drift from it. These two are
 * the shades that sit on top of it: `jade` proper is too saturated for a
 * hairline and far too heavy for a 10px timestamp.
 */
const MINE_BORDER = "#CFEBD9";
const MINE_STAMP = "#5C9E7A";

const BUBBLE_RADIUS = 16;

/**
 * The tail corner.
 *
 * <p>Not zero. A square corner reads as a rendering fault next to three
 * generously rounded ones; a small radius reads as a deliberate point.
 */
const TAIL_RADIUS = 5;

/**
 * How many thumbnails a multi-image message shows.
 *
 * <p>Three, because the bubble is only 58% of the screen wide: a fourth tile
 * takes each one below the size at which you can tell what it is a picture of,
 * and the count chip already says how many are really there.
 */
const FRAME_TILES = 3;

/**
 * One message.
 *
 * <p>Nobody is named and nobody's face appears. Side is carried by alignment
 * alone, and the header already says who the conversation is with — a name or
 * an avatar against every bubble is the same fact repeated down the screen.
 *
 * <p>The receipt is derived, never stored: reading is sequential, so the other
 * side's position implies every message at or below it. {@code seenBy} is that
 * comparison, done at render.
 */
/** Where a held message sits on screen, so a menu can open beside it. */
export type MessageAnchor = { height: number; y: number };

export function MessageBubble({
  message,
  onLongPress,
  onOpenFile,
  onOpenImage,
  pending,
  seenBy,
  selected,
  tail,
}: {
  message: ChatMessage;
  /** Receives the row's position in window coordinates. */
  onLongPress?: (anchor: MessageAnchor) => void;
  /**
   * Opens the full-screen viewer at the tapped picture.
   *
   * <p>The index matters even from the frame: someone who taps the third
   * thumbnail wants the third picture, not the first one with two swipes to go.
   */
  onOpenImage?: (index: number) => void;
  /** Hands a document to whatever app on the device reads it. */
  onOpenFile?: (attachment: ChatMessage["attachments"][number]) => void;
  /**
   * Held open by the action menu.
   *
   * <p>The highlight spans the whole row, not the bubble: it has to be obvious
   * which message the menu is about, and a tint that stops at the bubble's edge
   * is easy to mistake for the bubble's own colour.
   */
  selected?: boolean;
  /**
   * Draws the pointed corner, on the speaker's side.
   *
   * <p>Set on the message that opens a run and on no other, so a block of
   * consecutive messages from one person reads as one utterance with a single
   * point of origin rather than as several separate interruptions.
   */
  tail?: boolean;
  /** Sent but not yet acknowledged by the server. */
  pending?: boolean;
  /**
   * How many people on the other side have read this one. Undefined on inbound
   * messages, where a receipt would be telling you what you already know.
   */
  seenBy?: number;
}) {
  const { colors, fonts, type } = useTheme();
  const bubbleRef = useRef<View>(null);
  const mine = message.mine;
  const attachmentsOnly = message.attachments.length > 0 && !message.body;
  /**
   * Opens the action menu, from wherever inside the row it was held.
   *
   * <p>Shared with the picture and document children. A `Pressable` that
   * handles a tap also claims the long press on itself, so without this the one
   * gesture that reaches Delete stopped working on exactly the messages that
   * have something to delete.
   */
  const handleLongPress = () => {
    // The bubble, not the row around it. The row also contains the "Seen" line
    // underneath, and measuring that pushed the menu down by its height —
    // leaving a gap under exactly the message most likely to be held, since the
    // receipt only appears on the newest one.
    bubbleRef.current?.measureInWindow((_x, y, _width, height) => {
      selectHaptic();
      onLongPress?.({ height, y });
    });
  };

  const images = message.attachments.filter((attachment) => attachment.kind === "IMAGE");
  const files = message.attachments.filter((attachment) => attachment.kind === "FILE");
  const seen = mine && !pending && seenBy !== undefined && seenBy > 0;

  return (
    <AnimatedPressable
      accessibilityRole="text"
      disabled={!onLongPress}
      onLongPress={handleLongPress}
      style={{
        alignItems: mine ? "flex-end" : "flex-start",
        backgroundColor: selected ? SELECTION_TINT : "transparent",
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
      }}
    >
      <View style={{ alignItems: mine ? "flex-end" : "flex-start", maxWidth: MAX_BUBBLE_WIDTH }}>
        {/* `collapsable={false}` keeps this a real view on Android so it can be
            measured; the menu needs its position in WINDOW coordinates, and a
            layout offset inside a ScrollView says nothing about where it
            currently is on screen. AnimatedPressable does not forward a ref, so
            the measurement is taken here rather than on the pressable. */}
        <View
          collapsable={false}
          ref={bubbleRef}
          style={{
            // Green for what you said, white for what was said to you.
            // Alignment carries the same fact, but only once a thread is wide
            // enough to have two visible margins — on a narrow screen, or
            // against a run of short messages, the two columns sit close enough
            // that colour is what separates them at a glance.
            backgroundColor: mine ? colors.jadeSoft : colors.surface,
            borderColor: mine ? MINE_BORDER : colors.border,
            // All four stated, because a `borderRadius` shorthand sitting
            // beside two specific corners is a rule that depends on which one
            // the platform applies last.
            borderBottomLeftRadius: tail && !mine ? TAIL_RADIUS : BUBBLE_RADIUS,
            borderBottomRightRadius: tail && mine ? TAIL_RADIUS : BUBBLE_RADIUS,
            borderCurve: "continuous",
            borderTopLeftRadius: BUBBLE_RADIUS,
            borderTopRightRadius: BUBBLE_RADIUS,
            borderWidth: 1,
            gap: 4,
            // Text bubbles hug their words; an attached image cannot, because
            // its own width is a percentage of the parent it would be sizing.
            minWidth: message.attachments.length > 0 ? 210 : undefined,
            paddingHorizontal: attachmentsOnly ? 5 : 10,
            paddingVertical: attachmentsOnly ? 5 : 6,
          }}
        >
          {images.length === 1 ? (
            <Pressable
              accessibilityLabel="Open image"
              accessibilityRole="button"
              onLongPress={handleLongPress}
              onPress={() => onOpenImage?.(0)}
            >
              <Image
                source={{ uri: images[0].url }}
                style={{
                  aspectRatio: 4 / 3,
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 12,
                  width: "100%",
                }}
              />
            </Pressable>
          ) : null}

          {images.length > 1 ? (
            <View style={{ flexDirection: "row", gap: 3 }}>
              {images.slice(0, FRAME_TILES).map((attachment, at) => (
                <Pressable
                  accessibilityLabel={`Open image ${at + 1} of ${images.length}`}
                  accessibilityRole="button"
                  key={attachment.id}
                  onLongPress={handleLongPress}
                  onPress={() => onOpenImage?.(at)}
                  style={{ flex: 1 }}
                >
                  <Image
                    source={{ uri: attachment.url }}
                    style={{
                      aspectRatio: 1,
                      backgroundColor: colors.surfaceSunken,
                      // Square-ish tiles: the outer corners follow the bubble,
                      // the inner ones stay tight so the three read as one
                      // frame rather than three separate pictures.
                      borderBottomLeftRadius: at === 0 ? 10 : 3,
                      borderBottomRightRadius: at === Math.min(images.length, FRAME_TILES) - 1 ? 10 : 3,
                      borderTopLeftRadius: at === 0 ? 10 : 3,
                      borderTopRightRadius: at === Math.min(images.length, FRAME_TILES) - 1 ? 10 : 3,
                      width: "100%",
                    }}
                  />
                </Pressable>
              ))}

              {/* The real count, not "+N more". The frame is a preview of a set
                  and the reader needs its size, which is not the same number as
                  the tiles they cannot see. */}
              <View
                pointerEvents="none"
                style={{
                  backgroundColor: "rgba(0,0,0,0.55)",
                  borderRadius: 999,
                  bottom: 5,
                  paddingHorizontal: spacing.xs + 1,
                  paddingVertical: 2,
                  position: "absolute",
                  right: 5,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontFamily: fonts.sans, fontSize: 10.5 }}>
                  {images.length} images
                </Text>
              </View>
            </View>
          ) : null}

          {files.map((attachment) => (
            <Pressable
              accessibilityLabel={`Open ${attachment.fileName ?? "document"}`}
              accessibilityRole="button"
              key={attachment.id}
              onLongPress={handleLongPress}
              onPress={() => onOpenFile?.(attachment)}
              style={{
                alignItems: "center",
                borderColor: colors.border,
                borderRadius: 10,
                borderWidth: 1,
                flexDirection: "row",
                gap: spacing.xs,
                padding: spacing.xs,
              }}
            >
              <FileText color={colors.inkSoft} size={18} strokeWidth={2.2} />
              <Text
                numberOfLines={1}
                style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.sans, fontSize: 13 }}
              >
                {attachment.fileName ?? "Document"}
              </Text>
            </Pressable>
          ))}

          {/* Text and stamp share a wrapping row, so the time tucks onto the
              end of the last line when it fits and drops beneath, right-aligned,
              when it does not. A stamp on its own line under every message adds
              a row of height to each one and pushes the conversation apart.

              `marginLeft: "auto"` costs nothing while the bubble is hugging a
              short message — there is no slack to absorb — and right-aligns the
              stamp once a long message has pushed the row out to MAX_BUBBLE_WIDTH. */}
          <View style={{ alignItems: "flex-end", flexDirection: "row", flexWrap: "wrap" }}>
            {/* The family is what sets the weight here, not `fontWeight`.
                Unnamed, this fell back to the platform face — Roboto on
                Android, which is visibly heavier than Inter at the same size
                and made the device look bolder than the web. */}
            {message.body ? (
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.sans,
                  fontSize: 14.5,
                  lineHeight: 20,
                }}
              >
                {message.body}
              </Text>
            ) : null}

            {message.deleted ? (
              <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
                <Ban color={colors.muted} size={13} strokeWidth={2.2} />
                {/* fontFamily deliberately cleared. Android does NOT synthesise
                    an italic for a named family — it needs a real italic file,
                    and no Inter Italic is loaded — so `fontStyle` against
                    type.caption's Inter Medium silently did nothing. Dropping
                    the family lets the system face slant it. Loading an Inter
                    Italic for two words was the alternative. */}
                <Text
                  style={[
                    type.caption,
                    { color: colors.muted, fontFamily: undefined, fontStyle: "italic" },
                  ]}
                >
                  Message deleted
                </Text>
              </View>
            ) : null}

            {/* No delivery word. The stamp is the confirmation: a message that
                failed to send never gets one. */}
            <Text
              numberOfLines={1}
              style={{
                color: mine ? MINE_STAMP : colors.kicker,
                fontFamily: fonts.sans,
                fontSize: 10,
                lineHeight: 20,
                marginLeft: "auto",
                paddingLeft: spacing.sm,
              }}
            >
              {pending ? "Sending" : `${messageStamp(message.sentAt)}${message.edited ? " · Edited" : ""}`}
            </Text>
          </View>
        </View>

        {seen ? (
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.sans,
              fontSize: 10,
              paddingRight: 2,
              paddingTop: 2,
            }}
          >
            {seenBy === 1 ? "Seen" : `Seen by ${seenBy}`}
          </Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}
