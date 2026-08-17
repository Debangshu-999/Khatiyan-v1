import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
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
 * <p>Future months are refused in both paths: billing has nothing to show for a
 * month that has not started, and an empty screen reads as a fault.
 */
export function MonthSelector({
  onChange,
  value,
}: {
  onChange: (month: string) => void;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const [gridOpen, setGridOpen] = useState(false);

  const atCurrent = value >= currentMonth();

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
        <RoundIconButton icon={ChevronLeft} label="Previous month" onPress={() => onChange(shiftMonth(value, -1))} />

        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setGridOpen(true)}>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>{monthLabel(value)}</Text>
        </Pressable>

        <RoundIconButton
          disabled={atCurrent}
          icon={ChevronRight}
          label="Next month"
          onPress={() => onChange(shiftMonth(value, 1))}
        />
      </View>

      {gridOpen ? (
        <MonthGridModal
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
  onClose,
  onPick,
  value,
}: {
  onClose: () => void;
  onPick: (month: string) => void;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [year, setYear] = useState(Number(value.slice(0, 4)));

  const now = currentMonth();
  const thisYear = Number(now.slice(0, 4));
  const thisMonthIndex = Number(now.slice(5, 7)) - 1;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
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

            <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={10} onPress={onClose}>
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
                  onPress={() => onPick(month)}
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
      </View>
    </Modal>
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
      style={{
        alignItems: "center",
        borderColor: colors.ink,
        borderRadius: 12,
        borderWidth: 1,
        height: 40,
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        width: 40,
      }}
    >
      <Icon color={colors.ink} size={20} strokeWidth={2.2} />
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

export function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  // Never step past the current month.
  return next > currentMonth() ? currentMonth() : next;
}
