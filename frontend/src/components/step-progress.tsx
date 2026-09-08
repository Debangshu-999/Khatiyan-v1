import { View } from "react-native";

import { useTheme } from "@/theme/use-theme";

/**
 * A wizard's progress as one segment per step.
 *
 * <p>
 * Replaces a continuous bar plus a "Step 3 of 6" caption. The caption existed
 * because a part-filled bar cannot say WHICH step you are on or how many there
 * are — it can only say roughly how far along. Six pieces say both at a glance,
 * so the sentence underneath had nothing left to add and was two lines of header
 * spent on a number the bar was already showing.
 *
 * <p>
 * Filled up to AND INCLUDING the current step: someone on step three has
 * finished two and is working on a third, and a bar that fills only what is
 * finished reads as no progress at all on the first step.
 */
export function StepProgress({ step, totalSteps }: { step: number; totalSteps: number }) {
  const { colors } = useTheme();

  return (
    <View accessibilityLabel={`Step ${step + 1} of ${totalSteps}`} style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <View
          key={index}
          style={{
            // White for the steps still to come, not a grey track. On the
            // header's tinted panel a grey read as muddy rather than as empty.
            backgroundColor: index <= step ? colors.jade : colors.surface,
            borderRadius: 999,
            flex: 1,
            height: 5,
          }}
        />
      ))}
    </View>
  );
}
