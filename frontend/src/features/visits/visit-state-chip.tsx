import type { ComponentType } from "react";
import { Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { useTheme } from "@/theme/use-theme";

/** Where a visit stands, as the chip beside its name says it. */
export type VisitStatus = {
  icon: ComponentType<LucideProps>;
  label: string;
  tone: "muted" | "blue" | "amber" | "red" | "green";
};

/**
 * A visit's state beside its name: an icon and the word, in the state's
 * colour, with no fill, a size under the slot's pill (user, 2026-10-04), and
 * made smaller again the same day. The same chip on the property's Manage
 * Visits cards and on the visitor's own.
 */
export function VisitStateChip({ icon: Icon, label, tone }: VisitStatus) {
  const { colors, fonts } = useTheme();
  const color = {
    amber: colors.warningText,
    blue: colors.primary,
    green: colors.successText,
    muted: colors.muted,
    red: colors.danger,
  }[tone];
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 3 }}>
      <Icon color={color} size={13} strokeWidth={2.4} />
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: 11 }}>{label}</Text>
    </View>
  );
}
