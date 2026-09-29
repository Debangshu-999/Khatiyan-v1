import { useCallback, useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react-native";
import { Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { FieldError } from "@/components/field-error";
import { MarqueeText } from "@/components/marquee-text";
import { PickerOptionRow } from "@/components/picker-option-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { FoodMenuSkeleton, FoodTenantMenuRowsSkeleton, FoodTenantSkeleton } from "@/components/skeletons";
import { useToast } from "@/components/toast";
import { useHardwareBack } from "@/components/use-hardware-back";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  DAY_LABEL,
  DAY_ORDER,
  DayStrip,
  MEAL_LABEL,
  MEAL_ORDER,
  FOOD_CATEGORY_LABEL,
  FoodProfileMark,
  isoDate,
  FoodStatusChip,
  NoDescription,
  foodIcon,
  formatMealWindow,
  formatQuantity,
  shortDate,
  todayInIst,
  weekStartingOn,
  weekdayOf,
} from "@/features/food/food-ui";
import { TenantMealIcon, TenantMenuItemRow } from "@/features/food/tenant-food-ui";
import { DelayedChip } from "@/features/food/meal-schedule-ui";
import {
  useGetMyFoodAvailabilityQuery,
  useGetMyFoodProfileMenuQuery,
  useGetMyFoodSkipsQuery,
  useGetMyFoodSubscriptionQuery,
  useGetMyMealScheduleQuery,
  useListMyFoodProfilesQuery,
  useSubscribeToFoodProfileMutation,
  useUnsubscribeFromFoodMutation,
  type DayOfWeek,
  type FoodPlan,
  type FoodPlanDay,
  type FoodPlanVersion,
  type FoodProfile,
} from "@/store/services/food-api";
import type { MealType } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The tenant's own food: which plan they are on, and what it feeds them.
 *
 * <p>Read-only apart from the plan itself. The menu and its portions belong to
 * the property, so this screen shows them and says plainly that it is showing
 * rather than offering.
 */
export default function TenancyFoodScreen() {
  const { colors, fonts } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();
  const opErrors = useFormErrors<never>();

  const [choosing, setChoosing] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  // Every choice asks first, with words for what it does to today and tomorrow.
  const [pending, setPending] = useState<PlanChoice | null>(null);
  const [buildingWeek, setBuildingWeek] = useState(false);

  const availabilityQuery = useGetMyFoodAvailabilityQuery();
  const subscriptionQuery = useGetMyFoodSubscriptionQuery();
  const profilesQuery = useListMyFoodProfilesQuery(undefined, {
    skip: !availabilityQuery.data?.moduleEnabled,
  });

  const availability = availabilityQuery.data;
  const plan = subscriptionQuery.data ?? null;
  const hasPlan = Boolean(plan?.today || plan?.fromTomorrow);
  const tomorrow = dayDateLabel(addDays(todayInIst(), 1));

  // The plan list is a step inside this screen, not a route of its own, so the
  // device back steps out of it the way "Keep my current plan" does, instead
  // of leaving Food preference (user, 2026-09-29).
  const closePlanList = useCallback(() => {
    setChoosing(false);
    return true;
  }, []);
  useHardwareBack(closePlanList, choosing && hasPlan);

  const [subscribe, subscribeState] = useSubscribeToFoodProfileMutation();
  const [unsubscribe, unsubscribeState] = useUnsubscribeFromFoodMutation();

  /** Asks first, unless the choice would change nothing. */
  function propose(choice: PlanChoice) {
    const copy = choiceCopy(plan, choice, tomorrow);
    if (!copy) {
      toast.ok("That is already your plan");
      return;
    }
    setPending(choice);
  }

  async function choose(choice: PlanChoice) {
    const copy = choiceCopy(plan, choice, tomorrow);
    setPending(null);
    setChoosing(false);
    try {
      await subscribe(choice.kind === "profile" ? { profileId: choice.profile.id } : { days: choice.days }).unwrap();
      if (copy) {
        toast.ok(copy.toast);
      }
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  async function stop() {
    const copy = stopCopy(plan);
    setConfirmStop(false);
    try {
      await unsubscribe().unwrap();
      toast.ok(copy.toast);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  const header = (
    <ScreenHeader
      italicTail="preference."
      subtitle="Your meal plan and repeating weekly menu"
      title="Food"
    />
  );

  function openMenu(profileId: string) {
    router.push({ params: { profileId }, pathname: "/tenancy-food-menu" });
  }

  async function refresh() {
    await availabilityQuery.refetch();
    await subscriptionQuery.refetch();
  }

  if (
    (!availability && availabilityQuery.isFetching) ||
    (subscriptionQuery.data === undefined && subscriptionQuery.isFetching) ||
    (availability?.moduleEnabled && !hasPlan && !profilesQuery.data && profilesQuery.isFetching)
  ) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        {header}
        <FoodTenantSkeleton />
      </ScreenScrollView>
    );
  }

  if (availabilityQuery.isError) {
    return (
      <ScreenScrollView onRefresh={refresh} safeAreaEdges={["top", "bottom"]}>
        {header}
        <EmptyState
          compact
          description="Pull down to try again."
          icon={foodIcon("alert-circle-outline")}
          title="Could not load your food plan"
        />
      </ScreenScrollView>
    );
  }

  const stopDialog = confirmStop && plan ? (
    <StopDialog
      busy={unsubscribeState.isLoading}
      onCancel={() => setConfirmStop(false)}
      onConfirm={() => void stop()}
      plan={plan}
    />
  ) : null;

  // The property does not serve food, or has stopped managing it here. Either
  // way there is nothing for a tenant to choose — but an existing plan is
  // still shown, because it is theirs and stopping it must stay possible.
  if (availability && (!availability.foodAvailableInProperty || !availability.moduleEnabled)) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        {header}
        {plan && hasPlan ? (
          <PlanCard onStop={plan.endsTonight ? undefined : () => setConfirmStop(true)} plan={plan} tomorrow={tomorrow} />
        ) : null}
        <EmptyState
          description={
            availability.foodAvailableInProperty
              ? "Your property is handling meals outside the app at the moment. Ask them what is being served."
              : "Your property does not serve meals."
          }
          icon={foodIcon("silverware-clean")}
          title="No meal plans here"
        />
        {stopDialog}
        {opErrors.serverError ? (
          <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
        ) : null}
      </ScreenScrollView>
    );
  }

  const profiles = profilesQuery.data ?? [];
  // The plan that applies from tomorrow on: a scheduled change, else today's
  // unless it ends tonight. That is the one "Your plan" marks in the list.
  const goingForward = plan?.fromTomorrow ?? (plan?.endsTonight ? null : plan?.today ?? null);
  const todayPlan = plan?.today ?? null;
  const todaysProfileId = todayPlan ? dayProfile(todayPlan, weekdayOf(todayInIst()))?.profileId ?? null : null;
  const pendingCopy = pending ? choiceCopy(plan, pending, tomorrow) : null;

  return (
    <ScreenScrollView onRefresh={refresh} safeAreaEdges={["top", "bottom"]}>
      {header}

      {plan && hasPlan && !choosing ? (
        <>
          {/* Up next is about today, so only a plan that feeds them today has one. */}
          {todaysProfileId ? <UpcomingMealCard profileId={todaysProfileId} /> : null}
          <PlanCard
            onChangePlan={() => setChoosing(true)}
            onStop={plan.endsTonight ? undefined : () => setConfirmStop(true)}
            plan={plan}
            tomorrow={tomorrow}
          />
          <WeeklyMenuDropdown
            oldPlan={Boolean(todayPlan && plan.fromTomorrow)}
            version={(todayPlan ?? plan.fromTomorrow) as FoodPlanVersion}
          />
        </>
      ) : profiles.length === 0 ? (
        <EmptyState
          description="Your property has not published a meal plan yet. Check back in a few days."
          icon={foodIcon("clipboard-list-outline")}
          title="No meal plans yet"
        />
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            <View style={{ gap: spacing.xxs }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>
                {hasPlan ? "Move to another plan" : "Choose the plan that fits you"}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
                Any change starts tomorrow. Today's meals stay as they are.
              </Text>
            </View>

            <View style={{ gap: spacing.lg }}>
              {profiles.map((profile) => (
                <ProfileChoiceCard
                  current={Boolean(goingForward && !goingForward.hybrid && goingForward.profileId === profile.id)}
                  key={profile.id}
                  onChoose={() => propose({ kind: "profile", profile })}
                  onViewMenu={() => openMenu(profile.id)}
                  profile={profile}
                />
              ))}
              {profiles.length > 1 ? (
                <HybridPlanCard current={Boolean(goingForward?.hybrid)} onBuild={() => setBuildingWeek(true)} />
              ) : null}
            </View>
          </View>

          {hasPlan ? (
            <View style={{ flexDirection: "row" }}>
              <ActionButton label="Keep my current plan" onPress={() => setChoosing(false)} variant="successQuiet" />
            </View>
          ) : null}

          <NoticeBar
            message="Your property cooks assuming everybody subscribed will eat. Subscribe only if you plan to take the meals regularly."
            title="Before you subscribe"
            tone="warning"
          />
        </>
      )}

      {buildingWeek ? (
        <HybridPlanSheet
          initial={hybridWeekOf(goingForward ?? todayPlan)}
          onClose={() => setBuildingWeek(false)}
          onSave={(days) => {
            setBuildingWeek(false);
            propose({ kind: "week", days });
          }}
          profiles={profiles}
          tomorrow={tomorrow}
        />
      ) : null}

      {pending && pendingCopy ? (
        <ConfirmDialog
          confirmLabel={subscribeState.isLoading ? pendingCopy.busy : pendingCopy.confirm}
          message={pendingCopy.message}
          onCancel={() => setPending(null)}
          onConfirm={() => void choose(pending)}
          title={pendingCopy.title}
        />
      ) : null}

      {stopDialog}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </ScreenScrollView>
  );
}

/** A plan to choose: one profile for every day, or a week picked day by day. */
type PlanChoice =
  | { kind: "profile"; profile: FoodProfile }
  | { kind: "week"; days: Record<DayOfWeek, string> };

type DialogCopy = { title: string; message: string; confirm: string; busy: string; toast: string };

/** 30 Sep 2026 → "Wed 30 Sep". */
function dayDateLabel(date: Date): string {
  return `${DAY_LABEL[weekdayOf(date)].slice(0, 3)} ${shortDate(date)}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayProfile(version: FoodPlanVersion, day: DayOfWeek): FoodPlanDay | undefined {
  return version.days.find((entry) => entry.day === day);
}

/** A plan, as a sentence names it: "Veg", or "your hybrid plan". */
function planName(version: FoodPlanVersion): string {
  return version.hybrid ? "your hybrid plan" : version.profileName ?? "your plan";
}

function isSame(version: FoodPlanVersion, choice: PlanChoice): boolean {
  if (choice.kind === "profile") {
    return version.days.every((entry) => entry.profileId === choice.profile.id);
  }
  return version.days.every((entry) => choice.days[entry.day] === entry.profileId);
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What a choice does, in words, for the dialog and the toast (user,
 * 2026-09-29). Every change starts tomorrow. Null when it changes nothing.
 */
function choiceCopy(plan: FoodPlan | null, choice: PlanChoice, tomorrow: string): DialogCopy | null {
  const today = plan?.today ?? null;
  const next = plan?.fromTomorrow ?? null;
  const endsTonight = Boolean(plan?.endsTonight);
  const chosen = choice.kind === "profile" ? choice.profile.name : "your hybrid plan";
  const week = choice.kind === "week";

  if (next && isSame(next, choice)) {
    return null;
  }
  if (today && isSame(today, choice)) {
    if (!next && !endsTonight) {
      return null;
    }
    return {
      busy: "Keeping…",
      confirm: "Keep plan",
      message: next
        ? `Tomorrow's switch to ${planName(next)} is cancelled, and you stay on ${planName(today)}.`
        : `Your plan won't end tonight. You stay on ${planName(today)}.`,
      title: "Keep your current plan?",
      toast: `You stay on ${planName(today)}`,
    };
  }
  if (next) {
    return {
      busy: "Changing…",
      confirm: "Change plan",
      message: today
        ? `Tomorrow's switch to ${planName(next)} becomes ${chosen}. Today stays on ${planName(today)}.`
        : `Your plan starting tomorrow becomes ${chosen}.`,
      title: "Change tomorrow's plan?",
      toast: `Tomorrow's plan is now ${chosen}`,
    };
  }
  if (!today) {
    return {
      busy: "Starting…",
      confirm: "Start plan",
      message: week
        ? `Your hybrid plan starts tomorrow, ${tomorrow}. Each day follows the plan you picked for it.`
        : `Your ${chosen} plan starts tomorrow, ${tomorrow}, with the day's first meal. Nothing is served to you today, as today's meals were planned before you joined.`,
      title: week ? "Start this hybrid plan?" : "Start this meal plan?",
      toast: `${capitalised(chosen)} starts tomorrow`,
    };
  }
  if (endsTonight) {
    return {
      busy: "Starting…",
      confirm: "Start plan",
      message: `Your ${planName(today)} plan ends tonight as planned, and ${chosen} starts tomorrow, ${tomorrow}.`,
      title: week ? "Start this hybrid plan?" : "Start this meal plan?",
      toast: `${capitalised(chosen)} starts tomorrow`,
    };
  }
  return {
    busy: "Changing…",
    confirm: "Change plan",
    message: `You stay on ${planName(today)} for the rest of today. ${capitalised(chosen)} starts tomorrow, ${tomorrow}. You can change this again until midnight.`,
    title: "Change your meal plan?",
    toast: `${capitalised(chosen)} starts tomorrow`,
  };
}

/** Stopping: today's plan runs to midnight, or a plan that has not started is cancelled. */
function stopCopy(plan: FoodPlan | null): DialogCopy {
  const today = plan?.today ?? null;
  const next = plan?.fromTomorrow ?? null;
  if (!today && next) {
    return {
      busy: "Cancelling…",
      confirm: "Cancel plan",
      message: `${next.hybrid ? "Your hybrid plan" : `Your ${next.profileName} plan`} was due to start tomorrow. It won't start, and nothing is cooked for you.`,
      title: "Cancel your meal plan?",
      toast: "Your plan won't start",
    };
  }
  return {
    busy: "Stopping…",
    confirm: "Stop plan",
    message: `Your plan ends tonight. Today's meals are still yours, and nothing is cooked for you from tomorrow.${
      next ? " Tomorrow's switch is cancelled too." : ""
    } You can choose a plan again at any time, and it starts the next day.`,
    title: "Stop your meal plan?",
    toast: "Your plan ends tonight",
  };
}

function StopDialog({
  busy,
  onCancel,
  onConfirm,
  plan,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  plan: FoodPlan;
}) {
  const copy = stopCopy(plan);
  return (
    <ConfirmDialog
      confirmLabel={busy ? copy.busy : copy.confirm}
      destructive
      message={copy.message}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={copy.title}
    />
  );
}

/**
 * The week the builder opens on: a hybrid plan's own days, so it can be edited,
 * else every day unchosen, showing "Select a profile" (user, 2026-09-29).
 */
function hybridWeekOf(version: FoodPlanVersion | null): DayChoices {
  const week = {} as DayChoices;
  for (const day of DAY_ORDER) {
    week[day] = version?.hybrid ? dayProfile(version, day)?.profileId ?? null : null;
  }
  return week;
}

/**
 * The plan: today's, with what happens next (user, 2026-09-29). A change
 * waiting for midnight, a plan ending tonight, and a plan that has not
 * started yet each get a line saying so.
 */
function PlanCard({
  onChangePlan,
  onStop,
  plan,
  tomorrow,
}: {
  /** Shown only where the plan can be changed from (not when food is off). */
  onChangePlan?: () => void;
  onStop?: () => void;
  plan: FoodPlan;
  tomorrow: string;
}) {
  const { colors, fonts } = useTheme();
  const version = (plan.today ?? plan.fromTomorrow) as FoodPlanVersion;
  const startsTomorrow = !plan.today;
  const todayDay = weekdayOf(todayInIst());
  const tomorrowDay = weekdayOf(addDays(todayInIst(), 1));
  const todayName = DAY_LABEL[todayDay];
  const todaysDay = dayProfile(version, weekdayOf(todayInIst()));
  const name = version.hybrid ? "Hybrid plan" : version.profileName ?? "Your plan";
  const category = version.hybrid ? todaysDay?.profileCategory ?? undefined : version.profileCategory ?? undefined;
  const since = new Date(`${version.effectiveFrom}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <FoodProfileMark category={category} name={version.hybrid ? todaysDay?.profileName ?? name : name} size={42} />
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {name}
          </Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 }}>
            {startsTomorrow
              ? `Starts ${tomorrow}`
              : version.hybrid && todaysDay
                ? `${todayName}: ${todaysDay.profileName ?? ""}`
                : `Since ${since}`}
          </Text>
        </View>
        {version.hybrid ? (
          <FoodStatusChip icon="calendar-week" label="Hybrid" tone="neutral" />
        ) : startsTomorrow ? (
          <FoodStatusChip icon="calendar-clock" label="Tomorrow" tone="neutral" />
        ) : (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.successSoft,
              borderRadius: 999,
              flexDirection: "row",
              gap: 4,
              paddingHorizontal: spacing.sm,
              paddingVertical: 5,
            }}
          >
            <CheckCircle2 color={colors.successText} size={13} strokeWidth={2.3} />
            <Text style={{ color: colors.successText, fontFamily: fonts.sansBold, fontSize: 11 }}>Active</Text>
          </View>
        )}
      </View>

      {version.hybrid ? <WeekStrip marked={startsTomorrow ? tomorrowDay : todayDay} version={version} /> : null}

      {plan.today && plan.fromTomorrow ? (
        <View style={{ elevation: 8, gap: spacing.sm, zIndex: 10 }}>
          <NoticeBar
            message={`From ${tomorrow} you move to ${planName(plan.fromTomorrow)}. You can change this until midnight.`}
            title="From tomorrow"
            tone="info"
          />
          {/* The hybrid week it moves to, day by day (user, 2026-09-29). */}
          {plan.fromTomorrow.hybrid ? <WeekStrip marked={tomorrowDay} version={plan.fromTomorrow} /> : null}
        </View>
      ) : null}
      {plan.endsTonight ? (
        <NoticeBar
          message="Your plan ends tonight. Today's meals are still yours."
          title="Ends tonight"
          tone="warning"
        />
      ) : null}
      {startsTomorrow ? (
        <NoticeBar
          message={`Your plan starts on ${tomorrow}. Nothing is served to you today.`}
          title="Starts tomorrow"
          tone="info"
        />
      ) : null}

      {onChangePlan || onStop ? (
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.xs, paddingTop: spacing.sm }}>
          {onChangePlan ? (
            <ActionButton
              icon={foodIcon("swap-horizontal")}
              label={plan.endsTonight ? "Choose a plan" : "Change plan"}
              onPress={onChangePlan}
              variant="secondary"
            />
          ) : null}
          {onStop ? (
            <ActionButton label={startsTomorrow ? "Cancel plan" : "Stop"} onPress={onStop} variant="dangerFilled" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A hybrid week: each day's plan on a grey square, one day in green (user,
 * 2026-09-29). That is today on the plan running now, and tomorrow, its first
 * day, on one that starts tomorrow. A tap on a day names its plan in a small
 * card under the square.
 */
function WeekStrip({ marked, version }: { marked: DayOfWeek; version: FoodPlanVersion }) {
  const { colors, fonts } = useTheme();
  const [width, setWidth] = useState(0);
  const [rowHeight, setRowHeight] = useState(0);
  const [shown, setShown] = useState<DayOfWeek | null>(null);
  const gap = 4;
  const tile = width > 0 ? (width - gap * 6) / 7 : 0;
  // Fits a phone's narrow squares as well as a wide screen's.
  const markSize = tile > 0 ? Math.max(16, Math.min(24, Math.round(tile * 0.45))) : 22;

  // Goes away by itself, like the forecast's note.
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), 3500);
    return () => clearTimeout(timer);
  }, [shown]);

  const shownEntry = shown ? dayProfile(version, shown) : undefined;
  const cardWidth = Math.min(200, width);
  const shownIndex = shown ? DAY_ORDER.indexOf(shown) : 0;
  const cardLeft = Math.min(
    Math.max(shownIndex * (tile + gap) + tile / 2 - cardWidth / 2, 0),
    Math.max(width - cardWidth, 0),
  );

  return (
    // Drawn above what follows it, so the card can sit over the buttons.
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ elevation: 8, zIndex: 10 }}>
      <View onLayout={(event) => setRowHeight(event.nativeEvent.layout.height)} style={{ flexDirection: "row", gap }}>
        {DAY_ORDER.map((day) => {
          const entry = dayProfile(version, day);
          const isMarked = day === marked;
          return (
            <AnimatedPressable
              accessibilityLabel={`${DAY_LABEL[day]}: ${entry?.profileName ?? "no plan"}`}
              accessibilityRole="button"
              key={day}
              onPress={() => setShown((current) => (current === day ? null : day))}
              style={{
                alignItems: "center",
                backgroundColor: isMarked ? colors.jade : colors.surfaceSunken,
                // Square corners, no rounding (user, 2026-09-29).
                borderRadius: 0,
                flex: 1,
                gap: 2,
                justifyContent: "center",
                minWidth: 0,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  color: isMarked ? colors.onPrimary : colors.muted,
                  fontFamily: isMarked ? fonts.sansBold : fonts.sansMedium,
                  fontSize: 10.5,
                }}
              >
                {DAY_LABEL[day].slice(0, 3)}
              </Text>
              <FoodProfileMark category={entry?.profileCategory ?? undefined} name={entry?.profileName ?? ""} size={markSize} />
            </AnimatedPressable>
          );
        })}
      </View>
      {shown && shownEntry ? (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            elevation: 6,
            flexDirection: "row",
            gap: spacing.sm,
            left: cardLeft,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs + 2,
            position: "absolute",
            shadowColor: colors.shadow,
            shadowOffset: { height: 4, width: 0 },
            shadowOpacity: 0.16,
            shadowRadius: 12,
            top: rowHeight + 6,
            width: cardWidth,
          }}
        >
          <FoodProfileMark
            category={shownEntry.profileCategory ?? undefined}
            name={shownEntry.profileName ?? ""}
            size={28}
          />
          <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>
              {shownEntry.profileName}
            </Text>
            {shownEntry.profileCategory ? (
              <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
                {FOOD_CATEGORY_LABEL[shownEntry.profileCategory]}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The way to a hybrid week, beside the single plans. */
function HybridPlanCard({ current, onBuild }: { current: boolean; onBuild: () => void }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderStyle: "dashed",
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        {/* Blue on a pale blue disc, no border, the way each plan's own mark
            sits on its tint beside it (user, 2026-09-29). */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.primarySoft,
            borderRadius: 24,
            height: 48,
            justifyContent: "center",
            width: 48,
          }}
        >
          <MaterialCommunityIcons color={colors.primary} name="calendar-week" size={25} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
              Hybrid plan
            </Text>
            {current ? <FoodStatusChip icon="check-circle" label="Your plan" tone="success" /> : null}
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 }}>
            Pick a plan for each day of the week.
          </Text>
        </View>
      </View>
      <View style={{ borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", paddingTop: spacing.sm }}>
        <ActionButton
          compact
          icon={foodIcon("calendar-edit")}
          label={current ? "Edit hybrid plan" : "Build a hybrid plan"}
          onPress={onBuild}
          variant="success"
        />
      </View>
    </View>
  );
}

/** A day's plan while the week is being built. Null until one is picked. */
type DayChoices = Record<DayOfWeek, string | null>;

/**
 * A plan for each day of the week (user, 2026-09-29). The days run down one
 * column with a dropdown beside each, and the plan saves only once every day
 * has one.
 */
function HybridPlanSheet({
  initial,
  onClose,
  onSave,
  profiles,
  tomorrow,
}: {
  initial: DayChoices;
  onClose: () => void;
  onSave: (days: Record<DayOfWeek, string>) => void;
  profiles: FoodProfile[];
  tomorrow: string;
}) {
  const { colors, fonts } = useTheme();
  const [days, setDays] = useState<DayChoices>(initial);
  // One list open at a time: opening a day closes the one before it.
  const [openDay, setOpenDay] = useState<DayOfWeek | null>(null);
  const form = useFormErrors<DayOfWeek>();

  function pick(day: DayOfWeek, profileId: string) {
    setDays((current) => ({ ...current, [day]: profileId }));
    setOpenDay(null);
    form.clearField(day);
  }

  function save() {
    const missing: Partial<Record<DayOfWeek, string>> = {};
    for (const day of DAY_ORDER) {
      if (!profiles.some((profile) => profile.id === days[day])) {
        missing[day] = `Choose a plan for ${DAY_LABEL[day]}`;
      }
    }
    setOpenDay(null);
    if (!form.validate(missing)) {
      return;
    }
    onSave(days as Record<DayOfWeek, string>);
  }

  return (
    <SheetShell onClose={onClose} title="Your hybrid plan">
      <View style={{ gap: spacing.md }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 }}>
          Starts tomorrow, {tomorrow}. Pick a plan for each day.
        </Text>
        <View style={{ gap: spacing.sm }}>
          {DAY_ORDER.map((day) => (
            <View key={day} style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
              {/* As tall as the field, so the day sits level with its box
                  whether or not the list below it is open. */}
              <View style={{ justifyContent: "center", minHeight: 48, width: 92 }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{DAY_LABEL[day]}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <DayPlanDropdown
                  day={day}
                  error={form.errors[day]}
                  onPick={(profileId) => pick(day, profileId)}
                  onToggle={() => setOpenDay((current) => (current === day ? null : day))}
                  open={openDay === day}
                  profiles={profiles}
                  value={days[day]}
                />
              </View>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.xs, justifyContent: "flex-end" }}>
          <ActionButton label="Cancel" onPress={onClose} variant="secondary" />
          <ActionButton disabled={form.blocked} label="Save plan" onPress={save} />
        </View>
      </View>
    </SheetShell>
  );
}

/**
 * One day's plan. A dropdown, never a modal (user, 2026-09-29): the list opens
 * in place under the field, the way the pay-bill sheet picks a payment method.
 */
function DayPlanDropdown({
  day,
  error,
  onPick,
  onToggle,
  open,
  profiles,
  value,
}: {
  day: DayOfWeek;
  error?: string;
  onPick: (profileId: string) => void;
  onToggle: () => void;
  open: boolean;
  profiles: FoodProfile[];
  value: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const chosen = profiles.find((profile) => profile.id === value);

  return (
    <View style={{ gap: spacing.xs }}>
      <AnimatedPressable
        accessibilityLabel={`${DAY_LABEL[day]}: ${chosen?.name ?? "no plan chosen"}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: error ? colors.danger : open ? colors.primary : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 8,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.xs,
          minHeight: 48,
          paddingHorizontal: spacing.sm,
        }}
      >
        {chosen ? <FoodProfileMark category={chosen.category} name={chosen.name} size={26} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {chosen ? (
            <MarqueeText style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              {chosen.name}
            </MarqueeText>
          ) : (
            <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
              Select a profile
            </Text>
          )}
        </View>
        {/* On a grey disc, pointing up while the list is open (user, 2026-09-29). */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 13,
            height: 26,
            justifyContent: "center",
            width: 26,
          }}
        >
          {open ? (
            <ChevronUp color={colors.inkSoft} size={16} strokeWidth={2.4} />
          ) : (
            <ChevronDown color={colors.inkSoft} size={16} strokeWidth={2.4} />
          )}
        </View>
      </AnimatedPressable>
      {open ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: radii.sm,
            borderWidth: 1,
            padding: spacing.xs,
          }}
        >
          {profiles.map((profile, index) => (
            <PickerOptionRow
              first={index === 0}
              icon={<FoodProfileMark category={profile.category} name={profile.name} size={24} />}
              key={profile.id}
              label={profile.name}
              onPress={() => onPick(profile.id)}
              selected={profile.id === value}
            />
          ))}
        </View>
      ) : null}
      <FieldError message={error} />
    </View>
  );
}

function ProfileChoiceCard({
  current,
  onChoose,
  onViewMenu,
  profile,
}: {
  current: boolean;
  onChoose: () => void;
  onViewMenu: () => void;
  profile: FoodProfile;
}) {
  const { colors, fonts, type } = useTheme();
  // Built exactly like the owner's profile card (owner-food-profiles.tsx), so
  // the same plan looks the same on both sides: mark, name, chip, description,
  // then compact buttons.
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <FoodProfileMark category={profile.category} name={profile.name} size={48} />
        <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
              {profile.name}
            </Text>
            {current ? <FoodStatusChip icon="check-circle" label="Your plan" tone="success" /> : null}
          </View>
          {profile.description ? (
            <Text numberOfLines={3} style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
              {profile.description}
            </Text>
          ) : (
            <NoDescription />
          )}
        </View>
      </View>

      {/* The week, before committing to it. A name and a line of description is
          not enough to choose a month of dinners on. */}
      <View style={{ borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.xs, paddingTop: spacing.sm }}>
        <ActionButton
          compact
          icon={foodIcon("calendar-month-outline")}
          label="Weekly menu"
          onPress={onViewMenu}
          variant="secondary"
        />
        {!current ? (
          <ActionButton
            compact
            icon={foodIcon("check-circle-outline")}
            label="Choose this plan"
            onPress={onChoose}
            variant="success"
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The top of a subscribed tenant's screen: today's day and date, the next meal
 * on their plan, and any dish the property took off it.
 *
 * <p>Which meal is next, its time and any delay come from the server's meal
 * schedule (2026-09-28), the same one the owner's forecast reads. Once the
 * day's last meal is over there is no next meal until midnight.
 */
function UpcomingMealCard({ profileId }: { profileId: string }) {
  const { colors, fonts } = useTheme();
  const today = todayInIst();
  const scheduleQuery = useGetMyMealScheduleQuery();
  const schedule = scheduleQuery.data ?? null;
  const slot = schedule?.nextMeal ?? null;
  // Midday, so the weekday is right in any time zone the device is set to.
  const upcoming = slot && schedule ? { date: new Date(`${schedule.date}T12:00:00`), mealType: slot.mealType } : null;
  const menuQuery = useGetMyFoodProfileMenuQuery(profileId);
  const skipsQuery = useGetMyFoodSkipsQuery(
    upcoming ? { date: isoDate(upcoming.date), mealType: upcoming.mealType } : { date: "", mealType: "LUNCH" },
    { skip: !upcoming },
  );

  const dayLabel = (upcoming?.date ?? today).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
  const onPlan = upcoming
    ? (menuQuery.data?.entries ?? []).filter(
        (entry) =>
          entry.mealStillServed &&
          entry.mealType === upcoming.mealType &&
          entry.dayOfWeek === weekdayOf(upcoming.date),
      )
    : [];
  const skippedIds = new Set((skipsQuery.data ?? []).map((item) => item.itemId));
  const served = onPlan.filter((entry) => !skippedIds.has(entry.itemId));
  const notServed = onPlan.filter((entry) => skippedIds.has(entry.itemId));
  const tomorrow = upcoming ? isoDate(upcoming.date) !== isoDate(today) : false;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, height: 36, justifyContent: "center", width: 36 }}>
          <MaterialCommunityIcons color={colors.primary} name="calendar-month-outline" size={21} />
        </View>
        <Text numberOfLines={1} style={{ color: colors.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13.5 }}>
          {dayLabel}
        </Text>
        {upcoming ? (
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
            <Text style={{ color: colors.primaryDeep, fontFamily: fonts.sansBold, fontSize: 11.5 }}>
              {tomorrow ? "Tomorrow" : "Today"}
            </Text>
          </View>
        ) : null}
      </View>

      {upcoming ? (
        <>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <TenantMealIcon meal={upcoming.mealType} size={26} />
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 25 }}>
              {slot?.status === "SERVING"
                ? `${MEAL_LABEL[upcoming.mealType]} is being served`
                : `${MEAL_LABEL[upcoming.mealType]} ${tomorrow ? "tomorrow" : "today"}`}
            </Text>
          </View>
          {slot ? (
            <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              <MaterialCommunityIcons color={colors.muted} name="clock-outline" size={16} />
              <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 14 }}>
                {formatMealWindow(slot.startTime, slot.endTime)}
              </Text>
              {slot.delayMinutes > 0 ? <DelayedChip minutes={slot.delayMinutes} /> : null}
            </View>
          ) : null}

          <View style={{ backgroundColor: colors.border, height: 1 }} />
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <MaterialCommunityIcons color={colors.muted} name="silverware-fork-knife" size={17} />
            <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13 }}>Menu</Text>
          </View>

          {menuQuery.isLoading ? (
            <FoodTenantMenuRowsSkeleton />
          ) : served.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              {served.map((entry) => (
                <TenantMenuItemRow
                  key={entry.id}
                  imageUrl={entry.itemImageUrl}
                  name={entry.itemName}
                  quantity={formatQuantity(entry.baseQuantityPerSubscriber, entry.quantityUnit)}
                />
              ))}
            </View>
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
              Nothing on your plan for this meal.
            </Text>
          )}

          {/* Taken off by the property for this meal only. Said plainly, so a
              missing dish is not a surprise at the table. */}
          {notServed.length > 0 ? (
            <View
              style={{
                alignItems: "flex-start",
                backgroundColor: colors.dangerSoft,
                borderCurve: "continuous",
                borderRadius: radii.card,
                flexDirection: "row",
                gap: spacing.xs,
                padding: spacing.sm,
              }}
            >
              <MaterialCommunityIcons color={colors.danger} name="food-off-outline" size={17} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.danger, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
                  Not served this meal
                </Text>
                <Text style={{ color: colors.danger, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
                  {notServed.map((entry) => entry.itemName).join(", ")}
                </Text>
              </View>
            </View>
          ) : null}
        </>
      ) : schedule && schedule.timings.length > 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
          All meals are done for today. Tomorrow's first meal shows after midnight.
        </Text>
      ) : scheduleQuery.isLoading ? null : (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
          Your property is not serving meals right now.
        </Text>
      )}
    </View>
  );
}

/** The whole week, folded away until asked for. */
function WeeklyMenuDropdown({ oldPlan, version }: { oldPlan: boolean; version: FoodPlanVersion }) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.sm }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 52,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
        }}
      >
        <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, height: 34, justifyContent: "center", width: 34 }}>
          <MaterialCommunityIcons color={colors.primary} name="calendar-month-outline" size={20} />
        </View>
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 15 }}>Weekly menu</Text>
        <MaterialCommunityIcons color={colors.muted} name={open ? "chevron-up" : "chevron-down"} size={22} />
      </AnimatedPressable>
      {open ? <WeeklyMenu oldPlan={oldPlan} version={version} /> : null}
    </View>
  );
}

/**
 * The plan's week, read-only. A hybrid week shows each day's own profile
 * (2026-09-29), so Tuesday's menu comes from Tuesday's plan.
 *
 * <p>A bubble before the first meal names the day's plan (user, 2026-09-29).
 * Until a scheduled change starts, the week is still today's plan and the
 * bubble says it is the old one.
 */
function WeeklyMenu({ oldPlan, version }: { oldPlan: boolean; version: FoodPlanVersion }) {
  const { colors, fonts } = useTheme();
  const week = useMemo(() => weekStartingOn(todayInIst()), []);
  const [day, setDay] = useState<DayOfWeek>(() => weekdayOf(todayInIst()));
  const dayPlan = dayProfile(version, day);
  const menuQuery = useGetMyFoodProfileMenuQuery(dayPlan?.profileId ?? "", { skip: !dayPlan });
  // currentData, not data: data keeps the last profile's menu while the next
  // day's profile loads, which would show a hybrid day the wrong plan's dishes.
  const entries = (menuQuery.currentData?.entries ?? []).filter(
    (entry) => entry.dayOfWeek === day && entry.mealStillServed,
  );

  const loading = !menuQuery.currentData && menuQuery.isFetching;
  const [opened, setOpened] = useState(false);
  if (!loading && !opened) {
    setOpened(true);
  }

  // The whole menu is a ghost only on first open. After that a day whose plan
  // is still loading keeps the day strip and its bubble.
  if (loading && !opened) {
    return <FoodMenuSkeleton />;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <DayStrip onSelect={setDay} selected={day} week={week} />
      {dayPlan?.profileName ? (
        <View
          style={{
            alignItems: "center",
            alignSelf: "center",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            flexDirection: "row",
            gap: 6,
            maxWidth: "100%",
            paddingLeft: 4,
            paddingRight: spacing.sm,
            paddingVertical: 4,
          }}
        >
          <FoodProfileMark category={dayPlan.profileCategory ?? undefined} name={dayPlan.profileName} size={22} />
          <Text numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
            {dayPlan.profileName}
          </Text>
          {oldPlan ? (
            <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
              · Old plan until tonight
            </Text>
          ) : null}
        </View>
      ) : null}

      {loading ? <FoodTenantMenuRowsSkeleton /> : null}

      {MEAL_ORDER.filter((meal) => entries.some((entry) => entry.mealType === meal)).map((meal) => (
        <View
          key={meal}
          style={{
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.sm,
            padding: spacing.md,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <TenantMealIcon meal={meal} size={19} />
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 15 }}>
              {MEAL_LABEL[meal]}
            </Text>
          </View>

          <View style={{ gap: spacing.xs }}>
            {entries
              .filter((entry) => entry.mealType === meal)
              .map((entry) => (
                <TenantMenuItemRow
                  imageUrl={entry.itemImageUrl}
                  key={entry.id}
                  name={entry.itemName}
                  quantity={formatQuantity(entry.baseQuantityPerSubscriber, entry.quantityUnit)}
                />
              ))}
          </View>
        </View>
      ))}

      {!loading && entries.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted, paddingVertical: spacing.sm }}>
          Nothing is planned for {DAY_LABEL[day]} yet.
        </Text>
      ) : null}
    </View>
  );
}
