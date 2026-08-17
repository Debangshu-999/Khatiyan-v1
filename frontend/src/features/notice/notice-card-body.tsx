import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Paperclip } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Three lines of body at the 22px line height `type.body` uses. */
const BODY_PREVIEW_HEIGHT = 66;

/**
 * The title / clipped body / attachment line shared by every notice card.
 *
 * <p>The body is clipped to a fixed height rather than a line count, so every
 * card in a list is the same size whatever it says. The gradient fades the last
 * line into the card instead of cutting it mid-stroke — a hard crop reads as a
 * rendering fault, a fade reads as "there is more", which is what the tap is
 * for.
 *
 * <p>`surface` must match the card's own background or the fade ends in a band
 * of the wrong colour. Pass the tone the card was built with.
 */
export function NoticeCardBody({
  attachmentCount = 0,
  body,
  onPress,
  surface,
  title,
}: {
  attachmentCount?: number;
  body: string;
  onPress?: () => void;
  surface?: string;
  title: string;
}) {
  const { colors, type } = useTheme();
  const fadeTo = surface ?? colors.surface;

  const content = (
    <>
      <Text numberOfLines={2} style={[type.display, { color: colors.ink, fontSize: 21, lineHeight: 26 }]}>
        {title}
      </Text>

      <View style={{ height: BODY_PREVIEW_HEIGHT, overflow: "hidden" }}>
        <Text style={[type.body, { color: colors.muted }]}>{body}</Text>
        <LinearGradient
          colors={["transparent", fadeTo]}
          pointerEvents="none"
          style={{ bottom: 0, height: 28, left: 0, position: "absolute", right: 0 }}
        />
      </View>

      <AttachmentNote count={attachmentCount} />
    </>
  );

  if (!onPress) {
    return <View style={{ gap: spacing.sm }}>{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ gap: spacing.sm }}>
      {content}
    </Pressable>
  );
}

/**
 * Attachments on a notice.
 *
 * <p>The row renders either way so card heights stay stable — a list where only
 * some cards carry the line jitters as you scroll.
 */
export function AttachmentNote({ count }: { count: number }) {
  const { colors, type } = useTheme();

  if (count === 0) {
    return <Text style={[type.caption, { color: colors.muted, fontStyle: "italic" }]}>No attachments</Text>;
  }

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
      <Paperclip color={colors.kicker} size={13} />
      <Text style={[type.caption, { color: colors.kicker, fontWeight: "700" }]}>
        {count} attachment{count === 1 ? "" : "s"}
      </Text>
    </View>
  );
}
