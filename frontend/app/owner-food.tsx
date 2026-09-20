import { useState } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { EmptyState } from "@/components/empty-state";
import { PinnedFooter, PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { FoodOverviewSkeleton } from "@/components/skeletons";
import { UnderlineTabs } from "@/components/underline-tabs";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, NoticeBar, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { foodIcon, isoDate } from "@/features/food/food-ui";
import { FoodItemsTab } from "@/features/food/owner-food-items";
import { FoodProfilesTab } from "@/features/food/owner-food-profiles";
import {
  CookingPreview,
  FoodStats,
  ManageFoodCard,
  SetupSequence,
  nextMeal,
} from "@/features/food/owner-food-overview";
import { useAppSelector } from "@/store/hooks";
import {
  useGetCookingForecastQuery,
  useGetFoodOverviewQuery,
  useListFoodItemsQuery,
  useListFoodProfileSubscriberCountsQuery,
  useListFoodSubscribersQuery,
  useSetFoodModuleEnabledMutation,
  type FoodProfile,
} from "@/store/services/food-api";
import { spacing } from "@/theme/spacing";

type Tab = "overview" | "items" | "profiles";

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
  const [itemCreateRequest, setItemCreateRequest] = useState(0);
  const [profileCreateRequest, setProfileCreateRequest] = useState(0);
  const [confirmOff, setConfirmOff] = useState(false);
  const opErrors = useFormErrors<never>();

  const overviewQuery = useGetFoodOverviewQuery(propertyId, { skip: !propertyId });
  const overview = overviewQuery.data;
  const managed = Boolean(overview?.moduleEnabled);

  // Every list is skipped until the module is actually on. Fetching a catalogue
  // for a property that has opted out is four requests whose answers no part of
  // this screen is allowed to show.
  const listArgs = { skip: !propertyId || !managed };
  const itemsQuery = useListFoodItemsQuery(propertyId, listArgs);
  const profilesQuery = useListFoodProfileSubscriberCountsQuery(propertyId, listArgs);
  const subscribersQuery = useListFoodSubscribersQuery(propertyId, listArgs);

  const upcoming = nextMeal(overview?.availableMeals ?? []);
  const forecastQuery = useGetCookingForecastQuery(
    upcoming ? { date: isoDate(upcoming.date), mealType: upcoming.mealType, propertyId } : { date: "", mealType: "LUNCH", propertyId: "" },
    { skip: !propertyId || !managed || !upcoming || (overview?.activeSubscriptions ?? 0) === 0 },
  );

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
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        {header}
        <EmptyState
          description="Choose the property whose food you want to manage from Home."
          icon={foodIcon("silverware-fork-knife")}
          title="No active property selected"
        />
      </ScreenScrollView>
    );
  }

  if (!overview && overviewQuery.isFetching) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        {header}
        <FoodOverviewSkeleton />
      </ScreenScrollView>
    );
  }

  // The property says it does not serve food. Nothing here can change that, so
  // the screen points at the place that can rather than offering a switch that
  // would be refused.
  if (overview && !overview.foodAvailableInProperty) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
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
      </ScreenScrollView>
    );
  }

  // Setup being unfinished changes what the OVERVIEW says, not which tabs
  // exist. Items are added on the Items tab, which is where somebody told to
  // add an item will go looking for the button.
  const setupIncomplete = managed && (overview?.activeItems ?? 0) === 0;
  const footerMode = !readOnly && managed
    ? tab === "items"
      ? "items"
      : tab === "profiles"
        ? "profiles"
        : null
    : null;

  return (
    <View style={{ flex: 1 }}>
      <ScreenScrollView
        contentContainerStyle={{ paddingBottom: footerMode ? PINNED_FOOTER_CLEARANCE : undefined }}
        safeAreaEdges={["top", "bottom"]}
      >
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
            <UnderlineTabs<Tab>
              active={tab}
              bleed={spacing.lg}
              onChange={setTab}
              options={[
                { label: "Overview", value: "overview" },
                { label: "Items", value: "items" },
                { label: "Profiles", value: "profiles" },
              ]}
              tone="plain"
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
                  onAddItem={() => setTab("items")}
                  onCreateProfile={() => setTab("profiles")}
                  onEditMenu={() => setTab("profiles")}
                  overview={overview}
                />
              ) : (
                <>
                  <FoodStats overview={overview} />
                  {upcoming ? (
                    <CookingPreview
                      forecast={forecastQuery.data}
                      loading={forecastQuery.isFetching}
                      mealType={upcoming.mealType}
                      onOpenForecast={() => router.push("/owner-food-forecast")}
                      when={upcoming.date}
                    />
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {tab === "items" ? (
            <FoodItemsTab
              availableMeals={overview?.availableMeals ?? []}
              createRequest={itemCreateRequest}
              items={itemsQuery.data ?? []}
              loading={itemsQuery.isLoading}
              propertyId={propertyId}
              readOnly={readOnly}
            />
          ) : null}

          {tab === "profiles" ? (
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

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
      </ScreenScrollView>

      {footerMode ? (
        <PinnedFooter>
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
                setTab("items");
                setItemCreateRequest((value) => value + 1);
              } else {
                setProfileCreateRequest((value) => value + 1);
              }
            }}
          />
        </PinnedFooter>
      ) : null}
    </View>
  );
}
