import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { MarqueeText } from "@/components/marquee-text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { FoodForecastSkeleton } from "@/components/skeletons";
import { UnderlineTabs } from "@/components/underline-tabs";
import { AlertModal } from "@/components/alert-modal";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ConfirmDialog, NoticeBar } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAvailableAccounts } from "@/features/account/accounts";
import {
  DAY_LABEL,
  DayStrip,
  MEAL_ICON,
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
  useMarkFoodItemAvailableMutation,
  useMarkFoodItemUnavailableMutation,
  type ConsolidatedItemForecast,
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
  const [meal, setMeal] = useState<MealType | null>(null);
  const activeMeal = meal && served.includes(meal) ? meal : served[0] ?? null;

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
    (Boolean(activeMeal) && !forecastQuery.data && forecastQuery.isFetching)
  ) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          italicTail="forecast."
          subtitle={property ? property.name : undefined}
          title="Cooking"
        />
        <FoodForecastSkeleton />
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="forecast."
        subtitle={property ? `${property.name} · ${DAY_LABEL[weekdayOf(date)]}, ${shortDate(date)}` : undefined}
        title="Cooking"
      />

      <DayStrip
        onSelect={(day) => {
          const picked = week.find((candidate) => weekdayOf(candidate) === day);
          if (picked) {
            setDate(picked);
          }
        }}
        selected={weekdayOf(date)}
        showDates
        week={week}
      />

      {served.length > 1 ? (
        /* The same strip the food workspace uses for its own sections, rather
           than a pill switcher — these are views of one screen, not a filter
           being set. */
        <UnderlineTabs<MealType>
          active={activeMeal ?? served[0]}
          bleed={spacing.lg}
          onChange={setMeal}
          options={served.map((value) => ({ label: MEAL_LABEL[value], value }))}
          tone="plain"
        />
      ) : null}

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
      ) : !forecast || forecast.consolidatedItems.length === 0 ? (
        <EmptyState
          description={`Either no profile has a menu for ${MEAL_LABEL[activeMeal].toLowerCase()}, or nobody is subscribed to one that does.`}
          icon={foodIcon("pot-steam-outline")}
          title="Nothing to cook"
        />
      ) : (
        <>
          <View
            style={{
              alignItems: "center",
              borderColor: "transparent",
              flexDirection: "row",
              gap: spacing.sm,
            }}
          >
            <MaterialCommunityIcons color={colors.ink} name={MEAL_ICON[activeMeal]} size={19} />
            <HeadCount count={forecast.totalSubscribers} />
          </View>

          {forecast.consolidatedItems.map((item) => (
            <ForecastRow
              item={item}
              key={item.itemId}
              onMarkUnavailable={canChange ? () => setSkipping(item) : undefined}
            />
          ))}

          {/* What was taken off today, and the way back. Without this the only
              trace of a skip is a dish that silently stopped appearing. */}
          {forecast.unavailableItems.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={{ color: colors.kicker, fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" }}>
                Not cooking today
              </Text>
              {forecast.unavailableItems.map((item) => (
                <View
                  key={item.itemId}
                  style={{
                    alignItems: "center",
                    borderColor: colors.border,
                    borderRadius: radii.card,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <MaterialCommunityIcons color={colors.muted} name="food-off-outline" size={17} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <MarqueeText style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13.5 }}>
                      {item.itemName}
                    </MarqueeText>
                  </View>
                  {canChange ? (
                    <AnimatedPressable
                      accessibilityLabel={`Put ${item.itemName} back on today`}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setRestoring(item)}
                    >
                      <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
                        Put back
                      </Text>
                    </AnimatedPressable>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {/* The owner's judgement leads, the arithmetic supports it. Earlier
              versions opened with how the number was built and buried the point
              at the end — which read as the app telling a cook how much to
              cook, from standing subscriptions and no daily attendance. */}
          <NoticeBar
            message="You know your kitchen and your tenants better than this number does. It counts every subscriber as eating and already includes your buffers, so it runs high. Use it as a rough guide and let your own experience decide what actually gets cooked."
            title="Trust your own estimate"
            tone="warning"
          />
        </>
      )}

      {skipping && activeMeal ? (
        <ConfirmDialog
          bullets={[
            `It comes off ${MEAL_LABEL[activeMeal].toLowerCase()} on ${DAY_LABEL[weekdayOf(date)]}, ${shortDate(date)} only.`,
            "Your weekly menu is not changed, so the same day next week still serves it.",
          ]}
          confirmLabel={skipState.isLoading ? "Marking…" : "Mark unavailable"}
          footnote="You can put it back at any time."
          message={`${skipping.itemName} will not be cooked for this meal.`}
          onCancel={() => setSkipping(null)}
          onConfirm={() => void skip(skipping)}
          title="Mark unavailable today?"
        />
      ) : null}

      {restoring && activeMeal ? (
        <ConfirmDialog
          confirmLabel={restoreState.isLoading ? "Putting back…" : "Put back"}
          message={`${restoring.itemName} will be cooked for ${MEAL_LABEL[activeMeal].toLowerCase()} on ${DAY_LABEL[weekdayOf(date)]}, ${shortDate(date)} again.`}
          onCancel={() => setRestoring(null)}
          onConfirm={() => void restore(restoring)}
          title="Put this back on?"
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </ScreenScrollView>
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
function ForecastRow({
  item,
  onMarkUnavailable,
}: {
  item: ConsolidatedItemForecast;
  /** Absent for a manager who may read the forecast but not change it. */
  onMarkUnavailable?: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const splittable = item.profileBreakdown.length > 1;

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
          style={{ flex: 1, minWidth: 0 }}
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
          {onMarkUnavailable ? (
            <AnimatedPressable
              accessibilityLabel={`Mark ${item.itemName} unavailable today`}
              accessibilityRole="button"
              hitSlop={6}
              onPress={onMarkUnavailable}
            >
              {/* The disc lives on a plain View inside the pressable. Put on
                  the pressable itself it never painted — AnimatedPressable
                  owns that style slot for its press animation. */}
              <View style={iconWellStyle(colors.surfaceSunken)}>
                <MaterialCommunityIcons color={colors.ink} name="food-off-outline" size={16} />
              </View>
            </AnimatedPressable>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end", flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.metric, { color: colors.ink, fontSize: 17 }]}>
            {formatBulkQuantity(item.targetQuantity, item.quantityUnit)}
          </Text>
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
