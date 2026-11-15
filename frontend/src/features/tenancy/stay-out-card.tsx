import { CalendarClock, CircleCheck, House, Luggage, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";
import { Text, View } from "react-native";

import { leavingPart, returnPart, stayOutDay } from "@/features/tenancy/stay-out-ui";
import type { MealType } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The parts of a stay-out card, shared by the tenant's and the owner's screens
 * (user, 2026-11-08): the state chip, the leaving and back panel, the reason box.
 */

export type StayOutChipState = "UPCOMING" | "AWAY" | "BACK_TODAY" | "DONE";

/** Sentence case, bold, with its mark (user, 2026-11-08). */
export function StayOutStateChip({ state }: { state: StayOutChipState }) {
  const { colors, fonts } = useTheme();
  const look: { background: string; icon: ComponentType<LucideProps>; ink: string; label: string } =
    state === "UPCOMING"
      ? { background: colors.primarySoft, icon: CalendarClock, ink: colors.primaryDeep, label: "Upcoming" }
      : state === "AWAY"
        ? { background: colors.warningSoft, icon: Luggage, ink: colors.warningText, label: "Away" }
        : state === "BACK_TODAY"
          ? { background: colors.successSoft, icon: House, ink: colors.successText, label: "Back today" }
          : { background: colors.neutralSoft, icon: CircleCheck, ink: colors.neutralText, label: "Done" };
  const Icon = look.icon;
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: look.background,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Icon color={look.ink} size={13} strokeWidth={2.4} />
      <Text style={{ color: look.ink, fontFamily: fonts.sansBold, fontSize: 12 }}>{look.label}</Text>
    </View>
  );
}

/** Leaving and back side by side, each its day and its meal. */
export function StayOutSpanPanel({
  firstMealBack,
  lastMealHere,
  leaveDate,
  meals,
  returnDate,
}: {
  firstMealBack: MealType | null;
  lastMealHere: MealType | null;
  leaveDate: string;
  meals: MealType[];
  returnDate: string;
}) {
  const { colors, fonts, type } = useTheme();
  const capital = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderCurve: "continuous",
        borderRadius: 10,
        flexDirection: "row",
        paddingVertical: spacing.sm,
      }}
    >
      {[
        { day: leaveDate, label: "Leaving", meal: leavingPart(lastMealHere, meals) },
        { day: returnDate, label: "Back", meal: returnPart(firstMealBack, meals) },
      ].map((part, index) => (
        <View
          key={part.label}
          style={{
            borderLeftColor: colors.border,
            borderLeftWidth: index === 0 ? 0 : 1,
            flex: 1,
            gap: 2,
            paddingHorizontal: spacing.md,
          }}
        >
          <Text style={[type.caption, { color: colors.muted }]}>{part.label}</Text>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{stayOutDay(part.day)}</Text>
          {part.meal ? <Text style={[type.caption, { color: colors.inkSoft }]}>{capital(part.meal)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** The reason in a box, its label in the border (user, 2026-11-08). */
export function StayOutReasonBox({ reason }: { reason: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 10,
        borderWidth: 1,
        marginTop: spacing.xs,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm + 2,
      }}
    >
      <View pointerEvents="none" style={{ backgroundColor: colors.surface, left: 10, position: "absolute", top: -9 }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.3, lineHeight: 16, paddingHorizontal: 5 }}>
          Reason
        </Text>
      </View>
      <Text style={[type.body, { color: colors.ink }]}>{reason}</Text>
    </View>
  );
}
