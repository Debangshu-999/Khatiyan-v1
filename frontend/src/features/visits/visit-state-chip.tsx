import type { ComponentType } from "react";
import { Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { cardText } from "@/components/card-name-row";
import { GhostPill, useIsSkeleton } from "@/components/skeletons/boundary";
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
 *
 * <p>`pill` sets it on a grey pill, as the property's Manage Visits cards
 * show it (user, 2026-10-19).
 */
export function VisitStateChip({ icon: Icon, label, pill = false, tone }: VisitStatus & { pill?: boolean }) {
  const { colors, fonts } = useTheme();
  const ghost = useIsSkeleton();
  const color = {
    amber: colors.warningText,
    blue: colors.primary,
    green: colors.successText,
    muted: colors.muted,
    red: colors.danger,
  }[tone];
  // Inside a skeleton it is a grey bar about its own size, never the sample's
  // "Pending" (user, 2026-11-15): the tenant's and the owner's visit cards alike.
  if (ghost) return <GhostPill height={pill ? 22 : 16} width={Math.min(120, 30 + label.length * 6)}><View /></GhostPill>;
  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: 3,
        ...(pill ? { backgroundColor: colors.neutralSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 } : {}),
      }}
    >
      <Icon color={color} size={13} strokeWidth={2.4} />
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: cardText(11) }}>{label}</Text>
    </View>
  );
}
