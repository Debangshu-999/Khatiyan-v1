import type { ComponentType } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, ScrollView, Text, View, type ViewStyle } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { MarqueeText } from "@/components/marquee-text";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import type { MealType } from "@/store/services/property-api";
import {
  FOOD_UNIT_LABEL,
  type DayOfWeek,
  type FoodMenuEntry,
  type FoodQuantityUnit,
} from "@/store/services/food-api";

/**
 * The shared vocabulary of the food module.
 *
 * <p>Meals, weekdays and quantities are named and drawn the same way on every
 * food screen — the owner's menu editor, the kitchen's forecast and the tenant's
 * read-only week. Three screens inventing "180 g" three times is three chances
 * to disagree about it.
 */

// Material icons throughout this module, per the designs. Lucide is the app's
// general set, but the food glyphs it needs — a thali, a tiffin, a sunrise
// meal — either do not exist there or read as something else at 17px.
export type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

const iconCache = new Map<MaterialIconName, ComponentType<LucideProps>>();

/**
 * A material glyph, shaped like a lucide icon.
 *
 * <p>`ActionCard`, `MetricTile` and the module registry all take an icon as a
 * `ComponentType<LucideProps>`, so a material name has to be wrapped to be
 * passed to them — the same trick `PropertyIcon` plays. Stroke width is
 * meaningless for a font glyph and is ignored.
 *
 * <p>Cached by name because the result is a component type: building a new one
 * per render would give React a different type each time and remount the icon
 * on every parent update.
 */
export function foodIcon(name: MaterialIconName): ComponentType<LucideProps> {
  const cached = iconCache.get(name);
  if (cached) {
    return cached;
  }
  function FoodIcon({ color = "currentColor", size = 24 }: LucideProps) {
    return <MaterialCommunityIcons color={color} name={name} size={Number(size)} />;
  }
  iconCache.set(name, FoodIcon);
  return FoodIcon;
}

export const MEAL_ORDER: MealType[] = ["BREAKFAST", "LUNCH", "EVENING_SNACKS", "DINNER"];

export const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  DINNER: "Dinner",
  EVENING_SNACKS: "Evening snacks",
  LUNCH: "Lunch",
};

export const MEAL_ICON: Record<MealType, MaterialIconName> = {
  BREAKFAST: "weather-sunny",
  DINNER: "weather-night",
  EVENING_SNACKS: "coffee-outline",
  LUNCH: "silverware-fork-knife",
};

export const DAY_ORDER: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export const DAY_LABEL: Record<DayOfWeek, string> = {
  FRIDAY: "Friday",
  MONDAY: "Monday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
  THURSDAY: "Thursday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
};

/**
 * Today's weekday, in IST.
 *
 * <p>Asia/Kolkata rather than the device clock, matching the rest of the app:
 * a phone left on a foreign timezone would otherwise open the menu editor on
 * yesterday, and at 11pm IST would open it on tomorrow.
 */
export function todayInIst(): Date {
  const now = new Date();
  // Hermes on Android does not reliably parse the locale string produced by
  // toLocaleString(), which turned every day chip into "NaN / Invalid Date".
  // Shift the timestamp so the Date's local fields represent IST without
  // parsing a formatted date string.
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
}

/** Dietary identity mark used consistently on owner and tenant profile cards. */
export function FoodProfileMark({ name, size = 44 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const normalized = name.toLowerCase();
  const jain = normalized.includes("jain");
  const nonVegetarian = normalized.includes("non-veg") || normalized.includes("non veg") || normalized.includes("chicken") || normalized.includes("meat");
  const vegetarian = !nonVegetarian && (normalized.includes("veg") || normalized.includes("vegetarian"));
  const icon: MaterialIconName = jain ? "om" : nonVegetarian ? "food-drumstick-outline" : vegetarian ? "leaf" : "silverware-fork-knife";
  const color = jain ? colors.accent : nonVegetarian ? colors.warningText : vegetarian ? colors.jade : colors.primary;
  const backgroundColor = jain ? colors.warningSoft : nonVegetarian ? colors.warningSoft : vegetarian ? colors.successSoft : colors.primarySoft;
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor,
        borderRadius: size / 2,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <MaterialCommunityIcons color={color} name={icon} size={Math.round(size * 0.52)} />
    </View>
  );
}

export function weekdayOf(date: Date): DayOfWeek {
  // getDay() is Sunday-first; DAY_ORDER is Monday-first, as the menu reads.
  return DAY_ORDER[(date.getDay() + 6) % 7];
}

/** The Monday-to-Sunday week containing `date`, as seven dates. */
export function weekFrom(date: Date): Date[] {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return DAY_ORDER.map((_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

/**
 * Seven days starting at `date`.
 *
 * <p>For the forecast, which is about actual dates rather than a repeating
 * pattern: the kitchen wants today and the week in front of it, not a Monday
 * that may already have passed. The weekly MENU uses {@link weekFrom} instead,
 * because a menu belongs to a week rather than to a day.
 *
 * <p>Seven consecutive days still hit each weekday exactly once, so a strip
 * keyed by weekday stays unambiguous.
 */
export function sevenDaysFrom(date: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return day;
  });
}

/** "16 Sep" — the label under a weekday in the day strip. */
export function shortDate(date: Date): string {
  return `${date.getDate()} ${date.toLocaleString("en-GB", { month: "short" })}`;
}

/** "2026-09-16", which is what the forecast endpoint's `date` param wants. */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A quantity as the kitchen would say it: "4 pcs", "1.5 kg", "180 ml".
 *
 * <p>Trailing zeros are dropped. The backend stores every quantity at three
 * decimals, so an untrimmed "4.000 pcs" would be on every row of every menu.
 */
export function formatQuantity(value: number, unit: FoodQuantityUnit): string {
  return `${trimNumber(value)} ${FOOD_UNIT_LABEL[unit]}`;
}

/** Three decimals at most, with trailing zeros dropped. */
function trimNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "");
}

/**
 * A forecast total, in the unit somebody would actually say.
 *
 * <p>"2.475 Kg", not "2475 grams". A per-person portion is always small enough
 * to read in grams, but a whole property's total is not — and a four-digit
 * gram figure is both harder to scan and harder to check against a weighing
 * scale that reads in kilos.
 *
 * <p>Only mass and volume scale up. Pieces stay pieces: there is no larger
 * unit for a roti.
 */
export function formatBulkQuantity(value: number, unit: FoodQuantityUnit): string {
  const bulk =
    unit === "GRAM"
      ? { label: FOOD_UNIT_LABEL.KILOGRAM, per: 1000 }
      : unit === "MILLILITRE"
        ? { label: FOOD_UNIT_LABEL.LITRE, per: 1000 }
        : null;

  // Exactly 1000 counts as the bulk unit: "1 Kg" beats "1000 grams".
  if (!bulk || value < bulk.per) {
    return formatQuantity(value, unit);
  }
  return `${trimNumber(value / bulk.per)} ${bulk.label}`;
}

/**
 * What one menu entry actually cooks, in one line.
 *
 * <p>Leads with the per-person portion, because that is the number an owner
 * recognises. The extras only appear when they are set — an entry with no
 * repeat allowance and no buffer should not advertise two zeros.
 */
export function entrySummary(entry: FoodMenuEntry): string {
  const parts = [`${formatQuantity(entry.baseQuantityPerSubscriber, entry.quantityUnit)} per person`];
  if (entry.repeatQuantity > 0 && entry.expectedRepeatPercentage > 0) {
    parts.push(
      `${formatQuantity(entry.repeatQuantity, entry.quantityUnit)} repeat for ${entry.expectedRepeatPercentage}%`,
    );
  }
  if (entry.fixedBufferQuantity > 0) {
    parts.push(`${formatQuantity(entry.fixedBufferQuantity, entry.quantityUnit)} buffer`);
  }
  if (entry.batchSize != null) {
    parts.push(`batches of ${formatQuantity(entry.batchSize, entry.quantityUnit)}`);
  }
  return parts.join(" · ");
}

/**
 * A status chip for the food module: an icon, then the word.
 *
 * <p>Its own component rather than a change to the shared `StatusPill`. That
 * one is tint-and-caps by rule, with no icon slot, and it is on dozens of
 * screens — widening it here would restyle every status in the app to suit one
 * list.
 *
 * <p>Title case, not the app's uppercase eyebrow: with a glyph beside it a
 * capitalised word reads as a second icon rather than a label.
 */
export function FoodStatusChip({
  icon,
  label,
  tone,
}: {
  icon: MaterialIconName;
  label: string;
  tone: "success" | "neutral" | "warning";
}) {
  const { colors, fonts } = useTheme();
  const palette = {
    neutral: { background: colors.neutralSoft, ink: colors.neutralText },
    success: { background: colors.successSoft, ink: colors.successText },
    warning: { background: colors.warningSoft, ink: colors.warningText },
  }[tone];

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: palette.background,
        borderRadius: radii.pill,
        flexDirection: "row",
        gap: spacing.xxs + 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
      }}
    >
      <MaterialCommunityIcons color={palette.ink} name={icon} size={13} />
      <Text style={{ color: palette.ink, fontFamily: fonts.sansBold, fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}

/**
 * A meal the property serves, as a chip.
 *
 * <p>Outlined with an ink glyph, not the designs' pale blue fill: `primarySoft`
 * is not a background anywhere in this app. The chip is a statement of fact
 * rather than a control, so it never takes a selected state.
 */
export function MealChip({ meal, style }: { meal: MealType; style?: ViewStyle }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={[
        {
          alignItems: "center",
          borderColor: colors.borderStrong,
          borderRadius: radii.pill,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xxs + 1,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons color={colors.ink} name={MEAL_ICON[meal]} size={15} />
      <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 12 }}>
        {MEAL_LABEL[meal]}
      </Text>
    </View>
  );
}

/**
 * The Mon-to-Sun strip above a weekly menu.
 *
 * <p>A weekly menu is a repeating template, so it deliberately shows weekdays
 * only. Calendar dates belong to cooking forecasts, not to the menu definition.
 */
export function DayStrip({
  bleed = spacing.lg,
  onSelect,
  selected,
  showDates = false,
  week,
}: {
  /**
   * The screen gutter to cancel, so the strip runs to both edges.
   *
   * <p>This is what makes the row read as scrollable. Stopped inside the
   * gutter, the last bubble ends on a tidy margin and the strip looks like it
   * fits — running under the edge leaves a sliced bubble that says there is
   * more to the right. Pass the padding of the screen this sits in.
   */
  bleed?: number;
  onSelect: (day: DayOfWeek) => void;
  selected: DayOfWeek;
  /** Forecasts are date-specific; repeating weekly menus leave this off. */
  showDates?: boolean;
  week: Date[];
}) {
  const { colors, fonts } = useTheme();
  return (
    /* Scrolls rather than dividing the screen width by seven. At seven equal
       columns a phone gives each day about 44pt, which is under the touch
       target minimum and clips "Wed" against its date. Sliding lets each day
       take the width it needs and keeps the row legible on a small screen. */
    <ScrollView
      contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: bleed }}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed }}
    >
      {week.map((date) => {
        const day = weekdayOf(date);
        const active = day === selected;
        return (
          <AnimatedPressable
            accessibilityLabel={DAY_LABEL[day]}
            accessibilityState={{ selected: active }}
            key={day}
            onPress={() => onSelect(day)}
            style={{
              alignItems: "center",
              backgroundColor: active ? colors.tabSelected : colors.surface,
              borderColor: active ? colors.tabSelectedDeep : colors.border,
              borderRadius: radii.sm,
              borderWidth: 1,
              justifyContent: "center",
              minHeight: showDates ? 56 : 46,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? colors.onTabSelected : colors.ink,
                fontFamily: fonts.sansBold,
                fontSize: 13.5,
              }}
            >
              {DAY_LABEL[day]}
            </Text>
            {showDates ? (
              <Text
                numberOfLines={1}
                style={{
                  color: active ? colors.onTabSelected : colors.muted,
                  fontFamily: fonts.sans,
                  fontSize: 10,
                  marginTop: 1,
                }}
              >
                {shortDate(date)}
              </Text>
            ) : null}
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * The square that stands in for a dish.
 *
 * <p>Falls back to a glyph rather than a broken frame: an owner photographs
 * maybe three of twenty items, and a grid of grey rectangles reads as a screen
 * that failed to load rather than one that simply has no pictures.
 */
/**
 * Stands in for a description nobody wrote.
 *
 * <p>Italic and muted, the same way the notice board marks "No attachments".
 * Printing nothing collapses the card and makes two items of the same name
 * look like different shapes; saying so keeps the row the same height and
 * tells the owner there is something to fill in.
 */
export function NoDescription() {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.caption, { color: colors.muted, fontStyle: "italic" }]}>No description</Text>
  );
}

export function FoodItemThumb({
  imageUrl,
  size = 46,
}: {
  imageUrl: string | null;
  size?: number;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        // White, not sunken. A grey square reads as a picture still loading;
        // an empty white one framed by its border reads as a slot nobody has
        // filled, which is what it is.
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: radii.sm,
        borderWidth: 1,
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        padding: 2,
        width: size,
      }}
    >
      {imageUrl ? (
        <Image resizeMode="cover" source={{ uri: imageUrl }} style={{ height: size, width: size }} />
      ) : (
        /* The "no image" glyph, not a bowl. A bowl says "food", which every row
           here already says — a struck-through picture says the one thing this
           slot is missing, and it stays legible at 38px where words would not. */
        <MaterialCommunityIcons
          color={colors.kicker}
          name="image-off-outline"
          size={Math.round(size * 0.42)}
        />
      )}
    </View>
  );
}

/**
 * A labelled count, for the row of numbers on the overview.
 *
 * <p>Deliberately not `MetricTile`: these are three or four small facts in a
 * grid, and a metric tile's presence is built for a headline number like this
 * month's rent.
 */
export function FoodStat({
  icon,
  label,
  value,
}: {
  icon: MaterialIconName;
  label: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const longValue = value.length > 8;
  return (
    <View
      style={{
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        flexBasis: "47%",
        flexGrow: 1,
        gap: spacing.xs,
        // A floor rather than a fixed height, so the four tiles stay level
        // whether their value is "27" or three meal names.
        minHeight: 108,
        minWidth: 0,
        padding: spacing.md,
      }}
    >
      <MaterialCommunityIcons color={colors.primary} name={icon} size={22} />
      <Text
        numberOfLines={longValue ? 2 : 1}
        style={[
          type.metric,
          { color: colors.ink, fontSize: longValue ? 15.5 : 26, lineHeight: longValue ? 20 : 30 },
        ]}
      >
        {value}
      </Text>
      <MarqueeText style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5 }}>
        {label}
      </MarqueeText>
    </View>
  );
}
