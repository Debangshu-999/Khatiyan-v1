import { useState } from "react";
import { Text, View, type ViewStyle } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FieldError } from "@/components/field-error";
import { SheetShell } from "@/components/sheet-shell";
import { customRangeErrors, formatDateRange, istToday, PRESET_LABELS, PRESET_ORDER, presetSubtitle, type PeriodPreset } from "@/features/analytics/period";
import { ActionButton } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Picked = { preset: PeriodPreset; from?: string; to?: string };

function isoOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function RangeDateField({ label, max, min, onChange, value }: { label: string; max: string; min: string | null; onChange: (iso: string) => void; value: string | null }) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{label}</Text>
      <AnimatedPressable
        accessibilityLabel={`${label}, ${value ?? "not picked"}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{ alignItems: "center", borderColor: colors.borderStrong, borderRadius: radii.lg, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.sm }}
      >
        <CalendarDays color={colors.muted} size={15} strokeWidth={2} />
        <Text style={{ color: value ? colors.ink : colors.muted, fontFamily: fonts.sans, fontSize: 13 }}>{value ? formatDateRange(value, value) : "Pick a date"}</Text>
      </AnimatedPressable>
      {open ? (
        <DateTimePicker
          display="default"
          maximumDate={new Date(`${max}T12:00:00`)}
          minimumDate={min ? new Date(`${min}T12:00:00`) : undefined}
          mode="date"
          onChange={(event: DateTimePickerEvent, picked?: Date) => {
            setOpen(false);
            if (event.type === "dismissed" || !picked) return;
            onChange(isoOf(picked));
          }}
          value={value ? new Date(`${value}T12:00:00`) : new Date(`${max}T12:00:00`)}
        />
      ) : null}
    </View>
  );
}

/** The seven periods, each with its real dates, and a custom range that expands in place. */
export function PeriodPickerSheet({ current, dataSince, onApply, onClose }: { current: Picked; dataSince: string | null; onApply: (picked: Picked) => void; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  const today = istToday();
  const [customOpen, setCustomOpen] = useState(current.preset === "CUSTOM");
  const [from, setFrom] = useState<string | null>(current.from ?? null);
  const [to, setTo] = useState<string | null>(current.to ?? null);
  const [submitted, setSubmitted] = useState(false);
  const errors = customRangeErrors(from, to, today, dataSince);

  function applyCustom() {
    setSubmitted(true);
    if (errors.from || errors.to || !from || !to) return;
    onApply({ from, preset: "CUSTOM", to });
  }

  // The picked period is a grey row, not a tick: the fill says "this one" at a
  // glance. Grey, never pale blue, and the row loses its divider while filled.
  const rowStyle = (selected: boolean, divider: boolean): ViewStyle => ({
    alignItems: "center",
    backgroundColor: selected ? colors.surfaceSunken : "transparent",
    borderBottomColor: divider && !selected ? colors.border : "transparent",
    borderBottomWidth: divider ? 1 : 0,
    borderRadius: selected ? radii.md : 0,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  });

  return (
    <SheetShell dismissOnDrag onClose={onClose} title="Period">
      <View>
        {PRESET_ORDER.filter((preset) => preset !== "CUSTOM").map((preset) => {
          const selected = current.preset === preset;
          return (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={preset}
              onPress={() => onApply({ preset })}
              style={rowStyle(selected, true)}
            >
              {/* The period's dates sit to the side, so each row is one line. */}
              <Text style={{ color: colors.ink, flex: 1, fontFamily: selected ? fonts.sansBold : fonts.sans, fontSize: 15 }}>{PRESET_LABELS[preset]}</Text>
              <Text numberOfLines={2} style={{ color: colors.muted, flexShrink: 1, fontFamily: fonts.sans, fontSize: 12, maxWidth: "60%", textAlign: "right" }}>
                {presetSubtitle(preset, today, dataSince)}
              </Text>
            </AnimatedPressable>
          );
        })}
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityState={{ expanded: customOpen, selected: current.preset === "CUSTOM" }}
          onPress={() => setCustomOpen((open) => !open)}
          style={rowStyle(current.preset === "CUSTOM", false)}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontFamily: current.preset === "CUSTOM" ? fonts.sansBold : fonts.sans, fontSize: 15 }}>{PRESET_LABELS.CUSTOM}</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{presetSubtitle("CUSTOM", today, dataSince)}</Text>
          </View>
          {customOpen ? <ChevronUp color={colors.muted} size={18} /> : <ChevronDown color={colors.muted} size={18} />}
        </AnimatedPressable>
        {customOpen ? (
          <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <RangeDateField label="From" max={today} min={dataSince} onChange={setFrom} value={from} />
                {submitted ? <FieldError message={errors.from} /> : null}
              </View>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <RangeDateField label="To" max={today} min={dataSince} onChange={setTo} value={to} />
                {submitted ? <FieldError message={errors.to} /> : null}
              </View>
            </View>
            <ActionButton label="Apply range" onPress={applyCustom} />
          </View>
        ) : null}
      </View>
    </SheetShell>
  );
}
