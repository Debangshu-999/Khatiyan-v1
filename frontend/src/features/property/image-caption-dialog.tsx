import { useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { ActionButton } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Matches PropertyImage.MAX_CAPTION_LENGTH, which the request also validates. */
const MAX_CAPTION_LENGTH = 50;

/** Wide enough to recognise a room, short enough to leave the field on screen. */
const PREVIEW_HEIGHT = 124;

export type CaptionedAsset = {
  caption: string;
  uri: string;
};

/**
 * Asks what each picked photo is a photo OF.
 *
 * <p>A gallery of ten untitled rooms tells a prospect very little — they can see
 * a bed, but not whether it is the room on offer or the common area. The owner
 * knows; nothing asked them until now.
 *
 * <p>A centred dialog rather than a bottom sheet: it asks one short question
 * about one picture, and a sheet rising to fill the screen is the shape for a
 * form. Several photos slide in a carousel, the same shape rooms and beds uses,
 * with one caption field bound to whichever is showing — a column of thumbnails
 * each with its own input is a worse look at every photo and a longer form.
 */
export function ImageCaptionDialog({
  confirmLabel,
  initialCaptions,
  onCancel,
  onDone,
  uris,
}: {
  /** Overrides "Add photo" — editing an existing one says "Save". */
  confirmLabel?: string;
  /** Prefilled when editing; empty when captioning a fresh pick. */
  initialCaptions?: string[];
  onCancel: () => void;
  onDone: (assets: CaptionedAsset[]) => void;
  uris: string[];
}) {
  const { colors, fonts, type } = useTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);
  const [index, setIndex] = useState(0);
  const [captions, setCaptions] = useState<string[]>(() => uris.map((_unused, at) => initialCaptions?.[at] ?? ""));

  // Measured rather than percentage-based: a paging list needs an exact page
  // width, and "100%" inside a maxWidth card is not a number it can page on.
  const cardWidth = Math.min(340, width - spacing.lg * 2);
  const pageWidth = Math.max(cardWidth - spacing.lg * 2, 1);

  const caption = captions[index] ?? "";
  const many = uris.length > 1;

  function setCaption(next: string) {
    setCaptions((current) => current.map((value, at) => (at === index ? next.slice(0, MAX_CAPTION_LENGTH) : value)));
  }

  return (
    // No statusBarTranslucent: it extends the modal window under the Android
    // system bars, and the KeyboardAvoidingView then measures the keyboard
    // against a taller frame than the one it pads — the dialog rises and never
    // comes back down.
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.overlay,
            flex: 1,
            justifyContent: "center",
            padding: spacing.lg,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderCurve: "continuous",
              borderRadius: 20,
              borderWidth: 1,
              gap: spacing.md,
              padding: spacing.lg,
              width: cardWidth,
            }}
          >
            {/* The question is the title however many photos there are — it is
                what the dialog is asking. Which photo you are on is a position,
                and belongs with the dots that show it. */}
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.2 }}>
              What is this photo of?
            </Text>

            <View style={{ height: PREVIEW_HEIGHT, width: pageWidth }}>
            <FlatList
              data={uris}
              decelerationRate="fast"
              getItemLayout={(_unused, at) => ({ index: at, length: pageWidth, offset: pageWidth * at })}
              horizontal
              keyExtractor={(uri, at) => `${uri}-${at}`}
              onMomentumScrollEnd={(event) => {
                const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
                setIndex(Math.max(0, Math.min(next, uris.length - 1)));
              }}
              pagingEnabled
              ref={listRef}
              renderItem={({ item }) => (
                <View style={{ width: pageWidth }}>
                  <Image
                    resizeMode="cover"
                    source={{ uri: item }}
                    style={{
                      backgroundColor: colors.surfaceSunken,
                      borderColor: colors.border,
                      borderRadius: 12,
                      borderWidth: 1,
                      height: PREVIEW_HEIGHT,
                      width: pageWidth,
                    }}
                  />
                </View>
              )}
              scrollEnabled={many}
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
              style={{ width: pageWidth }}
            />

            {/* Over the photo, along its bottom edge — where a carousel puts its
                position. On a solid pill, because the dots lie on a photograph
                that could be any colour. */}
            {many ? (
              <View
                accessibilityRole="adjustable"
                accessibilityValue={{ max: uris.length, min: 1, now: index + 1 }}
                pointerEvents="none"
                style={{
                  alignItems: "center",
                  alignSelf: "center",
                  backgroundColor: colors.surface,
                  borderRadius: 999,
                  bottom: spacing.xs,
                  flexDirection: "row",
                  gap: spacing.xs,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 5,
                  position: "absolute",
                }}
              >
                {uris.map((uri, at) => (
                  <View
                    key={`${uri}-${at}`}
                    style={{
                      backgroundColor: at === index ? colors.ink : colors.border,
                      borderRadius: 999,
                      height: 6,
                      width: at === index ? 18 : 6,
                    }}
                  />
                ))}
              </View>
            ) : null}
            </View>

            {many ? (
              <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
                {index + 1} of {uris.length}
              </Text>
            ) : null}

            <View style={{ gap: spacing.xs }}>
              {/* Label and count share the line: the count belongs to this field
                  and reads as a footnote to it, not as a status of the dialog. */}
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
                  Caption
                </Text>
                <Text
                  style={[
                    type.caption,
                    { color: caption.length === MAX_CAPTION_LENGTH ? colors.warningText : colors.kicker },
                  ]}
                >
                  {caption.length}/{MAX_CAPTION_LENGTH}
                </Text>
              </View>
              <TextInput
                maxLength={MAX_CAPTION_LENGTH}
                onChangeText={setCaption}
                placeholder="Double room, dining, exterior…"
                placeholderTextColor={colors.kicker}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 12,
                  borderWidth: 1,
                  color: colors.ink,
                  fontFamily: fonts.sansMedium,
                  fontSize: 15,
                  minHeight: 46,
                  paddingHorizontal: spacing.md,
                }}
                value={caption}
              />
            </View>

            {/* Captions are optional and this says so, rather than a Skip button
                beside Add: with a carousel there is nothing to skip PAST — not
                typing is already skipping. */}
            <Text style={[type.caption, { color: colors.muted }]}>
              {many
                ? "Slide to caption each photo. Captions are optional."
                : "Optional — it helps prospects tell your photos apart."}
            </Text>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />
              <ActionButton
                label={confirmLabel ?? (many ? "Add photos" : "Add photo")}
                onPress={() => onDone(uris.map((uri, at) => ({ caption: captions[at]?.trim() ?? "", uri })))}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
