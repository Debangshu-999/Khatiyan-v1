import { Modal, Pressable, Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * "Are you sure?" for removing one small thing.
 *
 * <p>Deliberately lighter than the shared `ConfirmDialog`, which is built for
 * decisions worth stopping for — ending a tenancy, settling a deposit — and
 * carries that weight in two full-width buttons. Deleting a message, a
 * conversation or a clause does not warrant it: the question is plain and the
 * answers are the two verbs, right-aligned in reading order so the destructive
 * one sits furthest from the thumb's resting path.
 *
 * <p>Shared because it had already been written twice, for chat messages and
 * for chat threads, and was about to be written a third and fourth time for
 * clauses. Four hand-copied dialogs is four chances for one of them to grow a
 * different button order.
 */
export function ConfirmDeleteDialog({
  busy,
  confirmLabel = "Delete",
  message,
  onCancel,
  onConfirm,
  title,
}: {
  /** Swaps the confirm label for a progress word and blocks a second press. */
  busy?: boolean;
  confirmLabel?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
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
            {title}
          </Text>
          <Text style={[type.body, { color: colors.muted, marginTop: spacing.sm }]}>
            {message}
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
                {busy ? "Deleting…" : confirmLabel}
              </Text>
            </AnimatedPressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
