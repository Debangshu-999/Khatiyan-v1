import { useState } from "react";
import { SheetCloseButton } from "@/components/help-modal-header";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { dayAllowed, monthCells, openingMonth, stepMonth } from "@/components/calendar-month";
import { MONTH_NAMES, MonthTile, RoundIconButton, monthLabel } from "@/components/month-selector";
import { istToday } from "@/features/analytics/period";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_HEIGHT = 44;
const YEARS_PER_PAGE = 12;

/**
 * The app's date picker, in place of Android's own dialog (user, 2026-11-01). The
 * month changer's sheet showing one month's days.
 *
 * <p>The title opens the month grid and its year opens a year grid, so a date of
 * birth decades back is three taps, not three hundred arrows.
 *
 * <p>Opens on `value`'s month, else `initialMonth`, else this month, always inside
 * `minimum` and `maximum`. Dates outside them are shown but cannot be picked.
 * `onClose` runs on every way out, after `onPick` when a day was picked.
 */
export function CalendarPicker({
  initialMonth,
  maximum,
  minimum,
  onClose,
  onPick,
  value,
}: {
  /** "YYYY-MM", used only while there is no `value`. */
  initialMonth?: string;
  maximum?: string;
  minimum?: string;
  onClose: () => void;
  onPick: (iso: string) => void;
  value?: string | null;
}) {
  const { colors, fonts } = useTheme();
  const today = istToday();
  const [month, setMonth] = useState(() => openingMonth({ initialMonth, maximum, minimum, today, value }));
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const year = Number(month.slice(0, 4));
  const [yearPage, setYearPage] = useState(() => Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE);

  const minMonth = minimum?.slice(0, 7);
  const maxMonth = maximum?.slice(0, 7);
  const minYear = minMonth ? Number(minMonth.slice(0, 4)) : undefined;
  const maxYear = maxMonth ? Number(maxMonth.slice(0, 4)) : undefined;

  // The one header, whichever grid is showing: its arrows and its title's tap change with the view.
  const header = view === "days"
    ? {
        back: !!minMonth && month <= minMonth,
        forward: !!maxMonth && month >= maxMonth,
        label: monthLabel(month),
        onBack: () => setMonth(stepMonth(month, -1)),
        onForward: () => setMonth(stepMonth(month, 1)),
        onTitle: () => setView("months"),
        unit: "month",
      }
    : view === "months"
      ? {
          back: minYear != null && year <= minYear,
          forward: maxYear != null && year >= maxYear,
          label: String(year),
          onBack: () => setMonth(stepMonth(month, -12)),
          onForward: () => setMonth(stepMonth(month, 12)),
          onTitle: () => {
            setYearPage(Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE);
            setView("years");
          },
          unit: "year",
        }
      : {
          back: minYear != null && yearPage <= minYear,
          forward: maxYear != null && yearPage + YEARS_PER_PAGE > maxYear,
          label: `${yearPage} to ${yearPage + YEARS_PER_PAGE - 1}`,
          onBack: () => setYearPage(yearPage - YEARS_PER_PAGE),
          onForward: () => setYearPage(yearPage + YEARS_PER_PAGE),
          onTitle: () => setView("months"),
          unit: "years",
        };

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => (
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <SheetCloseButton onClose={() => dismiss()} />
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
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
              <RoundIconButton disabled={header.back} icon={ChevronLeft} label={`Previous ${header.unit}`} onPress={header.onBack} />
              <AnimatedPressable
                accessibilityHint="Changes the month or year"
                accessibilityRole="button"
                onPress={header.onTitle}
                style={{ alignItems: "center", flex: 1 }}
              >
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>{header.label}</Text>
              </AnimatedPressable>
              <RoundIconButton disabled={header.forward} icon={ChevronRight} label={`Next ${header.unit}`} onPress={header.onForward} />
            </View>

            {/* The same height on all three grids, so the sheet does not jump under a finger. */}
            <View style={{ minHeight: DAY_HEIGHT * 6 + 28 }}>
              {view === "days" ? (
                <>
                  <View style={{ flexDirection: "row", height: 28 }}>
                    {WEEKDAYS.map((name) => (
                      <Text key={name} style={{ color: colors.muted, flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 12, textAlign: "center" }}>
                        {name}
                      </Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {monthCells(month).map((iso, cell) => (
                      <View key={iso ?? `blank-${cell}`} style={{ height: DAY_HEIGHT, padding: 2, width: `${100 / 7}%` }}>
                        {iso ? (
                          <DayCell
                            allowed={dayAllowed(iso, minimum, maximum)}
                            isToday={iso === today}
                            label={String(Number(iso.slice(8)))}
                            onPress={() => dismiss(() => {
                              onPick(iso);
                              onClose();
                            })}
                            selected={iso === value}
                          />
                        ) : null}
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {view === "months"
                    ? MONTH_NAMES.map((name, index) => {
                        const candidate = `${year}-${String(index + 1).padStart(2, "0")}`;
                        return (
                          <MonthTile
                            disabled={(!!minMonth && candidate < minMonth) || (!!maxMonth && candidate > maxMonth)}
                            key={name}
                            label={name}
                            onPress={() => {
                              setMonth(candidate);
                              setView("days");
                            }}
                            selected={candidate === month}
                          />
                        );
                      })
                    : Array.from({ length: YEARS_PER_PAGE }, (_, index) => {
                        const candidate = yearPage + index;
                        return (
                          <MonthTile
                            disabled={(minYear != null && candidate < minYear) || (maxYear != null && candidate > maxYear)}
                            key={candidate}
                            label={String(candidate)}
                            onPress={() => {
                              setMonth(openingMonth({ maximum, minimum, today, value: `${candidate}${month.slice(4)}-01` }));
                              setView("months");
                            }}
                            selected={candidate === year}
                          />
                        );
                      })}
                </View>
              )}
            </View>

            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
          </View>
        </View>
      )}
    </BottomSheetModal>
  );
}

function DayCell({
  allowed,
  isToday,
  label,
  onPress,
  selected,
}: {
  allowed: boolean;
  isToday: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !allowed, selected }}
      disabled={!allowed}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.ink : "transparent",
        borderColor: selected || isToday ? colors.ink : "transparent",
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        justifyContent: "center",
        opacity: allowed ? 1 : 0.35,
      }}
    >
      <Text style={{ color: selected ? colors.surface : colors.ink, fontFamily: selected || isToday ? fonts.sansBold : fonts.sansMedium, fontSize: 15 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
