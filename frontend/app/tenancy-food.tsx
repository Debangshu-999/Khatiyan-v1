import { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { FoodMenuSkeleton, FoodTenantSkeleton } from "@/components/skeletons";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  DAY_LABEL,
  DayStrip,
  FoodItemThumb,
  MEAL_ICON,
  MEAL_LABEL,
  MEAL_ORDER,
  foodIcon,
  formatQuantity,
  todayInIst,
  weekFrom,
  weekdayOf,
} from "@/features/food/food-ui";
import {
  useGetMyFoodAvailabilityQuery,
  useGetMyFoodProfileMenuQuery,
  useGetMyFoodSubscriptionQuery,
  useListMyFoodProfilesQuery,
  useSubscribeToFoodProfileMutation,
  useUnsubscribeFromFoodMutation,
  type DayOfWeek,
  type FoodProfile,
} from "@/store/services/food-api";
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
  const [switchTo, setSwitchTo] = useState<FoodProfile | null>(null);

  const availabilityQuery = useGetMyFoodAvailabilityQuery();
  const subscriptionQuery = useGetMyFoodSubscriptionQuery();
  const profilesQuery = useListMyFoodProfilesQuery(undefined, {
    skip: !availabilityQuery.data?.moduleEnabled,
  });

  const availability = availabilityQuery.data;
  const subscription = subscriptionQuery.data ?? null;

  const [subscribe, subscribeState] = useSubscribeToFoodProfileMutation();
  const [unsubscribe, unsubscribeState] = useUnsubscribeFromFoodMutation();

  async function choose(profile: FoodProfile) {
    setSwitchTo(null);
    setChoosing(false);
    try {
      await subscribe({ profileId: profile.id }).unwrap();
      toast.ok(`You are on ${profile.name}`);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  async function stop() {
    setConfirmStop(false);
    try {
      await unsubscribe().unwrap();
      toast.ok("Food subscription stopped");
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  const header = (
    <ScreenHeader
      eyebrow="Your stay"
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
    (availability?.moduleEnabled && !subscription && !profilesQuery.data && profilesQuery.isFetching)
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

  // The property does not serve food, or has stopped managing it here. Either
  // way there is nothing for a tenant to choose — but an existing subscription
  // is still shown, because it is theirs and stopping it must stay possible.
  if (availability && (!availability.foodAvailableInProperty || !availability.moduleEnabled)) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        {header}
        {subscription ? <CurrentPlanCard since={subscription.startedAt} name={subscription.profileName} /> : null}
        <EmptyState
          description={
            availability.foodAvailableInProperty
              ? "Your property is handling meals outside the app at the moment. Ask them what is being served."
              : "Your property does not serve meals."
          }
          icon={foodIcon("silverware-clean")}
          title="No meal plans here"
        />
        {subscription ? (
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              label={unsubscribeState.isLoading ? "Stopping…" : "Stop subscription"}
              onPress={() => setConfirmStop(true)}
              variant="danger"
            />
          </View>
        ) : null}
        {confirmStop ? (
          <StopDialog busy={unsubscribeState.isLoading} onCancel={() => setConfirmStop(false)} onConfirm={() => void stop()} />
        ) : null}
        {opErrors.serverError ? (
          <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
        ) : null}
      </ScreenScrollView>
    );
  }

  const profiles = profilesQuery.data ?? [];

  return (
    <ScreenScrollView onRefresh={refresh} safeAreaEdges={["top", "bottom"]}>
      {header}

      {subscription && !choosing ? (
        <>
          <CurrentPlanCard name={subscription.profileName} since={subscription.startedAt} />
          <WeeklyMenu profileId={subscription.profileId} />
          <NoticeBar
            message="Your property plans and cooks these meals. Items and portions can change with what is available."
            title="This is a preview"
            tone="info"
          />
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            <ActionButton
              icon={foodIcon("swap-horizontal")}
              label="Change plan"
              onPress={() => setChoosing(true)}
              variant="secondary"
            />
            <ActionButton label="Stop" onPress={() => setConfirmStop(true)} variant="danger" />
          </View>
        </>
      ) : profiles.length === 0 ? (
        <EmptyState
          description="Your property has not published a meal plan yet. Check back in a few days."
          icon={foodIcon("clipboard-list-outline")}
          title="No meal plans yet"
        />
      ) : (
        <>
          <View style={{ gap: spacing.xxs }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>
              {subscription ? "Move to another plan" : "Choose the plan that fits you"}
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
              You are on one plan at a time, and you can change it later.
            </Text>
          </View>

          {profiles.map((profile) => (
            <ProfileChoiceCard
              current={profile.id === subscription?.profileId}
              key={profile.id}
              onChoose={() => (subscription ? setSwitchTo(profile) : void choose(profile))}
              onViewMenu={() => openMenu(profile.id)}
              profile={profile}
            />
          ))}

          {subscription ? (
            <View style={{ flexDirection: "row" }}>
              <ActionButton label="Keep my current plan" onPress={() => setChoosing(false)} variant="secondary" />
            </View>
          ) : null}

          <NoticeBar
            message="Your property cooks assuming everybody subscribed will eat. Subscribe only if you plan to take the meals regularly."
            title="Before you subscribe"
            tone="warning"
          />
        </>
      )}

      {switchTo ? (
        <ConfirmDialog
          bullets={[
            `Your ${subscription?.profileName} plan ends.`,
            `You start on ${switchTo.name} straight away.`,
          ]}
          confirmLabel={subscribeState.isLoading ? "Switching…" : "Switch plan"}
          footnote="You are only ever on one plan, so this replaces the current one rather than adding to it."
          message={`You will move to ${switchTo.name}.`}
          onCancel={() => setSwitchTo(null)}
          onConfirm={() => void choose(switchTo)}
          title="Change your meal plan?"
        />
      ) : null}

      {confirmStop ? (
        <StopDialog busy={unsubscribeState.isLoading} onCancel={() => setConfirmStop(false)} onConfirm={() => void stop()} />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </ScreenScrollView>
  );
}

function StopDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <ConfirmDialog
      bullets={["You stop receiving meals.", "Your property stops cooking for you."]}
      confirmLabel={busy ? "Stopping…" : "Stop subscription"}
      destructive
      footnote="You can subscribe again whenever you want."
      message="Your food subscription will end."
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="Stop your food subscription?"
    />
  );
}

function CurrentPlanCard({ name, since }: { name: string; since: string }) {
  const { colors, fonts, type } = useTheme();
  const started = new Date(since).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  });
  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
          {name}
        </Text>
        <StatusPill label="Your plan" tone="success" />
      </View>
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5 }}>Since {started}</Text>
    </Card>
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
  return (
    <View
      style={{
        // A border, not a wash. The chosen plan is marked by its outline and its
        // pill — `primarySoft` is not a fill this app uses anywhere.
        borderColor: current ? colors.primary : colors.border,
        borderRadius: radii.card,
        borderWidth: current ? 1.5 : 1,
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
          {profile.name}
        </Text>
        {current ? <StatusPill label="Your plan" tone="success" /> : null}
      </View>

      {profile.description ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
          {profile.description}
        </Text>
      ) : null}

      <MenuHighlights profileId={profile.id} />

      {/* The week, before committing to it. A name and a line of description is
          not enough to choose a month of dinners on. */}
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        <ActionButton compact label="View weekly menu" onPress={onViewMenu} variant="secondary" />
        {!current ? <ActionButton compact label="Choose this plan" onPress={onChoose} /> : null}
      </View>
    </View>
  );
}

/**
 * A few dishes from a plan, so the name is not the only thing to judge it by.
 *
 * <p>Fetched per card. There is no endpoint that returns highlights, so this is
 * the profile's real menu read down to its distinct item names — which is also
 * why it is a handful rather than the whole week.
 */
function MenuHighlights({ profileId }: { profileId: string }) {
  const { colors, fonts } = useTheme();
  const menuQuery = useGetMyFoodProfileMenuQuery(profileId);
  const names = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of menuQuery.data?.entries ?? []) {
      seen.add(entry.itemName);
    }
    return [...seen];
  }, [menuQuery.data?.entries]);

  if (menuQuery.isLoading || names.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={{ color: colors.kicker, fontFamily: fonts.sansSemiBold, fontSize: 11 }}>ON THE MENU</Text>
      <Text style={{ color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
        {names.slice(0, 6).join(", ")}
        {names.length > 6 ? ` and ${names.length - 6} more` : ""}
      </Text>
    </View>
  );
}

/** The subscribed plan's week, read-only. */
function WeeklyMenu({ profileId }: { profileId: string }) {
  const { colors, fonts } = useTheme();
  const week = useMemo(() => weekFrom(todayInIst()), []);
  const [day, setDay] = useState<DayOfWeek>(() => weekdayOf(todayInIst()));
  const menuQuery = useGetMyFoodProfileMenuQuery(profileId);
  const entries = (menuQuery.data?.entries ?? []).filter(
    (entry) => entry.dayOfWeek === day && entry.mealStillServed,
  );

  if (!menuQuery.data && menuQuery.isFetching) {
    return <FoodMenuSkeleton />;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <DayStrip onSelect={setDay} selected={day} week={week} />

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
            <MaterialCommunityIcons color={colors.ink} name={MEAL_ICON[meal]} size={17} />
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 15 }}>
              {MEAL_LABEL[meal]}
            </Text>
          </View>

          {entries
            .filter((entry) => entry.mealType === meal)
            .map((entry) => (
              <View key={entry.id} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <FoodItemThumb imageUrl={entry.itemImageUrl} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>
                    {entry.itemName}
                  </Text>
                  <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5 }}>
                    {formatQuantity(entry.baseQuantityPerSubscriber, entry.quantityUnit)} per person
                  </Text>
                </View>
              </View>
            ))}
        </View>
      ))}

      {!menuQuery.isLoading && entries.length === 0 ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, paddingVertical: spacing.sm }}>
          Nothing is planned for {DAY_LABEL[day]} yet.
        </Text>
      ) : null}
    </View>
  );
}
