import { Text, View } from "react-native";
import { CalendarClock } from "lucide-react-native";

import { istToday } from "@/features/analytics/period";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Whole days from today (in IST, the backend's calendar) to an ISO date.
 * Zero or less once the date has arrived.
 */
export function daysUntil(isoDate: string, todayIso: string = istToday()): number {
  const toUtc = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(isoDate) - toUtc(todayIso)) / 86_400_000);
}

/**
 * True before the stay's start date. Room change and exit requests stay shut
 * until then: there is no live bill yet, and the server refuses both anyway.
 */
export function tenancyNotStarted(startDate: string): boolean {
  return daysUntil(startDate) > 0;
}

export const REQUESTS_NOT_STARTED = {
  concern: "Concerns can be raised once your tenancy has started.",
  exit: "Exit requests are available once your tenancy has started.",
  roomChange: "Room change requests are available once your tenancy has started.",
} as const;

/** "Billing starts tomorrow" or "Billing starts in 3 days". */
export function startsInLabel(subject: string, days: number): string {
  return days === 1 ? `${subject} starts tomorrow` : `${subject} starts in ${days} days`;
}

/**
 * A note that something on the stay has not begun yet: the tenancy itself
 * before its start date, or billing before its first window opens.
 *
 * <p>Green rather than amber. Nothing is wrong and nothing is being asked of
 * the tenant, it is only a date to plan around.
 */
export function StartsSoonBubble({ message, title }: { message?: string; title: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      accessibilityRole="text"
      style={{
        alignItems: message ? "flex-start" : "center",
        // Fill only, no border (user, 2026-09-27).
        backgroundColor: colors.successSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      }}
    >
      <CalendarClock color={colors.successText} size={18} strokeWidth={2.2} style={{ marginTop: message ? 1 : 0 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.successText, fontFamily: fonts.sansBold, fontSize: 13.5, lineHeight: 19 }}>
          {title}
        </Text>
        {message ? (
          <Text style={[type.caption, { color: colors.successText, fontSize: 12.5, lineHeight: 17 }]}>{message}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The tenancy's own "not started yet" note, or nothing once it has started.
 * Shared by Home and the Tenancy tab so both say the same thing.
 */
export function TenancyStartsSoonBubble({ startDate }: { startDate: string }) {
  const days = daysUntil(startDate);
  if (days <= 0) {
    return null;
  }
  return (
    <StartsSoonBubble
      message="You can plan ahead and explore in the meanwhile."
      title={startsInLabel("Your tenancy", days)}
    />
  );
}
