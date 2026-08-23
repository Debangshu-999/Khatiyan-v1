import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideProps } from "lucide-react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ArrowLeft,
  Copy,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Pencil,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Lightbox } from "@/components/image-carousel";
import { useToast } from "@/components/toast";
import { dayDivider } from "@/features/chat/chat-time";
import { ChatAvatar } from "@/features/chat/chat-avatar";
import { MessageBubble, type MessageAnchor } from "@/features/chat/message-bubble";
import {
  AttachmentError,
  openFileWithApp,
  saveImageToDevice,
} from "@/features/chat/attachment-actions";
import { useChatAttachments } from "@/features/chat/use-chat-attachments";
import { useChatMessages } from "@/features/chat/use-chat-messages";
import { errorMessage } from "@/features/forms/server-error";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  useDeleteChatMessageMutation,
  useEditChatMessageMutation,
  useSendChatMessageMutation,
  type ChatAttachment,
  type ChatAttachmentDraft,
  type ChatMessage,
} from "@/store/services/chat-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One conversation.
 *
 * <p>Polls while it is open. The list is authoritative from the server; the
 * only local state is the draft and whichever message is being deleted.
 */
/**
 * Whether the system already says "Copied" for us.
 *
 * <p>Android 13 shows its own clipboard confirmation whenever an app writes to
 * the clipboard, so a toast on top of it is the same word twice. Android 12 and
 * below show nothing at all, and those devices still need to be told — this is
 * a version gate rather than a straight removal for that reason.
 */
const CLIPBOARD_ANNOUNCES_ITSELF = Platform.OS === "android" && Number(Platform.Version) >= 33;

export default function ChatThreadScreen() {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    photo?: string;
    subtitle?: string;
    team?: string;
    threadId: string;
    title?: string;
  }>();
  const threadId = String(params.threadId ?? "");

  const { append, loading, messages, seenCountFor, thread, unreadFrom } = useChatMessages(threadId);
  // The first thing they had not seen when they arrived. Null while the first
  // page is in flight, and for a conversation never opened — where a line above
  // the very first message would be noise rather than information.
  const firstUnreadSeq =
    unreadFrom && unreadFrom > 0
      ? (messages.find((message) => message.seq > unreadFrom && !message.mine)?.seq ?? null)
      : null;
  // Params are the instant paint; the server is the truth. Without the params
  // the header would be blank for one round trip on every open, and without the
  // server it would be blank forever on a push deep link.
  const title = thread?.title ?? params.title ?? "Conversation";
  const readOnly = thread?.status === "READ_ONLY";
  const [sendMessage, sendState] = useSendChatMessageMutation();
  const [deleteMessage] = useDeleteChatMessageMutation();
  const [editMessage] = useEditChatMessageMutation();

  const { pickFiles, pickImages, uploading } = useChatAttachments();
  const [attachOpen, setAttachOpen] = useState(false);
  // Measured rather than assumed: the composer grows with a multi-line draft,
  // and the popover has to stay pinned just above whatever height it is now.
  const [composerHeight, setComposerHeight] = useState(0);
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [anchor, setAnchor] = useState<MessageAnchor | null>(null);
  /** The picture set being viewed, and which of them is on screen. */
  const [viewing, setViewing] = useState<{ images: string[]; index: number } | null>(null);
  /** The message being rewritten. The composer becomes its editor. */
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChatMessage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = useCallback(() => {
    // A frame late: the new bubble has to be laid out before there is anything
    // to scroll to.
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  async function send() {
    const body = draft.trim();
    if (!body || sendState.isLoading) {
      return;
    }

    // Cleared optimistically so a fast second message is not blocked behind the
    // first, and restored on failure so nothing is silently lost.
    const target = editing;
    setDraft("");
    setEditing(null);
    try {
      const saved = target
        ? await editMessage({ body, messageId: target.id, threadId }).unwrap()
        : await sendMessage({ body, threadId }).unwrap();
      append(saved);
      if (!target) {
        scrollToEnd();
      }
    } catch (error) {
      setDraft(body);
      setEditing(target);
      setFailure(
        errorMessage(error) ||
          (target ? "That edit could not be saved." : "That message could not be sent. Try again."),
      );
    }
  }

  async function openFile(attachment: ChatAttachment) {
    try {
      await openFileWithApp(attachment);
    } catch (error) {
      setFailure(
        error instanceof AttachmentError
          ? error.message
          : "That file could not be opened.",
      );
    }
  }

  async function saveImage(imageUrl: string) {
    try {
      await saveImageToDevice(imageUrl);
      toast.success("Saved to your gallery.");
    } catch (error) {
      // A refusal, not a toast: a missing permission needs an explanation and
      // somewhere to go, and a message that disappears after three seconds is
      // neither.
      setFailure(
        error instanceof AttachmentError
          ? error.message
          : "That image could not be saved.",
      );
    }
  }

  async function copySelected() {
    const target = selected;
    setSelected(null);
    if (!target?.body) {
      return;
    }
    await Clipboard.setStringAsync(target.body);
    if (!CLIPBOARD_ANNOUNCES_ITSELF) {
      toast.success("Copied.");
    }
  }

  /**
   * Attachments send as soon as they finish uploading, carrying whatever text
   * is already typed.
   *
   * <p>They do not sit in the composer waiting for a send tap. The upload has
   * already happened by then, so holding the message back would leave an asset
   * in storage that no row points at if the draft were abandoned — and there is
   * no sweep to reclaim those.
   */
  async function attach(pick: () => Promise<{ drafts: ChatAttachmentDraft[]; error?: string }>) {
    setAttachOpen(false);
    const { drafts, error } = await pick();

    if (error) {
      setFailure(error);
      return;
    }
    if (drafts.length === 0) {
      return;
    }

    const body = draft.trim();
    setDraft("");
    try {
      const sent = await sendMessage({ attachments: drafts, body: body || undefined, threadId }).unwrap();
      append(sent);
      scrollToEnd();
    } catch (failure) {
      setDraft(body);
      setFailure(errorMessage(failure) || "That attachment could not be sent.");
    }
  }

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) {
      return;
    }

    try {
      await deleteMessage({ messageId: target.id, threadId }).unwrap();
      toast.success("Message deleted.");
    } catch (error) {
      setFailure(errorMessage(error) || "That message could not be deleted.");
    }
  }

  /**
   * What Back means here.
   *
   * <p>It unwinds the screen before leaving it. A selected message and a
   * half-written edit are both states the reader entered deliberately, and
   * dropping straight out of the thread discards the edit with no way to get it
   * back — the same press that should have said "never mind" loses the text.
   *
   * <p>Registered on the hardware button as well as the arrow, so the two
   * cannot drift apart.
   */
  const goBack = useCallback(() => {
    if (selected) {
      setSelected(null);
      return true;
    }
    if (editing) {
      setEditing(null);
      setDraft("");
      return true;
    }

    router.back();
    return true;
  }, [editing, router, selected]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", goBack);
      return () => subscription.remove();
    }, [goBack]),
  );

  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background, flex: 1 }}>
      <View
        style={{
          alignItems: "center",
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <AnimatedPressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={10} onPress={goBack}>
          <ArrowLeft color={colors.ink} size={22} strokeWidth={2.2} />
        </AnimatedPressable>
        {/* Beside the name, as every messaging app puts it — it is the
            fastest way to confirm you opened the right conversation. */}
        {/* The building only when the other side IS the property — management
            reading a team thread is looking at a tenant, not at a place. */}
        <ChatAvatar
          name={title}
          photoUrl={thread?.counterpartPhotoUrl ?? params.photo}
          size={34}
          team={
            thread
              ? thread.kind === "TEAM" && thread.counterpartUserId === null
              : params.team === "1"
          }
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
            {title}
          </Text>
          {params.subtitle ? (
            <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
              {params.subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingVertical: spacing.sm }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {loading ? (
            <View style={{ paddingVertical: spacing.xl }}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : null}

          {!loading && messages.length === 0 ? (
            <Text
              style={[
                type.caption,
                { color: colors.muted, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, textAlign: "center" },
              ]}
            >
              No messages yet. Say hello.
            </Text>
          ) : null}

          {messages.map((message, at) => {
            const previous = at > 0 ? messages[at - 1] : null;
            const divider = dayDivider(message.sentAt, previous?.sentAt ?? null);
            // A change of speaker gets a wider gap than the next line from the
            // same one. Even spacing makes a conversation read as one column of
            // text; the break is what separates a reply from a continuation.
            const turnChanged = previous !== null && previous.authorUserId !== message.authorUserId;
            // The message that opens a run, and so the one that gets the tail.
            // A day divider breaks a run too: two messages from the same person
            // either side of it are not one continuous thought.
            const startsRun = previous === null || turnChanged || divider !== null;
            return (
              <View key={message.id} style={{ marginTop: turnChanged ? spacing.sm : 0 }}>
                {message.seq === firstUnreadSeq ? (
                  <View
                    style={{
                      alignItems: "center",
                      flexDirection: "row",
                      gap: spacing.sm,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
                    <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
                      New messages
                    </Text>
                    <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
                  </View>
                ) : null}
                {divider ? (
                  <Text
                    style={[
                      type.caption,
                      { color: colors.kicker, paddingVertical: spacing.sm, textAlign: "center" },
                    ]}
                  >
                    {divider}
                  </Text>
                ) : null}
                <MessageBubble
                  message={message}
                  onLongPress={
                    message.deleted || actionRows(message) === 0
                      ? undefined
                      : (where) => {
                          setSelected(message);
                          setAnchor(where);
                        }
                  }
                  onOpenFile={(attachment) => void openFile(attachment)}
                  onOpenImage={(index) =>
                    setViewing({
                      images: message.attachments
                        .filter((attachment) => attachment.kind === "IMAGE")
                        .map((attachment) => attachment.url),
                      index,
                    })
                  }
                  seenBy={message.mine ? seenCountFor(message.seq) : undefined}
                  selected={selected?.id === message.id}
                  tail={startsRun}
                />
              </View>
            );
          })}
        </ScrollView>

        {readOnly ? (
          <View
            style={{
              backgroundColor: colors.background,
              paddingBottom: spacing.md + insets.bottom,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
            }}
          >
            <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
              This conversation is closed. You can still read it.
            </Text>
          </View>
        ) : (
        <View onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}>
          {editing ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.background,
                flexDirection: "row",
                gap: spacing.sm,
                paddingHorizontal: spacing.md,
                paddingTop: spacing.xs,
              }}
            >
              <Pencil color={colors.primary} size={14} strokeWidth={2.4} />
              <Text numberOfLines={1} style={[type.caption, { color: colors.muted, flex: 1 }]}>
                Editing message
              </Text>
              <AnimatedPressable
                accessibilityLabel="Cancel editing"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  setEditing(null);
                  setDraft("");
                }}
              >
                <X color={colors.muted} size={16} strokeWidth={2.4} />
              </AnimatedPressable>
            </View>
          ) : null}
        <View
          style={{
            alignItems: "flex-end",
            // The same ground as the message list, with no rule between them.
            // A bar in its own colour reads as a separate panel bolted on; the
            // input's own pill is enough to say where typing happens.
            backgroundColor: colors.background,
            flexDirection: "row",
            gap: spacing.sm,
            // Clears the gesture bar. SafeAreaView only pads the top here,
            // because padding the bottom there would lift the whole message
            // list off the keyboard as well.
            paddingBottom: spacing.sm + insets.bottom,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm,
          }}
        >
          {/* The clip lives inside the input pill, at the trailing edge. Set
              beside it, the clip and the send button competed for the same two
              margins and the field lost width to a control that is about the
              field's own contents. */}
          <View
            style={{
              alignItems: "flex-end",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 18,
              flex: 1,
              flexDirection: "row",
              paddingRight: 6,
            }}
          >
            <TextInput
              multiline
              onChangeText={setDraft}
              placeholder={editing ? "Edit message" : "Message"}
              placeholderTextColor={colors.kicker}
              style={{
                color: colors.ink,
                flex: 1,
                fontFamily: fonts.sans,
                fontSize: 15,
                maxHeight: 110,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 9,
              }}
              value={draft}
            />

            <AnimatedPressable
              accessibilityLabel="Attach a photo or file"
              accessibilityRole="button"
              disabled={uploading || Boolean(editing)}
              hitSlop={8}
              onPress={() => setAttachOpen((open) => !open)}
              style={{ height: 38, justifyContent: "center", paddingLeft: 4, width: 26 }}
            >
              {/* Blue, because while it spins it is the only moving thing on
                  the screen and has to read as work in progress rather than as
                  an icon that has gone dim. */}
              {uploading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Paperclip color={colors.muted} size={21} strokeWidth={2.2} />
              )}
            </AnimatedPressable>
          </View>

          <AnimatedPressable
            accessibilityLabel="Send"
            accessibilityRole="button"
            disabled={!draft.trim() || sendState.isLoading}
            onPress={() => void send()}
            style={{
              alignItems: "center",
              backgroundColor: draft.trim() ? colors.ink : colors.surfaceSunken,
              borderRadius: 999,
              height: 36,
              justifyContent: "center",
              width: 36,
            }}
          >
            <SendHorizontal
              color={draft.trim() ? colors.surface : colors.kicker}
              size={17}
              strokeWidth={2.3}
            />
          </AnimatedPressable>
        </View>
        </View>
        )}
      </KeyboardAvoidingView>

      {/* Both live at screen level rather than inside the composer. Nested
          there the backdrop resolved to zero height — absoluteFill pins top to
          0, and overriding bottom to 100% leaves nothing between them — and on
          Android a child drawn outside its parent's bounds receives no touches
          at all, which would have taken the popover with it. */}
      {attachOpen ? (
        <Pressable
          accessibilityLabel="Close attachment options"
          onPress={() => setAttachOpen(false)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {attachOpen ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 14,
            borderWidth: 1,
            bottom: composerHeight + spacing.xs,
            elevation: 6,
            right: spacing.md,
            overflow: "hidden",
            position: "absolute",
            shadowColor: "#000",
            shadowOffset: { height: 3, width: 0 },
            shadowOpacity: 0.14,
            shadowRadius: 10,
            width: 180,
          }}
        >
          <AttachChoice icon={ImageIcon} label="Photo" onPress={() => void attach(pickImages)} />
          <View style={{ backgroundColor: colors.border, height: 1 }} />
          <AttachChoice icon={FileText} label="Document" onPress={() => void attach(pickFiles)} />
        </View>
      ) : null}

      {/* In its own window, because `measureInWindow` reports the held row in
          WINDOW coordinates while an absolute child of the SafeAreaView is
          positioned inside its top padding. Mixing the two shifted the menu
          down by the status-bar inset, which was invisible for a tall photo
          and put the menu on top of the bubble for a one-row file menu.

          A Modal's origin is the window, so the two spaces cannot drift apart
          again. It also lets the backdrop cover the status-bar strip, and gives
          the Android back button a way to close the menu. */}
      <Modal
        animationType="fade"
        onRequestClose={() => setSelected(null)}
        transparent
        visible={Boolean(selected)}
      >
        {/* Transparent: the selection is shown by tinting the message's own
            row, which stays visible through this window. Dimming everything
            made the conversation unreadable and buried the one message the
            menu is about. */}
        <Pressable
          accessibilityLabel="Close message actions"
          onPress={() => setSelected(null)}
          style={{ flex: 1 }}
        >
          {selected ? (
            <View
              style={{
                alignSelf: selected.mine ? "flex-end" : "flex-start",
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderCurve: "continuous",
                borderRadius: 16,
                borderWidth: 1,
                elevation: 8,
                marginHorizontal: spacing.md,
                overflow: "hidden",
                position: "absolute",
                shadowColor: "#000",
                shadowOffset: { height: 4, width: 0 },
                shadowOpacity: 0.18,
                shadowRadius: 14,
                top: menuTop(anchor, menuHeight(selected), insets.bottom, insets.top),
                width: 220,
              }}
            >
              {/* Assembled as a list so the separators fall between rows. Built
                  inline, the last row kept a trailing rule under it whenever
                  the row after it was the one that did not apply. */}
              {messageActions(selected, {
                onCopy: () => void copySelected(),
                onDelete: () => {
                  setPendingDelete(selected);
                  setSelected(null);
                },
                onEdit: () => {
                  setDraft(selected.body ?? "");
                  setEditing(selected);
                  setSelected(null);
                },
              }).map((action, at) => (
                <View key={action.label}>
                  {at > 0 ? <View style={{ backgroundColor: colors.border, height: 1 }} /> : null}
                  <MessageAction
                    destructive={action.destructive}
                    icon={action.icon}
                    label={action.label}
                    onPress={action.onPress}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>

      {pendingDelete ? (
        <DeleteMessageDialog
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {viewing ? (
        <Lightbox
          actions={[{ label: "Save image", onPress: (imageUrl) => void saveImage(imageUrl) }]}
          images={viewing.images}
          initialIndex={viewing.index}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {failure ? <AlertModal message={failure} onClose={() => setFailure(null)} /> : null}
    </SafeAreaView>
  );
}

function AttachChoice({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      }}
    >
      <Icon color={colors.inkSoft} size={18} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </AnimatedPressable>
  );
}

function MessageAction({
  destructive,
  icon: Icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  icon: React.ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const tone = destructive ? colors.danger : colors.ink;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 3,
      }}
    >
      <Icon color={tone} size={18} strokeWidth={2.2} />
      <Text style={{ color: tone, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </AnimatedPressable>
  );
}

/**
 * Where the action menu sits: just under the held message, or just above it
 * when there is no room below.
 *
 * <p>Anchored to the message rather than the composer, because the menu is
 * about that one message — opening it at a fixed place on screen leaves the
 * reader matching a floating card to a highlighted row by eye.
 */
function menuTop(
  anchor: MessageAnchor | null,
  height: number,
  bottomInset: number,
  topInset: number,
) {
  const GAP = 6;
  const screenHeight = Dimensions.get("window").height;

  if (!anchor) {
    return screenHeight / 2 - height / 2;
  }

  // The composer is not an obstacle. Nothing can be typed while the menu is
  // open, so the menu is free to sit over it. Reserving its height instead sent
  // the menu upwards for the LAST message in a thread — where "above" means on
  // top of the message before it, which is the one it then appears to be about.
  const floor = screenHeight - bottomInset - height - GAP;

  const below = anchor.y + anchor.height + GAP;
  if (below <= floor) {
    return below;
  }

  const above = anchor.y - height - GAP;
  if (above >= topInset + GAP) {
    return above;
  }

  // Neither side fits, which is what a full-width photo does — it leaves no
  // clear band above or below itself. Sit at the foot of the screen rather than
  // clamping to the top inset, which drops the menu onto the picture it is
  // asking about.
  return Math.max(topInset + GAP, floor);
}

/**
 * Predicted height of the menu, from the actions it will show.
 *
 * <p>Computed rather than measured: the position has to be right on the first
 * frame. Measuring means rendering the menu somewhere wrong and moving it,
 * which the eye catches.
 */
function menuHeight(message: ChatMessage) {
  const ROW = 42;
  const rows = actionRows(message);

  return rows * ROW + Math.max(0, rows - 1) + 2;
}

/**
 * What the menu would offer for this message.
 *
 * <p>Edit is absent, not disabled, for a picture or a file: the asset is
 * already sent and already seen, so there is nothing here to rewrite. Absent
 * for someone else's message too — it was never yours.
 */
function messageActions(
  message: ChatMessage,
  handlers: { onCopy: () => void; onDelete: () => void; onEdit: () => void },
) {
  const actions: {
    destructive?: boolean;
    icon: React.ComponentType<LucideProps>;
    label: string;
    onPress: () => void;
  }[] = [];

  if (message.mine && message.attachments.length === 0) {
    actions.push({ icon: Pencil, label: "Edit", onPress: handlers.onEdit });
  }
  if (message.body) {
    actions.push({ icon: Copy, label: "Copy", onPress: handlers.onCopy });
  }
  if (message.mine) {
    actions.push({ destructive: true, icon: Trash2, label: "Delete", onPress: handlers.onDelete });
  }

  return actions;
}

/**
 * How many rows the menu will have.
 *
 * <p>Zero is possible — someone else's uncaptioned photo offers nothing — and
 * the long-press is suppressed rather than opening an empty card.
 */
function actionRows(message: ChatMessage) {
  return (
    (message.mine && message.attachments.length === 0 ? 1 : 0) +
    (message.body ? 1 : 0) +
    (message.mine ? 1 : 0)
  );
}

/**
 * The delete confirmation.
 *
 * <p>Deliberately not the shared `ConfirmDialog`. That one is built for
 * decisions worth stopping for — ending a tenancy, settling a deposit — and its
 * two full-width buttons carry that weight. Removing one line of chat does not
 * warrant it. Here the question is plain and the answers are the two verbs,
 * right-aligned in reading order so the destructive one is furthest from the
 * thumb's resting path.
 */
function DeleteMessageDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <Pressable
        accessibilityLabel="Dismiss"
        onPress={onCancel}
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        {/* Swallows the tap so a press inside the card does not dismiss it. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1,
            maxWidth: 340,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>
            Delete message
          </Text>
          <Text style={[type.body, { color: colors.muted, marginTop: spacing.sm }]}>
            Are you sure you want to delete this message?
          </Text>

          <View
            style={{
              flexDirection: "row",
              gap: spacing.lg,
              justifyContent: "flex-end",
              marginTop: spacing.lg,
            }}
          >
            <DialogChoice label="Cancel" onPress={onCancel} tone={colors.primary} />
            <DialogChoice label="Delete" onPress={onConfirm} tone={colors.danger} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DialogChoice({ label, onPress, tone }: { label: string; onPress: () => void; tone: string }) {
  const { fonts } = useTheme();

  return (
    <AnimatedPressable accessibilityRole="button" hitSlop={10} onPress={onPress}>
      <Text style={{ color: tone, fontFamily: fonts.sansSemiBold, fontSize: 15 }}>{label}</Text>
    </AnimatedPressable>
  );
}
