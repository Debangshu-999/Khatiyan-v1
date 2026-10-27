import { useState } from "react";
import { Text, View } from "react-native";
import { CircleHelp } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { HowItWorksSheet, type HowItWorksStep } from "@/components/how-it-works-sheet";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A form card's heading, bold (user, 2026-10-19, on the external visit and
 * booking forms). With `help`, a ? beside it opens what the section is for
 * in a sheet from the bottom, set a little low to sit level with the
 * heading's letters rather than its line box (user, 2026-10-19).
 */
export function FormSectionTitle({ help, title }: { help?: { steps: HowItWorksStep[]; title: string }; title: string }) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>{title}</Text>
      {help ? (
        <AnimatedPressable accessibilityHint="Says what this is for" accessibilityLabel={`About ${title}`} accessibilityRole="button" hitSlop={10} onPress={() => setOpen(true)} style={{ marginTop: 4 }}>
          <CircleHelp color={colors.muted} size={17} strokeWidth={2.2} />
        </AnimatedPressable>
      ) : null}
      {open && help ? <HowItWorksSheet eyebrow={title} onClose={() => setOpen(false)} steps={help.steps} title={help.title} /> : null}
    </View>
  );
}
