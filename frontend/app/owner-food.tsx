import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { EmptyState } from "@/components/empty-state";
import { PinnedFooter, PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { FoodOverviewSkeleton } from "@/components/skeletons";
import { SelectionTabs } from "@/components/selection-tabs";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, NoticeBar, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { foodIcon } from "@/features/food/food-ui";
import {
  DelayMealSheet,
  MealTimingsCard,
  MealTimingsSheet,
  MealsDoneForToday,
  canStillDelay,
} from "@/features/food/meal-schedule-ui";
import { FoodItemsTab } from "@/features/food/owner-food-items";
import { FoodProfilesTab } from "@/features/food/owner-food-profiles";
import {
  CookingPreview,
  FoodStats,
  ManageFoodCard,
  SetupSequence,
} from "@/features/food/owner-food-overview";
import { useAppSelector } from "@/store/hooks";
import {
  useGetCookingForecastQuery,
  useGetFoodOverviewQuery,
  useGetMealScheduleQuery,
  useListFoodItemsQuery,
  useListFoodProfileSubscriberCountsQuery,
  useListFoodSubscribersQuery,
  useSetFoodModuleEnabledMutation,
  type FoodProfile,
} from "@/store/services/food-api";
import { spacing } from "@/theme/spacing";

type Tab = "overview" | "items" | "profiles";

/** Keep one safe-area scroll view mounted while property and food data resolve. */
function FoodScreenFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <ScreenScrollView
        contentContainerStyle={{ paddingBottom: footer ? PINNED_FOOTER_CLEARANCE : undefined }}
        safeAreaEdges={["top", "bottom"]}
      >
        {children}
      </ScreenScrollView>
      {footer ? <PinnedFooter>{footer}</PinnedFooter> : null}
    </View>
  );
}

/**
 * Everything about a property's food, in one place.
 *
 * <p>Two switches decide what this screen can be, and they are not the same
 * one. The PROPERTY decides whether it offers food at all — that is what a
 * listing advertises, and it is set in Property settings. This module decides
 * whether Khatiyan manages that operation. So the screen has three shapes: food
 * is not offered at all, food is offered but run by hand, or food is offered
 * and managed here.
 */
export default function OwnerFoodScreen() {
  const router = useRouter();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const { canManage } = usePropertyPermissions(propertyId);
  const readOnly = !canManage("FOOD");

  const [tab, setTab] = useState<Tab>("overview");
  const [visitedTabs, setVisitedTabs] = useState({ items: false, profiles: false });
  const [itemCreateRequest, setItemCreateRequest] = useState(0);
  const [profileCreateRequest, setProfileCreateRequest] = useState(0);
  const [confirmOff, setConfirmOff] = useState(false);
  const opErrors = useFormErrors<never>();

  const overviewQuery = useGetFoodOverviewQuery(propertyId, { skip: !propertyId });
  const overview = overviewQuery.data;
  const managed = Boolean(overview?.moduleEnabled);

  const itemsMounted = tab === "items" || visitedTabs.items;
  const profilesMounted = tab === "profiles" || visitedTabs.profiles;

  function selectTab(next: Tab) {
    if (next !== "overview") {
      setVisitedTabs((current) => (current[next] ? current : { ...current, [next]: true }));
    }
    setTab(next);
  }

  useEffect(() => {
    setTab("overview");
    setVisitedTabs({ items: false, profiles: false });
  }, [propertyId]);

  // Overview owns module startup. The heavier lists are requested only when
  // their tab is first visited, then both their RTK subscription and rendered
  // rows remain alive for instant repeat switches.
  const itemsQuery = useListFoodItemsQuery(propertyId, {
    skip: !propertyId || !managed || !itemsMounted,
  });
  const profilesQuery = useListFoodProfileSubscriberCountsQuery(propertyId, {
    skip: !propertyId || !managed || !profilesMounted,
  });
  const subscribersQuery = useListFoodSubscribersQuery(propertyId, {
    skip: !propertyId || !managed || !profilesMounted,
  });

  // The server's meal day (2026-09-28): which meal is next, its time and any
  // delay. Null next meal once the day's last one is over, until midnight.
  const scheduleQuery = useGetMealScheduleQuery(propertyId, { skip: !propertyId || !managed });
  const schedule = scheduleQuery.data;
  const upcoming = schedule?.nextMeal ?? null;
  const forecastQuery = useGetCookingForecastQuery(
    upcoming && schedule
      ? { date: schedule.date, mealType: upcoming.mealType, propertyId }
      : { date: "", mealType: "LUNCH", propertyId: "" },
    { skip: !propertyId || !managed || !upcoming || (overview?.activeSubscriptions ?? 0) === 0 },
  );
  const [timingsOpen, setTimingsOpen] = useState(false);
  const [delayOpen, setDelayOpen] = useState(false);

  const [setEnabled, setEnabledState] = useSetFoodModuleEnabledMutation();

  async function toggleModule(next: boolean) {
    if (!next) {
      setConfirmOff(true);
      return;
    }
    try {
      await setEnabled({ enabled: true, propertyId }).unwrap();
      toast.ok("Food management is on");
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  async function turnOff() {
    setConfirmOff(false);
    try {
      await setEnabled({ enabled: false, propertyId }).unwrap();
      toast.ok("Food management is off");
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  function openMenu(profile: FoodProfile) {
    router.push({ params: { profileId: profile.id, profileName: profile.name }, pathname: "/owner-food-menu" });
  }

  const header = (
    <ScreenHeader
      badge={readOnly ? <ViewOnlyChip /> : null}
      italicTail="preference."
      subtitle={property ? [property.name, property.area].filter(Boolean).join(", ") : undefined}
      title="Food"
    />
  );

  if (!property) {
    return (
      <FoodScreenFrame>
        {header}
        <EmptyState
          description="Choose the property whose food you want to manage from Home."
          icon={foodIcon("silverware-fork-knife")}
          title="No active property selected"
        />
      </FoodScreenFrame>
    );
  }

  if (!overview && overviewQuery.isFetching) {
    return (
      <FoodScreenFrame>
        {header}
        <FoodOverviewSkeleton />
      </FoodScreenFrame>
    );
  }

  // The property says it does not serve food. Nothing here can change that, so
  // the screen points at the place that can rather than offering a switch that
  // would be refused.
  if (overview && !overview.foodAvailableInProperty) {
    return (
      <FoodScreenFrame>
        {header}
        <EmptyState
          description="This property is listed as not providing food, so there is nothing to manage here."
          icon={foodIcon("silverware-clean")}
          title="Food is not offered here"
        />
        <NoticeBar
          message="Property settings decides whether this property serves food and which meals. Add a meal there and this screen opens up."
          title="Where this is set"
          tone="info"
        />
        {canManage("PROPERTY_SETTINGS") ? (
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              icon={foodIcon("cog-outline")}
              label="Go to Property settings"
              onPress={() => router.push("/owner-edit-property")}
              variant="secondary"
            />
          </View>
        ) : null}
      </FoodScreenFrame>
    );
  }

  // Setup being unfinished changes what the OVERVIEW says, not which tabs
  // exist. Items are added on the Items tab, which is where somebody told to
  // add an item will go looking for the button.
  // Meal timings are a required setup step (2026-09-28): until every served
  // meal has a saved time, the overview stays on the setup steps.
  const timingsSet = schedule ? schedule.timings.every((timing) => timing.saved) : true;
  const setupIncomplete = managed && ((overview?.activeItems ?? 0) === 0 || !timingsSet);
  const footerMode = !readOnly && managed
    ? tab === "items"
      ? "items"
      : tab === "profiles"
        ? "profiles"
        : null
    : null;
  const footer = footerMode ? (
    <ActionButton
      icon={foodIcon("plus")}
      label={
        footerMode === "items"
          ? (itemsQuery.data?.filter((item) => item.active).length ?? 0) === 0
            ? "Add first food item"
            : "Add food item"
          : (profilesQuery.data?.length ?? 0) === 0
            ? "Create first profile"
            : "Create food profile"
      }
      onPress={() => {
        if (footerMode === "items") {
          selectTab("items");
          setItemCreateRequest((value) => value + 1);
        } else {
          setProfileCreateRequest((value) => value + 1);
        }
      }}
    />
  ) : undefined;

  return (
    <FoodScreenFrame footer={footer}>
        {header}

      {/* The module switch is the one thing that outranks the tabs: with it off
          there is no workspace to tab through. Everything else — including an
          empty catalogue — is a state of the tabs, not a replacement for them. */}
      {!managed ? (
        <>
          <ManageFoodCard
            busy={setEnabledState.isLoading}
            enabled={managed}
            meals={overview?.availableMeals}
            onToggle={(next) => void toggleModule(next)}
            readOnly={readOnly}
          />
          <NoticeBar
            message="Turning this on does not change your listing. The meals you advertise stay exactly as they are."
            title="Your listing is unaffected"
            tone="info"
          />
        </>
      ) : (
        <>
          <View style={{ marginTop: -spacing.sm }}>
            <SelectionTabs<Tab>
              active={tab}
              bleed={spacing.lg}
              onChange={selectTab}
              options={[
                { label: "Overview", value: "overview" },
                { label: "Items", value: "items" },
                { label: "Profiles", value: "profiles" },
              ]}
              distributed
              topPadding={spacing.md}
            />
          </View>

          {tab === "overview" && overview ? (
            <View style={{ gap: spacing.sm }}>
              <ManageFoodCard
                busy={setEnabledState.isLoading}
                enabled={managed}
                meals={overview.availableMeals}
                onToggle={(next) => void toggleModule(next)}
                readOnly={readOnly}
              />
              {/* Three zeros and a forecast of nothing say less than a list of
                  what to do first. Each step opens the tab that does it. */}
              {setupIncomplete ? (
                <SetupSequence
                  onAddItem={() => selectTab("items")}
                  onCreateProfile={() => selectTab("profiles")}
                  onEditMenu={() => selectTab("profiles")}
                  onSetTimings={readOnly ? undefined : () => setTimingsOpen(true)}
                  overview={overview}
                  timingsSet={timingsSet}
                />
              ) : (
                <>
                  <FoodStats date={schedule?.date} overview={overview} propertyId={propertyId} />
                  {upcoming ? (
                    <CookingPreview
                      forecast={forecastQuery.data}
                      loading={forecastQuery.isFetching}
                      onDelay={
                        !readOnly && schedule && canStillDelay(upcoming, schedule.delayCutoffMinutes)
                          ? () => setDelayOpen(true)
                          : undefined
                      }
                      onOpenForecast={() => router.push("/owner-food-forecast")}
                      slot={upcoming}
                    />
                  ) : schedule && schedule.timings.length > 0 ? (
                    <MealsDoneForToday />
                  ) : null}
                  {schedule && schedule.timings.length > 0 ? (
                    <MealTimingsCard onEdit={readOnly ? undefined : () => setTimingsOpen(true)} schedule={schedule} />
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {itemsMounted ? (
            <View style={{ display: tab === "items" ? "flex" : "none" }}>
              <FoodItemsTab
                availableMeals={overview?.availableMeals ?? []}
                createRequest={itemCreateRequest}
                items={itemsQuery.data ?? []}
                loading={itemsQuery.isLoading}
                propertyId={propertyId}
                readOnly={readOnly}
              />
            </View>
          ) : null}

          {profilesMounted ? (
            <View style={{ display: tab === "profiles" ? "flex" : "none" }}>
              <FoodProfilesTab
                createRequest={profileCreateRequest}
                loading={profilesQuery.isLoading}
                onOpenMenu={openMenu}
                profiles={profilesQuery.data ?? []}
                propertyId={propertyId}
                readOnly={readOnly}
                subscribers={subscribersQuery.data ?? []}
                subscribersLoading={subscribersQuery.isLoading}
              />
            </View>
          ) : null}
        </>
      )}

      {confirmOff ? (
        <ConfirmDialog
          bullets={[
            "Tenants stop seeing menus and cannot change their profile.",
            "Cooking forecasts stop being worked out.",
          ]}
          confirmLabel={setEnabledState.isLoading ? "Turning off…" : "Turn off"}
          footnote="Your items, profiles, menus and subscriptions are all kept, and come back if you turn this on again."
          message="Khatiyan will stop managing food for this property. Your listing and the meals you advertise are unaffected."
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => void turnOff()}
          title="Turn off food management?"
        />
      ) : null}

      {timingsOpen && schedule ? (
        <MealTimingsSheet onClose={() => setTimingsOpen(false)} propertyId={propertyId} schedule={schedule} />
      ) : null}

      {delayOpen && upcoming ? (
        <DelayMealSheet onClose={() => setDelayOpen(false)} propertyId={propertyId} slot={upcoming} />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </FoodScreenFrame>
  );
}
