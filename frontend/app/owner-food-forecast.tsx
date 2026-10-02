import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SelectionTabs } from "@/components/selection-tabs";
import { AppBackground } from "@/components/app-background";
import { EmptyState } from "@/components/empty-state";
import { MarqueeText } from "@/components/marquee-text";
import { ScreenHeader } from "@/components/screen-header";
import { FoodForecastSkeleton } from "@/components/skeletons";
import { AlertModal } from "@/components/alert-modal";
import { useToast } from "@/components/toast";
import { useHardwareBack } from "@/components/use-hardware-back";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAvailableAccounts } from "@/features/account/accounts";
import { FloatingForecastChef } from "@/features/food/floating-forecast-chef";
import { beforeCutoff } from "@/features/food/meal-schedule-ui";
import {
  DAY_LABEL,
  DayStrip,
  MealGlyph,
  MEAL_LABEL,
  MEAL_ORDER,
  formatBulkQuantity,
  foodIcon,
  isoDate,
  shortDate,
  todayInIst,
  sevenDaysFrom,
  weekdayOf,
} from "@/features/food/food-ui";
import { useAppSelector } from "@/store/hooks";
import {
  useGetCookingForecastQuery,
  useGetFoodOverviewQuery,
  useGetMealScheduleQuery,
  useMarkFoodItemAvailableMutation,
  useMarkFoodItemUnavailableMutation,
  type ConsolidatedItemForecast,
  type MealSchedule,
  type SkippedItem,
} from "@/store/services/food-api";
import type { MealType } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * How much to cook, for one meal on one day.
 *
 * <p>The sheet somebody reads at six in the morning. It leads with the
 * consolidated total per item — what actually goes in the pot — and keeps the
 * per-profile split one tap away, because that only matters at the serving
 * counter.
 */
export default function OwnerFoodForecastScreen() {
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  // Today first, then the six days in front of it. A forecast is about real
  // dates, so a strip that started on Monday spent part of every week offering
  // days that had already been cooked.
  const week = useMemo(() => sevenDaysFrom(todayInIst()), []);
  const [date, setDate] = useState(() => todayInIst());
  const overviewQuery = useGetFoodOverviewQuery(propertyId, { skip: !propertyId });
  const served = useMemo(
    () => MEAL_ORDER.filter((meal) => (overviewQuery.data?.availableMeals ?? []).includes(meal)),
    [overviewQuery.data?.availableMeals],
  );
  // Polled, so a meal moves from Upcoming to Serving now to Served while the
  // screen is open. The server decides where each meal stands.
  const scheduleQuery = useGetMealScheduleQuery(propertyId, {
    pollingInterval: 30_000,
    skip: !propertyId,
    skipPollingIfUnfocused: true,
  });
  const schedule = scheduleQuery.data;

  // Opens on the meal being served, or the next one (user, 2026-09-29). Set
  // once: a meal ending while the screen is open does not move the tab.
  const [meal, setMeal] = useState<MealType | null>(null);
  const openedOn = useRef<MealType | null>(null);
  if (openedOn.current === null && schedule && served.length > 0) {
    openedOn.current = openingMeal(schedule, served);
  }
  const activeMeal =
    (meal && served.includes(meal) ? meal : null)
    ?? (openedOn.current && served.includes(openedOn.current) ? openedOn.current : null)
    // No schedule to go by: the first meal, as before.
    ?? (scheduleQuery.isError ? served[0] ?? null : null);

  // Where the picked meal stands today. Other days have no tag.
  const todayIso = isoDate(todayInIst());
  const dateIso = isoDate(date);
  const phase = activeMeal && dateIso === todayIso && schedule?.date === todayIso
    ? mealPhases(schedule)[activeMeal]
    : undefined;
  // Its dishes are fixed once it starts. The server refuses it too.
  const started = phase === "SERVING" || phase === "SERVED";
  // Dishes come off on the day itself (user, 2026-09-29).
  const laterDay = dateIso > todayIso;

  // And like a delay, only until 10 minutes before the meal starts, delay
  // included. The window closes on the clock rather than on new data, so the
  // screen re-renders every 30 s to fade the button in time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((count) => count + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const todaySlot = phase ? schedule?.today.find((slot) => slot.mealType === activeMeal) : undefined;
  const markWindowClosed = () =>
    Boolean(todaySlot && schedule && !beforeCutoff(todaySlot, schedule.delayCutoffMinutes));

  // The note under the button, when a tap cannot take the dish off.
  const [note, setNote] = useState<{ anchor: Anchor; message: string } | null>(null);
  const closeNote = useCallback(() => setNote(null), []);

  function tryMarkUnavailable(item: ConsolidatedItemForecast, anchor: Anchor) {
    if (laterDay) {
      setNote({
        anchor,
        message: dateIso === isoDate(sevenDaysFrom(todayInIst())[1])
          ? "You can mark it unavailable tomorrow."
          : `You can mark it unavailable on ${DAY_LABEL[weekdayOf(date)]}, ${shortDate(date)}.`,
      });
      return;
    }
    // Checked again at the tap: the fade can be up to 30 s behind the clock.
    if (markWindowClosed()) {
      setNote({ anchor, message: "Mark unavailable window has passed for this meal." });
      return;
    }
    setSkipping(item);
  }

  const forecastQuery = useGetCookingForecastQuery(
    { date: isoDate(date), mealType: activeMeal ?? "LUNCH", propertyId },
    { skip: !propertyId || !activeMeal },
  );
  const forecast = forecastQuery.data;

  const { canManage } = usePropertyPermissions(propertyId);
  const canChange = canManage("FOOD");
  const [skipping, setSkipping] = useState<ConsolidatedItemForecast | null>(null);
  const [restoring, setRestoring] = useState<SkippedItem | null>(null);
  const [markUnavailable, skipState] = useMarkFoodItemUnavailableMutation();
  const [markAvailable, restoreState] = useMarkFoodItemAvailableMutation();
  const opErrors = useFormErrors<never>();
  const toast = useToast();

  async function skip(item: ConsolidatedItemForecast) {
    setSkipping(null);
    if (!activeMeal) {
      return;
    }
    try {
      await markUnavailable({
        date: isoDate(date),
        itemId: item.itemId,
        mealType: activeMeal,
        propertyId,
      }).unwrap();
      toast.ok(`${item.itemName} is off today's ${MEAL_LABEL[activeMeal].toLowerCase()}`);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  async function restore(item: SkippedItem) {
    setRestoring(null);
    if (!activeMeal) {
      return;
    }
    try {
      await markAvailable({
        date: isoDate(date),
        itemId: item.itemId,
        mealType: activeMeal,
        propertyId,
      }).unwrap();
      toast.ok(`${item.itemName} is back on`);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  if (
    (!overviewQuery.data && overviewQuery.isFetching) ||
    // Waits for the schedule, which picks the meal it opens on.
    (Boolean(propertyId) && !schedule && !scheduleQuery.isError) ||
    (Boolean(activeMeal) && !forecastQuery.data && forecastQuery.isFetching)
  ) {
    return (
      <ForecastFrame
        header={<ScreenHeader
          italicTail="forecast."
          subtitle={property ? property.name : undefined}
          title="Cooking"
        />}
      >
        <FoodForecastSkeleton />
      </ForecastFrame>
    );
  }

  return (
    <ForecastFrame
      overlay={note ? <FloatingNote anchor={note.anchor} message={note.message} onClose={closeNote} /> : null}
      header={<>
        <ScreenHeader
        italicTail="forecast."
        subtitle={property ? `${property.name} · ${DAY_LABEL[weekdayOf(date)]}, ${shortDate(date)}` : undefined}
        title="Cooking"
        />

        <View style={{ flexShrink: 0, height: 64, overflow: "hidden" }}>
          <DayStrip
            onSelect={(day) => {
              const picked = week.find((candidate) => weekdayOf(candidate) === day);
              if (picked) {
                setDate(picked);
              }
            }}
            selected={weekdayOf(date)}
            showDates
            variant="contained"
            week={week}
          />
        </View>

        {served.length > 1 ? (
          <MealBubbles active={activeMeal ?? served[0]} meals={served} onChange={setMeal} />
        ) : null}

        {forecast && activeMeal && (forecast.consolidatedItems.length > 0 || forecast.unavailableItems.length > 0) ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <MealGlyph color={colors.ink} meal={activeMeal} size={19} />
            <HeadCount count={forecast.totalSubscribers} />
            {phase ? <PhaseChip phase={phase} /> : null}
          </View>
        ) : null}
      </>}
    >

      {/* Nothing at all until the property's meals are known. An unanswered
          query leaves `served` empty, which is indistinguishable from a
          property that serves no meals — and on a cold load the screen spent a
          second telling owners their property lists none. */}
      {!overviewQuery.data ? null : !activeMeal ? (
        <EmptyState
          description="This property does not list any meals yet, so there is nothing to forecast."
          icon={foodIcon("silverware-clean")}
          title="No meals to cook"
        />
      ) : !forecast
        || (forecast.consolidatedItems.length === 0 && forecast.unavailableItems.length === 0) ? (
        /* Skipped dishes count as something to show. Taking the last one off
           used to empty the list entirely, which left no way to put it back. */
        <EmptyState
          description={`Either no profile has a menu for ${MEAL_LABEL[activeMeal].toLowerCase()}, or nobody is subscribed to one that does.`}
          icon={foodIcon("pot-steam-outline")}
          title="Nothing to cook"
        />
      ) : (
        <>
          {forecast.consolidatedItems.map((item) => (
            <ForecastRow
              dimmed={phase === "SERVED"}
              item={item}
              key={item.itemId}
              markBlocked={markWindowClosed()}
              onMarkUnavailable={canChange ? (anchor) => tryMarkUnavailable(item, anchor) : undefined}
            />
          ))}

          {/* The ones taken off today, still in the list and greyed, rather
              than in a section of their own further down. The backend leaves
              them out of every quantity, so they arrive separately and are
              put back into the list here. */}
          {forecast.unavailableItems.map((item) => (
            <ForecastRow
              item={skippedAsForecast(item)}
              key={item.itemId}
              onRestore={canChange ? () => setRestoring(item) : undefined}
              restoreLocked={started}
              unavailable
            />
          ))}

        </>
      )}

      {skipping && activeMeal ? (
        <ConfirmDialog
          bullets={[
            `It comes off ${MEAL_LABEL[activeMeal].toLowerCase()} on ${DAY_LABEL[weekdayOf(date)]}, ${shortDate(date)} only.`,
            "Your weekly menu is not changed, so the same day next week still serves it.",
          ]}
          confirmLabel={skipState.isLoading ? "Marking…" : "Unavailable"}
          footnote="You can put it back at any time."
          message={`${skipping.itemName} will not be cooked for this meal.`}
          onCancel={() => setSkipping(null)}
          onConfirm={() => void skip(skipping)}
          title="Mark unavailable today?"
        />
      ) : null}

      {restoring && activeMeal ? (
        <ConfirmDialog
          confirmLabel={restoreState.isLoading ? "Putting back…" : "Available"}
          message={`${restoring.itemName} will be cooked for ${MEAL_LABEL[activeMeal].toLowerCase()} on ${DAY_LABEL[weekdayOf(date)]}, ${shortDate(date)} again.`}
          onCancel={() => setRestoring(null)}
          onConfirm={() => void restore(restoring)}
          title="Put this back on?"
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </ForecastFrame>
  );
}

/** Where a button sits on screen, from measureInWindow. */
type Anchor = { height: number; width: number; x: number; y: number };

/** Where a meal stands today (user, 2026-09-29). */
type MealPhase = "SERVED" | "SERVING" | "UPCOMING" | "LATER";

const PHASE_TAG: Record<MealPhase, { label: string; tone: "success" | "warning" | "neutral" }> = {
  LATER: { label: "Later today", tone: "neutral" },
  SERVED: { label: "Served", tone: "neutral" },
  SERVING: { label: "Serving now", tone: "success" },
  UPCOMING: { label: "Upcoming", tone: "warning" },
};

/**
 * Today's meals, tagged. The first meal not yet started is Upcoming, even
 * while another is being served, and the ones after it are Later today.
 */
function mealPhases(schedule: MealSchedule): Partial<Record<MealType, MealPhase>> {
  const phases: Partial<Record<MealType, MealPhase>> = {};
  let upcomingTaken = false;
  for (const slot of schedule.today) {
    if (slot.status === "DONE") {
      phases[slot.mealType] = "SERVED";
    } else if (slot.status === "SERVING") {
      phases[slot.mealType] = "SERVING";
    } else {
      phases[slot.mealType] = upcomingTaken ? "LATER" : "UPCOMING";
      upcomingTaken = true;
    }
  }
  return phases;
}

/**
 * The meal being served or the next one. After the day's last meal there is
 * no next meal until midnight, so it opens on the last one.
 */
function openingMeal(schedule: MealSchedule, served: MealType[]): MealType | null {
  const next = schedule.nextMeal?.mealType;
  if (next && served.includes(next)) {
    return next;
  }
  return served[served.length - 1] ?? null;
}

/**
 * The meal's tag, at the far right of the head-count row (user, 2026-09-29).
 * Sentence case, unlike the app's caps status pills, and the same tints.
 */
function PhaseChip({ phase }: { phase: MealPhase }) {
  const { colors, fonts } = useTheme();
  const tint = {
    neutral: { background: colors.neutralSoft, text: colors.neutralText },
    success: { background: colors.successSoft, text: colors.successText },
    warning: { background: colors.warningSoft, text: colors.warningText },
  }[PHASE_TAG[phase].tone];
  return (
    <View
      style={{
        backgroundColor: tint.background,
        borderRadius: 999,
        marginLeft: "auto",
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 4,
      }}
    >
      <Text numberOfLines={1} style={{ color: tint.text, fontFamily: fonts.sansBold, fontSize: 12 }}>
        {PHASE_TAG[phase].label}
      </Text>
    </View>
  );
}

/**
 * A small card under the button that was tapped (user, 2026-09-29). It says
 * why nothing happened, then goes away by itself or on any touch.
 *
 * <p>Drawn inside the screen, not in a Modal. A Modal is its own window on
 * Android, and its origin sat lower than the window the button was measured
 * in, so the card landed on the button. Here the layer measures itself in the
 * same window, and the button's position is taken relative to it.
 */
function FloatingNote({ anchor, message, onClose }: { anchor: Anchor; message: string; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  const layer = useRef<View>(null);
  const [frame, setFrame] = useState<{ height: number; width: number; x: number; y: number } | null>(null);
  const [cardHeight, setCardHeight] = useState(0);

  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  // The device back button closes the note rather than leaving the screen.
  const closeOnBack = useCallback(() => {
    onClose();
    return true;
  }, [onClose]);
  useHardwareBack(closeOnBack);

  const cardWidth = frame ? Math.min(260, frame.width - spacing.lg * 2) : 0;
  let left = 0;
  let top = 0;
  if (frame) {
    // Centred under the button, kept inside the screen, and above it only
    // when there is no room below.
    const buttonX = anchor.x - frame.x;
    const buttonY = anchor.y - frame.y;
    left = Math.min(
      Math.max(buttonX + anchor.width / 2 - cardWidth / 2, spacing.lg),
      frame.width - spacing.lg - cardWidth,
    );
    const below = buttonY + anchor.height + spacing.sm + 2;
    top = below + cardHeight > frame.height - spacing.lg ? buttonY - spacing.sm - 2 - cardHeight : below;
  }

  return (
    <View
      collapsable={false}
      onLayout={() => layer.current?.measureInWindow((x, y, width, height) => setFrame({ height, width, x, y }))}
      ref={layer}
      style={StyleSheet.absoluteFill}
    >
      {/* A clear backdrop as a sibling: any touch outside closes the note. */}
      <Pressable accessibilityLabel="Close" onPressIn={onClose} style={StyleSheet.absoluteFill} />
      {frame ? (
        <View
          accessibilityLiveRegion="polite"
          onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.borderStrong,
            borderRadius: radii.card,
            borderWidth: 1,
            elevation: 6,
            flexDirection: "row",
            gap: spacing.sm,
            left,
            // Hidden until measured, so it never flashes in the wrong place.
            opacity: cardHeight > 0 ? 1 : 0,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            position: "absolute",
            shadowColor: colors.shadow,
            shadowOffset: { height: 4, width: 0 },
            shadowOpacity: 0.16,
            shadowRadius: 12,
            top,
            width: cardWidth,
          }}
        >
          <MaterialCommunityIcons color={colors.ink} name="calendar-clock-outline" size={18} />
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 }}>
            {message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Keep the selectors fixed; only the forecast menu scrolls behind the chef. */
function ForecastFrame({
  children,
  header,
  overlay,
}: {
  children: ReactNode;
  header: ReactNode;
  /** Drawn over the whole screen, outside the scroll view: the floating note. */
  overlay?: ReactNode;
}) {
  const { colors } = useTheme();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ backgroundColor: colors.background, flex: 1 }}>
      <View pointerEvents="none" style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}>
        <AppBackground />
      </View>
      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setViewport((current) => current.width === width && current.height === height ? current : { width, height });
        }}
        style={{ flex: 1, gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}
      >
        <View style={{ flexShrink: 0, gap: spacing.lg }}>{header}</View>
        <ScrollView
          contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.sm }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {children}
        </ScrollView>
        <FloatingForecastChef viewport={viewport} />
      </View>
      {overlay}
    </SafeAreaView>
  );
}

/**
 * The grey disc a row's small controls sit in.
 *
 * <p>Two of them side by side need to read as two separate taps rather than a
 * pair of loose glyphs, and the fill is what gives each one an edge. Same disc
 * the app closes its sheets with, one size down for a list row.
 */
function iconWellStyle(background: string) {
  return {
    alignItems: "center" as const,
    backgroundColor: background,
    borderRadius: 999,
    height: 26,
    justifyContent: "center" as const,
    width: 26,
  };
}

/**
 * The number of mouths, spelled out.
 *
 * <p>Counts people actually being cooked for, not everyone on a profile: the
 * backend leaves out profiles with no menu at this meal, so this always agrees
 * with the quantities listed under it.
 */
function HeadCount({ count }: { count: number }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 14 }}>
      {count === 1 ? "Cooking for 1 person" : `Cooking for ${count} people`}
    </Text>
  );
}

/**
 * One item's total, with the per-profile split folded away.
 *
 * <p>Collapsed by default. A property with four profiles would otherwise open
 * this screen to forty lines, where the number anybody actually measures out is
 * the one on top.
 */
/**
 * A skipped dish, shaped like a forecast row.
 *
 * <p>The backend leaves an unavailable item out of every quantity — that is
 * the point of it — so it comes back as a bare name. The row renders no number
 * for one of these, so the zero here is never shown.
 */
function skippedAsForecast(item: SkippedItem): ConsolidatedItemForecast {
  return {
    itemId: item.itemId,
    itemName: item.itemName,
    profileBreakdown: [],
    quantityUnit: item.quantityUnit,
    targetQuantity: 0,
  };
}

function ForecastRow({
  dimmed,
  item,
  markBlocked,
  onMarkUnavailable,
  onRestore,
  restoreLocked,
  unavailable,
}: {
  /** Greyed, for a meal already served. */
  dimmed?: boolean;
  item: ConsolidatedItemForecast;
  /**
   * The window to take it off has passed. Faded, but a tap still reaches
   * `onMarkUnavailable`, which answers with a note saying so.
   */
  markBlocked?: boolean;
  /** The meal has started, so a dish can no longer be put back. */
  restoreLocked?: boolean;
  /**
   * Absent for a manager who may read the forecast but not change it. Gets
   * where the button is, for the note a later day answers with.
   */
  onMarkUnavailable?: (anchor: Anchor) => void;
  /** The way back, on a row that is already off today. */
  onRestore?: () => void;
  unavailable?: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const markButton = useRef<View>(null);
  const splittable = !unavailable && item.profileBreakdown.length > 1;
  const faded = unavailable || dimmed;

  return (
    <View
      style={{
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      {/* The controls sit in the middle, between the name and the number.
          Both outer zones take equal flex, so the pair lands halfway however
          long the name is — and the cluster holds a fixed width whether or not
          the row has a chevron, so the number column still lines up down the
          list. */}
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
        }}
      >
        <AnimatedPressable
          accessibilityLabel={`${item.itemName}, ${formatBulkQuantity(item.targetQuantity, item.quantityUnit)}`}
          accessibilityState={{ expanded: open }}
          disabled={!splittable}
          onPress={() => setOpen((current) => !current)}
          // Greyed where it stands rather than moved to a list of its own: a
          // dish that jumps to the bottom of the screen when you take it off
          // reads as something going wrong. The dimming is on the WORDS, not
          // on the row — the button that puts it back is the one live control
          // left, and a faded control reads as a disabled one.
          style={{ flex: 1, minWidth: 0, opacity: faded ? 0.5 : 1 }}
        >
          {/* Scrolls back and forth when it overflows rather than ellipsising.
              "Paneer butter ma..." is not a dish anyone can identify at a
              glance, and the column is narrow by design here. */}
          <MarqueeText style={[type.bodyStrong, { color: colors.ink }]}>{item.itemName}</MarqueeText>
          {splittable ? (
            <Text style={{ color: colors.kicker, fontFamily: fonts.sans, fontSize: 11.5 }}>
              across {item.profileBreakdown.length} profiles
            </Text>
          ) : null}
        </AnimatedPressable>

        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: spacing.xxs,
            justifyContent: "center",
            minWidth: 56,
          }}
        >
          {splittable ? (
            <AnimatedPressable
              accessibilityLabel={open ? "Hide the profile split" : "Show the profile split"}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => setOpen((current) => !current)}
            >
              <View style={iconWellStyle(colors.surfaceSunken)}>
                <MaterialCommunityIcons
                  color={colors.ink}
                  name={open ? "chevron-up" : "chevron-down"}
                  size={16}
                />
              </View>
            </AnimatedPressable>
          ) : null}
          {/* One button, both directions. Off today it turns into the way
              back, in the same place — so the control that took the dish off
              is the control that returns it. */}
          {/* Blocked, not hidden (2026-09-29): the button stays where it was,
              faded, so the row does not reflow. */}
          {unavailable && onRestore ? (
            <AnimatedPressable
              accessibilityLabel={`Put ${item.itemName} back on today`}
              accessibilityRole="button"
              accessibilityState={{ disabled: restoreLocked }}
              disabled={restoreLocked}
              hitSlop={6}
              onPress={onRestore}
            >
              <View style={[iconWellStyle(colors.surfaceSunken), { opacity: restoreLocked ? 0.4 : 1 }]}>
                <MaterialCommunityIcons
                  color={restoreLocked ? colors.muted : colors.primary}
                  name="food-outline"
                  size={16}
                />
              </View>
            </AnimatedPressable>
          ) : onMarkUnavailable ? (
            <AnimatedPressable
              accessibilityHint={markBlocked ? "The window to mark it unavailable has passed" : undefined}
              accessibilityLabel={`Mark ${item.itemName} unavailable today`}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => {
                const button = markButton.current;
                if (!button) {
                  onMarkUnavailable({ height: 0, width: 0, x: 0, y: 0 });
                  return;
                }
                button.measureInWindow((x, y, width, height) => onMarkUnavailable({ height, width, x, y }));
              }}
            >
              {/* The disc lives on a plain View inside the pressable. Put on
                  the pressable itself it never painted — AnimatedPressable
                  owns that style slot for its press animation. */}
              <View
                collapsable={false}
                ref={markButton}
                style={[iconWellStyle(colors.surfaceSunken), { opacity: markBlocked ? 0.4 : 1 }]}
              >
                <MaterialCommunityIcons
                  color={markBlocked ? colors.muted : colors.ink}
                  name="minus-circle-outline"
                  size={17}
                />
              </View>
            </AnimatedPressable>
          ) : null}
        </View>

        <View
          style={{
            alignItems: "flex-end",
            flex: 1,
            minWidth: 0,
            opacity: faded ? 0.5 : 1,
          }}
        >
          {unavailable ? (
            // No number, because there is no quantity: it is not being cooked.
            // A struck-through figure would still be a figure to misread.
            <Text
              numberOfLines={1}
              style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12.5 }}
            >
              Not cooking
            </Text>
          ) : (
            <Text numberOfLines={1} style={[type.metric, { color: colors.ink, fontSize: 17 }]}>
              {formatBulkQuantity(item.targetQuantity, item.quantityUnit)}
            </Text>
          )}
        </View>
      </View>

      {open
        ? item.profileBreakdown.map((split) => (
            <View
              key={split.profileId}
              style={{
                backgroundColor: colors.surfaceRaised,
                borderTopColor: colors.border,
                borderTopWidth: 1,
                flexDirection: "row",
                gap: spacing.sm,
                justifyContent: "space-between",
                opacity: dimmed ? 0.5 : 1,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text numberOfLines={1} style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.sans, fontSize: 12.5 }}>
                {split.profileName}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
                {formatBulkQuantity(split.targetQuantity, item.quantityUnit)}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

/**
 * The meals as a row of bubbles (user, 2026-09-28), chosen the same way as
 * the transaction filters: a grey selected label and a black underline.
 */
function MealBubbles({
  active,
  meals,
  onChange,
}: {
  active: MealType;
  meals: MealType[];
  onChange: (meal: MealType) => void;
}) {
  return <SelectionTabs active={active} onChange={onChange} distributed gap={spacing.sm} options={meals.map((meal) => ({ value: meal, label: MEAL_LABEL[meal], icon: (color) => <MealGlyph color={color} meal={meal} size={16} /> }))} />;
}
