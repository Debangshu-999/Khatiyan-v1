import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Month picker: step one month at a time with the arrows, or tap the label to
 * jump anywhere.
 *
 * <p>Stepping covers the common case — an owner reviewing last month — without
 * a modal. The grid covers the rare one, going back half a year, which stepping
 * makes tedious. Both write the same `YYYY-MM` value.
 *
 * <p>Future months are refused in both paths by default: billing has nothing to
 * show for a month that has not started, and an empty screen reads as a fault.
 * A screen that DOES have something there raises {@link maxMonth}.
 */
export function MonthSelector({
  maxMonth,
  onChange,
  value,
}: {
  /**
   * The furthest month that may be selected, `YYYY-MM`. Defaults to the
   * current one.
   *
   * <p>Billing raises this to next month once the first bill for it exists.
   * Cycles are generated on each tenancy's own anniversary day, so a cycle
   * starting on the 3rd is created on the 3rd — and if next month cannot be
   * opened until next month begins, the owner loses most of the window in
   * which that bill can still be changed.
   */
  maxMonth?: string;
  onChange: (month: string) => void;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const [gridOpen, setGridOpen] = useState(false);

  const limit = maxMonth && maxMonth > currentMonth() ? maxMonth : currentMonth();
  const atCurrent = value >= limit;

  return (
    <>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 16,
          borderWidth: 1,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
        }}
      >
        <RoundIconButton icon={ChevronLeft} label="Previous month" onPress={() => onChange(shiftMonth(value, -1, limit))} />

        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setGridOpen(true)}
          style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}
        >
          <CalendarDays color={colors.ink} size={19} strokeWidth={2.1} />
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>{monthLabel(value)}</Text>
        </Pressable>

        <RoundIconButton
          disabled={atCurrent}
          icon={ChevronRight}
          label="Next month"
          onPress={() => onChange(shiftMonth(value, 1, limit))}
        />
      </View>

      {gridOpen ? (
        <MonthGridModal
          maxMonth={limit}
          onClose={() => setGridOpen(false)}
          onPick={(month) => {
            onChange(month);
            setGridOpen(false);
          }}
          value={value}
        />
      ) : null}
    </>
  );
}

function MonthGridModal({
  maxMonth,
  onClose,
  onPick,
  value,
}: {
  maxMonth: string;
  onClose: () => void;
  onPick: (month: string) => void;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [year, setYear] = useState(Number(value.slice(0, 4)));

  // The furthest month, which is usually this one but may be the next — and
  // in December "next month" is in the following YEAR, so the year stepper
  // has to read the same limit rather than assume the current year.
  const thisYear = Number(maxMonth.slice(0, 4));
  const thisMonthIndex = Number(maxMonth.slice(5, 7)) - 1;

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
          }}
        >
          {/* Year stepper sits top-left, close on the right. */}
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: spacing.md,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <RoundIconButton icon={ChevronLeft} label="Previous year" onPress={() => setYear(year - 1)} />
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, minWidth: 62, textAlign: "center" }}>
                {year}
              </Text>
              <RoundIconButton
                disabled={year >= thisYear}
                icon={ChevronRight}
                label="Next year"
                onPress={() => setYear(year + 1)}
              />
            </View>

            <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={10} onPress={() => dismiss()}>
              <X color={colors.ink} size={20} strokeWidth={2.2} />
            </Pressable>
          </View>

          {/* Rows of three. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {MONTH_NAMES.map((name, index) => {
              const month = `${year}-${String(index + 1).padStart(2, "0")}`;
              const selected = month === value;
              const future = year > thisYear || (year === thisYear && index > thisMonthIndex);

              return (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: future, selected }}
                  disabled={future}
                  key={name}
                  onPress={() => dismiss(() => onPick(month))}
                  style={{
                    alignItems: "center",
                    backgroundColor: selected ? colors.ink : "transparent",
                    borderColor: selected ? colors.ink : colors.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    // Three across, accounting for the two gaps between them.
                    flexBasis: "31%",
                    flexGrow: 1,
                    justifyContent: "center",
                    opacity: future ? 0.35 : 1,
                    paddingVertical: spacing.md,
                  }}
                >
                  <Text
                    style={[
                      type.body,
                      { color: selected ? colors.surface : colors.ink, fontFamily: fonts.sansBold },
                    ]}
                  >
                    {name}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>

          <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
        </View>
      </View>}
    </BottomSheetModal>
  );
}

function RoundIconButton({
  disabled = false,
  icon: Icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: typeof ChevronLeft;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      // A small grey disc, the same treatment as the header back and close
      // buttons. Outlined at 40pt these were two ink-bordered boxes flanking
      // the month, which gave stepping through months the same weight as the
      // month itself.
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderRadius: 999,
        height: 30,
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        width: 30,
      }}
    >
      <Icon color={colors.inkSoft} size={16} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}

export function monthLabel(value: string) {
  const [year, month] = value.split("-");
  const index = Number(month) - 1;
  return `${MONTH_NAMES[index] ?? month} ${year}`;
}

export function currentMonth() {
  // IST, to match the backend's month boundaries.
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}

export function shiftMonth(value: string, delta: number, maxMonth = currentMonth()) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  // Never step past the furthest month the caller allows.
  return next > maxMonth ? maxMonth : next;
}

const MONTH_FULL_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "October" — the month written out, for a sentence rather than a chip. */
export function monthName(value: string) {
  const index = Number(value.split("-")[1]) - 1;
  return MONTH_FULL_NAMES[index] ?? value;
}
