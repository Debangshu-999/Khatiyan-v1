import { useCallback, useState } from "react";
import { BackHandler, Modal, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { AnimatedPressable } from "@/components/animated-pressable";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useDeleteChatThreadMutation } from "@/store/services/chat-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Holding a conversation to delete it.
 *
 * <p>A hook rather than a component because both chat lists need the same three
 * things in different places on the screen: the held row's id, a bin beside
 * their own title, and the confirmation. Keeping the state here is what stops
 * the two screens drifting into two slightly different delete flows.
 *
 * <p>Returns {@code dialog} for the caller to render. It has to sit at the root
 * of the screen rather than inside the list, so a modal is not clipped by the
 * scroll view it was opened from.
 */
export function useDeleteThreadSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [deleteThread, state] = useDeleteChatThreadMutation();
  const toast = useToast();

  function clear() {
    setSelectedId(null);
    setAsking(false);
  }

  /**
   * Back drops the selection before it leaves the tab.
   *
   * <p>Registered ONLY while something is held. A handler that always returned
   * true would trap someone on a tab root, where back is how they leave the app.
   *
   * <p>Lives in the hook rather than in each list, so the two screens cannot end
   * up disagreeing about what back means. The confirmation is a Modal and
   * consumes the press itself while it is open.
   */
  useFocusEffect(
    useCallback(() => {
      if (!selectedId) {
        return;
      }

      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        setSelectedId(null);
        setAsking(false);
        return true;
      });
      return () => subscription.remove();
    }, [selectedId]),
  );

  async function confirm() {
    const threadId = selectedId;
    if (!threadId) {
      return;
    }

    try {
      await deleteThread(threadId).unwrap();
      toast.success("Conversation deleted.");
      clear();
    } catch (error) {
      setAsking(false);
      toast.error(errorMessage(error) || "That conversation could not be deleted.");
    }
  }

  return {
    ask: () => setAsking(true),
    clear,
    dialog: asking ? (
      <ConfirmDeleteThread
        busy={state.isLoading}
        onCancel={() => setAsking(false)}
        onConfirm={() => void confirm()}
      />
    ) : null,
    select: setSelectedId,
    selectedId,
  };
}

/**
 * The confirmation.
 *
 * <p>Says what the delete does NOT do, because that is the part people get
 * wrong: it removes the conversation from this list only. The other person
 * keeps every message, and nothing here reaches them.
 *
 * <p>Matched to the message-delete dialog in the thread rather than the shared
 * `ConfirmDialog` — same weight of decision, so the same shape.
 */
function ConfirmDeleteThread({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onCancel} statusBarTranslucent transparent visible>
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
            Delete conversation
          </Text>
          <Text style={[type.body, { color: colors.muted, marginTop: spacing.sm }]}>
            This removes it from your chats only. The other side keeps everything, and starting
            again opens an empty conversation.
          </Text>

          <View
            style={{
              flexDirection: "row",
              gap: spacing.lg,
              justifyContent: "flex-end",
              marginTop: spacing.lg,
            }}
          >
            <AnimatedPressable accessibilityRole="button" hitSlop={10} onPress={onCancel}>
              <Text style={{ color: colors.primary, fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
                Cancel
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              accessibilityRole="button"
              disabled={busy}
              hitSlop={10}
              onPress={onConfirm}
            >
              <Text style={{ color: colors.danger, fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
                {busy ? "Deleting…" : "Delete"}
              </Text>
            </AnimatedPressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
