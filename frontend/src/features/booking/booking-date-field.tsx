import { useState } from "react";
import { Platform, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarDays } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { bookingDateLabel } from "@/features/booking/booking-ui";
import { validBookingDate } from "@/features/booking/booking-request-form";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** `hideLabel` is for a field under a card heading that already names it. The label still titles the sheet. */
export function BookingDateField({ label, value, minimum, maximum, disabled, error, hideLabel, onChange }: { label: string; value: string; minimum: string; maximum: string; disabled?: boolean; error?: string; hideLabel?: boolean; onChange: (value: string) => void }) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const localDate = (iso: string) => { const [year, month, day] = iso.split("-").map(Number); return new Date(year, month - 1, day, 12); };
  const isoOf = (picked: Date) => `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, "0")}-${String(picked.getDate()).padStart(2, "0")}`;
  const valid = validBookingDate(draft) && draft >= minimum && draft <= maximum;
  return <View style={{ gap: spacing.xs }}>
    {hideLabel ? null : <Text style={[type.label, { color: colors.muted }]}>{label}</Text>}
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={() => { setDraft(value || minimum); setOpen(true); }} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: error ? colors.danger : colors.borderStrong, borderRadius: 10, backgroundColor: colors.surface }}><CalendarDays color={colors.muted} size={18} /><Text style={[type.body, { color: value ? colors.ink : colors.muted }]}>{value ? bookingDateLabel(value) : "Select date"}</Text></AnimatedPressable>
    {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    {/* On Android the calendar is the system's own dialog and opens by itself. It used to be mounted inside a
        sheet, and the sheet opened behind the calendar and closed with it: a sheet nobody could touch (user,
        2026-10-11). So Android has no sheet. The field opens the calendar and the chosen day is taken at once. */}
    {open && Platform.OS === "android" ? <DateTimePicker mode="date" display="default" value={localDate(validBookingDate(draft) ? draft : minimum)} minimumDate={localDate(minimum)} maximumDate={localDate(maximum)} onChange={(event, picked) => {
      setOpen(false);
      if (event.type !== "set" || !picked) return;
      const iso = isoOf(picked);
      if (iso >= minimum && iso <= maximum) onChange(iso);
    }} /> : null}
    {/* Elsewhere there is no such dialog: a typed date on the web and a wheel on iOS, each confirmed in a sheet. */}
    {open && Platform.OS !== "android" ? <SheetShell title={label} onClose={() => setOpen(false)}>
      {Platform.OS === "web" ? <FormInput label="Date (YYYY-MM-DD)" value={draft} placeholder="YYYY-MM-DD" onChangeText={setDraft} /> : <DateTimePicker mode="date" display="spinner" value={localDate(validBookingDate(draft) ? draft : minimum)} minimumDate={localDate(minimum)} maximumDate={localDate(maximum)} onChange={(event, picked) => {
        if (event.type === "set" && picked) setDraft(isoOf(picked));
      }} />}
      <Text style={[type.description, { color: colors.muted }]}>From {bookingDateLabel(minimum)} to {bookingDateLabel(maximum)}.</Text>
      <ActionButton disabled={!valid} label="Use this date" onPress={() => { if (valid) { onChange(draft); setOpen(false); } }} />
    </SheetShell> : null}
  </View>;
}
