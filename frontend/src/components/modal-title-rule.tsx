import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { useInCenterDialog } from "@/components/modal-kind";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The line under every modal title, edge to edge across the modal (user,
 * 2026-10-29). {@code inset} is the modal's own side padding, which the line
 * reaches back out through.
 */
export function ModalTitleRule({ flush = false, inset = spacing.lg }: {
  /** No space of its own, where the caller already spaces it (SheetShell, the help header). */
  flush?: boolean;
  inset?: number;
}) {
  const { colors } = useTheme();
  // Bottom sheets only: centre dialogs keep their own look (user, 2026-10-29).
  if (useInCenterDialog()) return null;
  return (
    <View
      style={{
        backgroundColor: colors.border,
        height: 1,
        marginHorizontal: -inset,
        // A gap above and below, whatever the sheet's own spacing (user, 2026-10-29).
        ...(flush ? null : { marginBottom: spacing.md, marginTop: spacing.xs }),
      }}
    />
  );
}

/**
 * The way out of an explanation now that modals carry no × (user,
 * 2026-10-29): one solid button, an acknowledgement rather than a dismissal.
 */
export function GotItButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", alignSelf: "stretch", backgroundColor: colors.primary, borderCurve: "continuous", borderRadius: 14, paddingVertical: spacing.md }}
    >
      <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 15 }}>Got it</Text>
    </AnimatedPressable>
  );
}
