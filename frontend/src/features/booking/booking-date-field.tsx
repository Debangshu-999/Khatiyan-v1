import { useState } from "react";
import { Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";

import { CalendarPicker } from "@/components/calendar-picker";
import { AnimatedPressable } from "@/components/animated-pressable";
import { bookingDateLabel } from "@/features/booking/booking-ui";
import { validBookingDate } from "@/features/booking/booking-request-form";
import { RequiredMark } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** `hideLabel` is for a field under a card heading that already names it. The label still titles the sheet. */
export function BookingDateField({ label, value, minimum, maximum, disabled, error, hideLabel, required, onChange }: { label: string; value: string; minimum: string; maximum: string; disabled?: boolean; error?: string; hideLabel?: boolean; /** A red asterisk on the label (2026-11-08). */ required?: boolean; onChange: (value: string) => void }) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);
  return <View style={{ gap: spacing.xs }}>
    {hideLabel ? null : <Text style={[type.label, { color: colors.muted }]}>{label}<RequiredMark required={required} /></Text>}
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={() => setOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: error ? colors.danger : colors.borderStrong, borderRadius: 10, backgroundColor: colors.surface }}><CalendarDays color={colors.muted} size={18} /><Text style={[type.body, { color: value ? colors.ink : colors.muted }]}>{value ? bookingDateLabel(value) : "Select date"}</Text></AnimatedPressable>
    {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    {/* A day picked is taken at once, with no sheet behind the calendar (user, 2026-10-11). */}
    {open ? <CalendarPicker maximum={maximum} minimum={minimum} onClose={() => setOpen(false)} onPick={onChange} value={validBookingDate(value) ? value : null} /> : null}
  </View>;
}
