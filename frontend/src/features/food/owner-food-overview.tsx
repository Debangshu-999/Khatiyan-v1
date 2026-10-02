import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Switch, Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { MetricTile } from "@/components/metric-tile";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import type { MealType } from "@/store/services/property-api";
import {
  type CookingForecast,
  type FoodModuleOverview,
  type MealSlot,
} from "@/store/services/food-api";
import { DelayedChip } from "@/features/food/meal-schedule-ui";
import {
  FoodStatusChip,
  MealGlyph,
  type MaterialIconName,
  MEAL_LABEL,
  MEAL_ORDER,
  MealChip,
  foodIcon,
  formatBulkQuantity,
  formatMealWindow,
} from "@/features/food/food-ui";

/**
 * The switch that decides whether Khatiyan manages this property's food.
 *
 * <p>Says plainly that it is not the same switch as the property's own "food
 * included". Owners conflate the two constantly, and turning this off to stop
 * using the tooling must never quietly delist a property that still serves
 * dinner.
 */
export function ManageFoodCard({
  meals,
  busy,
  enabled,
  onToggle,
  readOnly,
}: {
  meals?: MealType[];
  busy: boolean;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  readOnly: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderRadius: radii.pill, height: 42, justifyContent: "center", width: 42 }}>
            <MaterialCommunityIcons color={colors.ink} name="chef-hat" size={24} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15.5, lineHeight: 20 }}>
              Manage meals with Khatiyan
            </Text>
          </View>
          <FoodStatusChip
            icon={enabled ? "check-circle" : "minus-circle-outline"}
            label={enabled ? "On" : "Off"}
            tone={enabled ? "success" : "neutral"}
          />
        </View>

        <View style={{ backgroundColor: colors.neutralSoft, borderCurve: "continuous", borderRadius: radii.card, padding: spacing.md }}>
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
            {enabled
              ? "Plan menus, manage subscriptions and prepare cooking quantities in one place."
              : "Turn on food tools to plan menus, manage subscriptions and prepare cooking quantities."}
          </Text>
        </View>

        {meals && meals.length > 0 ? (
          <View style={{ backgroundColor: colors.neutralSoft, borderCurve: "continuous", borderRadius: radii.card, gap: spacing.sm, padding: spacing.md }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>
              Meals offered by this property
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {MEAL_ORDER.filter((meal) => meals.includes(meal)).map((meal) => (
                <MealChip key={meal} meal={meal} style={{ backgroundColor: colors.surface, borderWidth: 0 }} />
              ))}
            </View>
          </View>
        ) : null}
        <View
          style={{
            alignItems: "center",
            backgroundColor: enabled ? colors.primarySoft : colors.surfaceRaised,
            borderCurve: "continuous",
            borderRadius: radii.card,
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>Food management</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16 }}>
              {enabled ? "Khatiyan is managing this property's food" : "Currently managed outside Khatiyan"}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Manage meals with Khatiyan"
            disabled={busy || readOnly}
            onValueChange={onToggle}
            thumbColor={colors.surface}
            trackColor={{ false: colors.neutralSoft, true: colors.primary }}
            value={enabled}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * The meals the property advertises, which this screen may show but not change.
 *
 * <p>They belong to the property listing, so an owner who wants dinner added
 * is sent to Property settings rather than given a control here that would
 * silently rewrite what prospective tenants are being told.
 */
export function MealsServedCard({ meals }: { meals: MealType[] }) {
  const { colors, fonts, type } = useTheme();
  const ordered = MEAL_ORDER.filter((meal) => meals.includes(meal));
  return (
    <Card>
      <View style={{ gap: spacing.xxs }}>
        <Text style={[type.bodyStrong, { color: colors.ink }]}>Meals this property serves</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
          Set in Property settings, not here.
        </Text>
      </View>
      {ordered.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {ordered.map((meal) => (
            <MealChip key={meal} meal={meal} />
          ))}
        </View>
      ) : (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
          No meals are listed for this property yet.
        </Text>
      )}
    </Card>
  );
}

/**
 * What an owner does next, on a property where food is on but empty.
 *
 * <p>The compact numbered rows make the dependency order explicit without the
 * oversized action cards taking an entire screen before the second step.
 */
export function SetupSequence({
  onAddItem,
  onCreateProfile,
  onEditMenu,
  onSetTimings,
  overview,
  timingsSet,
}: {
  onAddItem: () => void;
  onCreateProfile: () => void;
  onEditMenu: () => void;
  /** Left out for a read-only manager, who can see the step but not do it. */
  onSetTimings?: () => void;
  overview: FoodModuleOverview;
  /** Every served meal has a saved time, not the default. */
  timingsSet: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>Set up food service</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
          Each step needs the one before it.
        </Text>
      </View>
      {/* Required, and first (user, 2026-09-28): the next meal, the kitchen's
          forecast and meal delays all run on these times. */}
      <SetupStep
        description="When each meal is served. Up next, the forecast and delays follow these times."
        done={timingsSet}
        icon="clock-outline"
        onPress={onSetTimings ?? (() => {})}
        title="Set meal timings"
      />
      <SetupStep
        description="Name what your kitchen cooks and the unit you measure it in."
        done={overview.activeItems > 0}
        icon="pot-steam-outline"
        onPress={onAddItem}
        title="Add food items"
      />
      <SetupStep
        description="Group tenants by what they eat, like veg, non-veg or Jain."
        done={overview.activeProfiles > 0}
        icon="clipboard-list-outline"
        onPress={onCreateProfile}
        title="Create food profiles"
      />
      <SetupStep
        description="Plan each profile's meals for every day of the week."
        done={false}
        icon="calendar-edit"
        onPress={onEditMenu}
        title="Prepare the weekly menu"
      />
      <NoticeBar
        message="Tenants can pick a profile as soon as one has a menu. You do not need to invite them."
        title="When tenants can subscribe"
        tone="info"
      />
    </View>
  );
}

/**
 * One step of the setup sequence.
 *
 * <p>No numeral in a disc. The designs circle 1, 2, 3 beside each row, but the
 * same badge was stripped out of the verification wizard for the reason it is
 * stripped out here: the order is already carried by the stack, and a circled
 * digit competes with the thing the row is telling you to do. A finished step
 * says "Done" instead, which is the fact the numeral was standing in front of.
 *
 * <p>The disc also carried a `primarySoft` fill, which is not a background this
 * app uses anywhere.
 */
function SetupStep({
  description,
  done,
  icon,
  onPress,
  title,
}: {
  description: string;
  done: boolean;
  icon: MaterialIconName;
  onPress: () => void;
  title: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={title}
      accessibilityState={{ checked: done }}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.sm + 2,
      }}
    >
      {/* A grey disc with an ink glyph. A done step swaps to a green disc
          with a white tick, which is how status is marked app-wide. */}
      {done ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.jade,
            borderRadius: radii.pill,
            height: 32,
            justifyContent: "center",
            width: 32,
          }}
        >
          <MaterialCommunityIcons color={colors.onPrimary} name="check" size={18} />
        </View>
      ) : (
        // A grey disc, no ring (user, 2026-09-28).
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.neutralSoft,
            borderRadius: radii.pill,
            height: 32,
            justifyContent: "center",
            width: 32,
          }}
        >
          <MaterialCommunityIcons color={colors.ink} name={icon} size={17} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>{title}</Text>
        <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
          {description}
        </Text>
      </View>
      <MaterialCommunityIcons color={colors.kicker} name="chevron-right" size={20} />
    </AnimatedPressable>
  );
}

/**
 * The next meal's quantities, previewed on the overview.
 *
 * <p>Consolidated totals only — what actually goes in the pot. The per-profile
 * split matters at the serving counter, not here, and putting both on a summary
 * card made it the longest thing on the screen.
 */
/**
 * The next meal and what to cook for it. Which meal is next, its time and any
 * delay all come from the server's meal schedule (2026-09-28), which stops
 * offering one once the day's last meal is over.
 */
export function CookingPreview({
  forecast,
  loading,
  onDelay,
  onOpenForecast,
  slot,
}: {
  forecast: CookingForecast | undefined;
  loading: boolean;
  /** Left out when the meal can no longer be delayed, or for a read-only manager. */
  onDelay?: () => void;
  onOpenForecast: () => void;
  slot: MealSlot;
}) {
  const { colors, fonts, type } = useTheme();
  const items = forecast?.consolidatedItems ?? [];
  const mealType = slot.mealType;

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minWidth: 0 }}>
          <MealGlyph color={colors.ink} meal={mealType} size={22} />
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>{MEAL_LABEL[mealType]}</Text>
        </View>
        {slot.status === "SERVING" ? (
          <FoodStatusChip icon="silverware-fork-knife" label="Serving now" tone="success" />
        ) : (
          <FoodStatusChip icon="clock-outline" label="Up next" tone="warning" />
        )}
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {/* The meal's time on a grey pill (user, 2026-09-28). */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.neutralSoft,
            borderRadius: radii.pill,
            flexDirection: "row",
            gap: spacing.xxs + 1,
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
          }}
        >
          <MaterialCommunityIcons color={colors.inkSoft} name="clock-outline" size={14} />
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>
            {formatMealWindow(slot.startTime, slot.endTime)}
          </Text>
        </View>
        {slot.delayMinutes > 0 ? <DelayedChip minutes={slot.delayMinutes} /> : null}
      </View>

      {loading ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5 }}>
          Working out quantities…
        </Text>
      ) : items.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>
          Nothing to cook for this meal. Either no profile has a menu for it, or nobody has subscribed.
        </Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.kicker, fontFamily: fonts.sans, fontSize: 11.5 }}>
            {forecast?.totalSubscribers === 1 ? "1 person eating" : `${forecast?.totalSubscribers} people eating`}
          </Text>
          {items.slice(0, 4).map((item) => (
            <View
              key={item.itemId}
              style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}
            >
              <Text
                numberOfLines={1}
                style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.sans, fontSize: 13 }}
              >
                {item.itemName}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>
                {formatBulkQuantity(item.targetQuantity, item.quantityUnit)}
              </Text>
            </View>
          ))}
          {items.length > 4 ? (
            <Text style={{ color: colors.kicker, fontFamily: fonts.sans, fontSize: 11.5 }}>
              and {items.length - 4} more
            </Text>
          ) : null}
        </View>
      )}

      {/* Two equal buttons across the card (user, 2026-09-28). Delay drops out
          once the meal can no longer be delayed, and the forecast takes the row. */}
      <View style={{ borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm }}>
        <ActionButton icon={foodIcon("chart-box-outline")} label="View forecast" onPress={onOpenForecast} variant="primary" />
        {onDelay ? (
          <ActionButton icon={foodIcon("clock-plus-outline")} label="Delay" onPress={onDelay} variant="secondary" />
        ) : null}
      </View>
    </Card>
  );
}

/** The counts across the top of the overview. */
/**
 * The four food figures, as the Billing and Tenancy snapshot tiles: a card
 * with a black glyph in a side rail and the label, number and a hint beside it
 * (user, 2026-10-02). "Active" moves from the labels into the hints.
 */
export function FoodStats({ overview }: { overview: FoodModuleOverview }) {
  const meals = MEAL_ORDER.filter((meal) => overview.availableMeals.includes(meal));
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <MetricTile icon={FoodProfilesIcon} iconPlacement="side" label="Food profiles" value={String(overview.activeProfiles)} hint="Active" />
        <MetricTile icon={FoodItemsIcon} iconPlacement="side" label="Food items" value={String(overview.activeItems)} hint="Active" />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <MetricTile icon={SubscriptionsIcon} iconPlacement="side" label="Subscriptions" value={String(overview.activeSubscriptions)} hint="Active" />
        {/* The count leads like every other tile; the meal names, which used
            to be the value and shrank to fit, read in the hint instead. */}
        <MetricTile
          icon={AvailableMealsIcon}
          iconPlacement="side"
          label="Available meals"
          value={String(meals.length)}
          hint={meals.length > 0 ? meals.map((meal) => MEAL_LABEL[meal]).join(", ") : "None set"}
        />
      </View>
    </View>
  );
}

function foodStatIcon(name: React.ComponentProps<typeof MaterialCommunityIcons>["name"]) {
  return function FoodStatIcon({ size = 22 }: LucideProps) {
    return <MaterialCommunityIcons name={name} color="#000000" size={Number(size)} />;
  };
}

const FoodProfilesIcon = foodStatIcon("account-outline");
const FoodItemsIcon = foodStatIcon("silverware-fork-knife");
const SubscriptionsIcon = foodStatIcon("account-group-outline");
const AvailableMealsIcon = foodStatIcon("food-variant");
