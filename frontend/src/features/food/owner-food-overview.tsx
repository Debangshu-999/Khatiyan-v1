import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Switch, Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { NoticeBar } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import type { MealType } from "@/store/services/property-api";
import {
  type CookingForecast,
  type FoodModuleOverview,
} from "@/store/services/food-api";
import {
  FoodStat,
  MEAL_ICON,
  type MaterialIconName,
  MEAL_LABEL,
  MEAL_ORDER,
  MealChip,
  formatBulkQuantity,
  isoDate,
  todayInIst,
} from "@/features/food/food-ui";

/**
 * Roughly when each meal is served.
 *
 * <p>Only used to decide which meal the overview should preview, so it is the
 * kitchen's rhythm rather than a setting. Nothing is scheduled off these hours
 * and no bill depends on them, which is why they are a constant here instead of
 * four more fields on the property.
 */
const MEAL_HOUR: Record<MealType, number> = {
  BREAKFAST: 8,
  DINNER: 21,
  EVENING_SNACKS: 17,
  LUNCH: 13,
};

/**
 * The next meal this property will serve, and the day it falls on.
 *
 * <p>Rolls over to tomorrow once the day's last meal has passed, rather than
 * showing a dinner that was eaten three hours ago. An owner opening this at
 * eleven at night is asking what the kitchen does in the morning.
 */
export function nextMeal(available: MealType[]): { date: Date; mealType: MealType } | null {
  const served = MEAL_ORDER.filter((meal) => available.includes(meal));
  if (served.length === 0) {
    return null;
  }
  const now = todayInIst();
  const upcoming = served.find((meal) => MEAL_HOUR[meal] > now.getHours());
  if (upcoming) {
    return { date: now, mealType: upcoming };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return { date: tomorrow, mealType: served[0] };
}

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
  const { colors, fonts, type } = useTheme();
  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
          <Text style={[type.bodyStrong, { color: colors.ink }]}>Manage food with Khatiyan</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
            {enabled
              ? "Food items, profiles, weekly menus and cooking quantities are managed here."
              : "You are running food manually. Turn this on to manage items, menus and subscriptions."}
          </Text>
        </View>
        <Switch
          disabled={busy || readOnly}
          onValueChange={onToggle}
          thumbColor={colors.surface}
          trackColor={{ false: colors.neutralSoft, true: colors.primary }}
          value={enabled}
        />
      </View>
      {meals && meals.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {MEAL_ORDER.filter((meal) => meals.includes(meal)).map((meal) => (
            <MealChip key={meal} meal={meal} />
          ))}
        </View>
      ) : null}
    </Card>
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
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
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
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5 }}>
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
  overview,
}: {
  onAddItem: () => void;
  onCreateProfile: () => void;
  onEditMenu: () => void;
  overview: FoodModuleOverview;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>Set up food service</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
          Each step needs the one before it.
        </Text>
      </View>
      <SetupStep
        description="Name what your kitchen cooks and the unit you measure it in."
        done={overview.activeItems > 0}
        icon="bowl-mix-outline"
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
      {/* The house treatment for an icon: outlined container, ink glyph, no
          fill. A done step swaps to the one sanctioned exception — a filled
          disc with a white glyph, which is how status is marked app-wide. */}
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
        <View
          style={{
            alignItems: "center",
            borderColor: colors.borderStrong,
            borderRadius: radii.pill,
            borderWidth: 1,
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
        <Text numberOfLines={2} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16 }}>
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
export function CookingPreview({
  forecast,
  loading,
  mealType,
  onOpenForecast,
  when,
}: {
  forecast: CookingForecast | undefined;
  loading: boolean;
  mealType: MealType;
  onOpenForecast: () => void;
  when: Date;
}) {
  const { colors, fonts, type } = useTheme();
  const today = isoDate(todayInIst()) === isoDate(when);
  const items = forecast?.consolidatedItems ?? [];

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, minWidth: 0 }}>
          <MaterialCommunityIcons color={colors.ink} name={MEAL_ICON[mealType]} size={17} />
          <Text style={[type.bodyStrong, { color: colors.ink }]}>{MEAL_LABEL[mealType]}</Text>
        </View>
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5 }}>
          {today ? "Today" : "Tomorrow"}
        </Text>
      </View>

      {loading ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5 }}>
          Working out quantities…
        </Text>
      ) : items.length === 0 ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
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

      <View style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.sm }}>
        <Text onPress={onOpenForecast} style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
          View full forecast
        </Text>
      </View>
    </Card>
  );
}

/** The counts across the top of the overview. */
export function FoodStats({ overview }: { overview: FoodModuleOverview }) {
  const meals = MEAL_ORDER.filter((meal) => overview.availableMeals.includes(meal));
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      <FoodStat icon="account-outline" label="Active food profiles" value={String(overview.activeProfiles)} />
      <FoodStat icon="silverware-fork-knife" label="Food items" value={String(overview.activeItems)} />
      <FoodStat icon="account-group-outline" label="Active subscriptions" value={String(overview.activeSubscriptions)} />
      <FoodStat
        icon="food-variant"
        label="Available meals"
        value={meals.length > 0 ? meals.map((meal) => MEAL_LABEL[meal]).join(", ") : "None"}
      />
    </View>
  );
}
