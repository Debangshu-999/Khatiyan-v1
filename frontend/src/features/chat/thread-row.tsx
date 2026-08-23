import { Text, View } from "react-native";
import { FileText, Image as ImageIcon } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ChatAvatar } from "@/features/chat/chat-avatar";
import { threadStamp } from "@/features/chat/chat-time";
import type { ChatThread } from "@/store/services/chat-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Big enough to be a face rather than a marker.
 *
 * <p>At 40 the photo was a decoration beside the name; at 52 it is the thing
 * you actually scan the list by, which is how anyone finds a conversation they
 * have not named to themselves.
 */
const AVATAR_SIZE = 52;

/**
 * One conversation in a list.
 *
 * <p>Handles the row that has no conversation behind it yet: the tenant's
 * pinned Property Management Team row exists because their stay does, so it
 * arrives with a null id and no last message. It invites rather than reports,
 * and tapping it is what creates the thread.
 */
export function ThreadRow({
  onPress,
  subtitle,
  thread,
}: {
  onPress: () => void;
  /** Room number, role, whatever places this person. Optional. */
  subtitle?: string | null;
  thread: ChatThread;
}) {
  const { colors, fonts, type } = useTheme();
  const started = Boolean(thread.lastMessageAt);
  // Not "is this a team thread" — "is the other side of it a PLACE?". Both
  // parties look at the same team thread and see different things: the tenant
  // is writing to the property, while management is reading a person. The
  // server already says which, by leaving counterpartUserId null exactly when
  // the other side is the management role rather than somebody.
  const facingTheProperty = thread.kind === "TEAM" && thread.counterpartUserId === null;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${thread.title}`}
      onPress={onPress}
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: spacing.sm + 2,
        // Left only. The rule below belongs to the text block, not to the row,
        // so it has to start after the avatar — see the wrapper beneath.
        paddingLeft: spacing.lg,
      }}
    >
      <ChatAvatar
        name={thread.title}
        photoUrl={thread.counterpartPhotoUrl}
        size={AVATAR_SIZE}
        team={facingTheProperty}
      />

      {/* Carries the separator so it runs from the name to the screen edge
          rather than under the face. A rule crossing a column of circles cuts
          each one in half and turns the list into a grid. */}
      <View
        style={{
          alignItems: "center",
          alignSelf: "stretch",
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
          flex: 1,
          flexDirection: "row",
          gap: spacing.sm,
          paddingRight: spacing.lg,
          paddingVertical: spacing.sm + 2,
        }}
      >
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Text
            numberOfLines={1}
            // The family is the weight. Left to `fontWeight` alone the name
            // fell back to the platform face and Android bolded it a second
            // time, which is why unread rows looked heavier on device than in
            // the browser.
            style={{
              color: started ? colors.ink : colors.inkSoft,
              flex: 1,
              fontFamily: thread.unread ? fonts.sansBold : fonts.sansSemiBold,
              fontSize: 15,
            }}
          >
            {thread.title}
          </Text>
          {started ? (
            <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
              {threadStamp(thread.lastMessageAt)}
            </Text>
          ) : null}
        </View>

        <Preview thread={thread} />

        {subtitle ? (
          <Text style={[type.caption, { color: colors.kicker, fontSize: 11 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* A dot, not a count. A thread either wants attention or it does not,
          and the number of messages inside it does not change the answer. */}
      {thread.unread ? (
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: 999,
            height: 9,
            width: 9,
          }}
        />
      ) : null}
      </View>
    </AnimatedPressable>
  );
}

function Preview({ thread }: { thread: ChatThread }) {
  const { colors, type } = useTheme();

  if (!thread.lastMessageAt) {
    return (
      <Text style={[type.caption, { color: colors.muted }]}>
        Tap to start a conversation
      </Text>
    );
  }

  const Icon = thread.lastMessageKind === "IMAGE" ? ImageIcon : FileText;
  const attachment = thread.lastMessageKind === "IMAGE" || thread.lastMessageKind === "FILE";

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
      {attachment ? <Icon color={colors.muted} size={13} strokeWidth={2.2} /> : null}
      <Text
        numberOfLines={1}
        style={{
          color: thread.unread ? colors.ink : colors.muted,
          flex: 1,
          fontSize: 13.5,
        }}
      >
        {thread.lastMessagePreview ?? ""}
      </Text>
    </View>
  );
}
