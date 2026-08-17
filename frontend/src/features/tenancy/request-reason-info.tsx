import { useState } from "react";
import { Text, View } from "react-native";
import { Info } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A labelled row that opens its full text in a sheet.
 *
 * <p>Reasons — the tenant's, and management's for a decision — used to print in
 * full on the tenant's cards. A 500-character rejection then pushed everything
 * else off the card and made a list of requests unscannable. The owner's side
 * already put them behind an info control; this brings the tenant's into line.
 */
export function RequestReasonInfo({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AnimatedPressable
        accessibilityLabel={`Read ${label.toLowerCase()}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: spacing.xs,
          paddingVertical: 2,
        }}
      >
        <Info color={colors.muted} size={14} strokeWidth={2.2} />
        <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
      </AnimatedPressable>

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title={label}>
          <Text style={[type.body, { color: colors.ink, lineHeight: 22 }]}>{value}</Text>
        </SheetShell>
      ) : null}
    </>
  );
}
