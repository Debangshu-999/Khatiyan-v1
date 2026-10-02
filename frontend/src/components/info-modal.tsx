import { CenterModal } from "@/components/center-modal";
import { ReactNode } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { HelpModalClose, HelpModalHeader } from "@/components/help-modal-header";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";

import { AnimatedPressable } from "@/components/animated-pressable";
import { DIALOG_MAX_WIDTH, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The explanation behind an "i".
 *
 * <p>Every one of these ends in a solid **Got it** rather than only a corner ×.
 * The × is a dismissal; "Got it" is an acknowledgement, and on a panel whose
 * whole job is to explain something it is the action the reader actually wants.
 * Tapping the backdrop still closes it, for anyone who has already read enough.
 */
export function InfoModal({
  children,
  closeOnlyWithAction = false,
  onClose,
  title,
  bottomUp = false,
}: {
  children: ReactNode;
  /**
   * No ×: an acknowledgement closes with Got it. The device back button still
   * closes it, like every centred modal (user, 2026-09-29).
   */
  closeOnlyWithAction?: boolean;
  onClose: () => void;
  title: string;
  bottomUp?: boolean;
}) {
  const { colors, fonts } = useTheme();

  if (bottomUp) return (
    <BottomSheetModal navigationBarTranslucent statusBarTranslucent onRequestClose={onClose}>
      {(dismiss) => <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <HelpModalClose onClose={() => dismiss()} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing.lg, gap: spacing.sm, maxHeight: "76%" }}>
          <HelpModalHeader title={title} />
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>{children}</ScrollView>
        </View>
      </View>}
    </BottomSheetModal>
  );

  return (
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.lg }}>
        {/* The backdrop is a SIBLING behind the card, never its parent. A
            Pressable around the card takes every touch that starts inside it,
            and on Android a Pressable holding the touch blocks native scrolling,
            so a long explanation could not be scrolled on a phone. */}
        {/* A tap on it does nothing (user, 2026-09-29): the × and Got it
            close this, and so does the device back button. */}
        <View
          style={{ backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
        />
        <HelpModalClose onClose={onClose} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 18,
            borderWidth: 1,
            gap: spacing.sm,
            maxHeight: "72%",
            maxWidth: DIALOG_MAX_WIDTH,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <HelpModalHeader title={title} />

          <ScrollView
            contentContainerStyle={{ gap: spacing.sm }}
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
          >
            {children}
          </ScrollView>


        </View>
      </View>
    </CenterModal>
  );
}
