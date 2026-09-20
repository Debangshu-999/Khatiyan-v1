import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { X } from "lucide-react-native";
import { Modal, ScrollView, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { FoodMenuSkeleton } from "@/components/skeletons";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, FormInput, NoticeBar, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAvailableAccounts } from "@/features/account/accounts";
import {
  DAY_LABEL,
  DayStrip,
  FoodItemThumb,
  MEAL_ICON,
  MEAL_LABEL,
  MEAL_ORDER,
  entrySummary,
  foodIcon,
  todayInIst,
  weekFrom,
  weekdayOf,
} from "@/features/food/food-ui";
import { useAppSelector } from "@/store/hooks";
import {
  FOOD_UNIT_LABEL,
  useCreateFoodMenuEntryMutation,
  useDeactivateFoodMenuEntryMutation,
  useGetFoodOverviewQuery,
  useGetFoodProfileMenuQuery,
  useListFoodItemsQuery,
  useUpdateFoodMenuEntryMutation,
  type DayOfWeek,
  type FoodItem,
  type FoodMenuEntry,
  type FoodQuantityUnit,
  type SaveFoodMenuEntryBody,
} from "@/store/services/food-api";
import type { MealType } from "@/store/services/property-api";
import { DIALOG_MAX_WIDTH, radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One profile's week, a day at a time.
 *
 * <p>Saved per row, not per screen. The API creates, edits and removes one
 * entry at a time, so a single "Save weekly menu" button would be one press
 * fanning out into a dozen calls that can half-fail — leaving the screen
 * claiming a week was saved when four rows of it were not.
 */
export default function OwnerFoodMenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileId?: string; profileName?: string }>();
  const profileId = params.profileId ?? "";
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const { canManage } = usePropertyPermissions(propertyId);
  const readOnly = !canManage("FOOD");

  const week = useMemo(() => weekFrom(todayInIst()), []);
  // Monday, not today. This menu repeats every week rather than belonging to a
  // date, so it is read and edited from the start of the week — opening on
  // Thursday made the first three days look like they had nothing planned.
  const [day, setDay] = useState<DayOfWeek>("MONDAY");
  // Adding and editing are no longer the same sheet. Adding picks SEVERAL items
  // at once and gives each a starting portion; editing changes the numbers on
  // one entry whose item is already decided.
  const [adding, setAdding] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<FoodMenuEntry | null>(null);
  const [removing, setRemoving] = useState<FoodMenuEntry | null>(null);

  const overviewQuery = useGetFoodOverviewQuery(propertyId, { skip: !propertyId });
  const menuQuery = useGetFoodProfileMenuQuery({ profileId, propertyId }, { skip: !propertyId || !profileId });
  const itemsQuery = useListFoodItemsQuery(propertyId, { skip: !propertyId });

  const [deactivate, deactivateState] = useDeactivateFoodMenuEntryMutation();
  const opErrors = useFormErrors<never>();
  const toast = useToast();

  const served = overviewQuery.data?.availableMeals ?? [];
  const entries = menuQuery.data?.entries ?? [];
  const todaysEntries = entries.filter((entry) => entry.dayOfWeek === day);

  // Meals the property has since stopped serving, but which still carry rows.
  // The forecast refuses those meals outright, so without this the only symptom
  // was an error on a screen that could not fix it.
  const stale = todaysEntries.filter((entry) => !entry.mealStillServed);

  async function remove(entry: FoodMenuEntry) {
    setRemoving(null);
    try {
      await deactivate({ entryId: entry.id, propertyId }).unwrap();
      toast.ok(`${entry.itemName} removed from ${MEAL_LABEL[entry.mealType].toLowerCase()}`);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  if (
    (!overviewQuery.data && overviewQuery.isFetching) ||
    (!menuQuery.data && menuQuery.isFetching)
  ) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          badge={readOnly ? <ViewOnlyChip /> : null}
          italicTail="menu."
          subtitle={params.profileName ? `${params.profileName} · repeats every week` : "Repeats every week"}
          title="Weekly"
        />
        <FoodMenuSkeleton />
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        badge={readOnly ? <ViewOnlyChip /> : null}
        italicTail="menu."
        subtitle={params.profileName ? `${params.profileName} · repeats every week` : "Repeats every week"}
        title="Weekly"
      />

      <DayStrip onSelect={setDay} selected={day} week={week} />

      {stale.length > 0 ? (
        <NoticeBar
          message={`${stale.length === 1 ? "One item is" : `${stale.length} items are`} planned for a meal this property no longer serves. Remove them, or add the meal back in Property settings.`}
          title="Some rows are stranded"
          tone="warning"
        />
      ) : null}

      {MEAL_ORDER.filter((meal) => served.includes(meal)).map((meal) => (
        <MealSection
          day={day}
          entries={todaysEntries.filter((entry) => entry.mealType === meal)}
          key={meal}
          meal={meal}
          onAdd={() => setAdding(meal)}
          onEdit={(entry) => setEditing(entry)}
          onRemove={setRemoving}
          readOnly={readOnly}
        />
      ))}

      {/* Rows whose meal is gone still have to be reachable, or they can never
          be cleared. They get their own section rather than being hidden. */}
      {MEAL_ORDER.filter((meal) => !served.includes(meal) && todaysEntries.some((entry) => entry.mealType === meal)).map(
        (meal) => (
          <MealSection
            day={day}
            entries={todaysEntries.filter((entry) => entry.mealType === meal)}
            key={meal}
            meal={meal}
            onAdd={() => undefined}
            onEdit={(entry) => setEditing(entry)}
            onRemove={setRemoving}
            readOnly={readOnly}
            stranded
          />
        ),
      )}

      {served.length === 0 ? (
        <NoticeBar
          message="This property does not list any meals yet. Add them in Property settings and they appear here."
          title="No meals to plan"
          tone="info"
        />
      ) : null}

      {adding ? (
        <FoodItemPickerDialog
          day={day}
          items={(itemsQuery.data ?? []).filter(
            (item) =>
              item.active &&
              // Tagged for THIS meal. Without it the picker offered the whole
              // catalogue and breakfast was a list with chicken curry in it.
              item.mealTags.includes(adding) &&
              !todaysEntries.some((entry) => entry.mealType === adding && entry.itemId === item.id),
          )}
          meal={adding}
          onClose={() => setAdding(null)}
          profileId={profileId}
          propertyId={propertyId}
        />
      ) : null}

      {editing ? (
        <MenuEntrySheet day={day} entry={editing} onClose={() => setEditing(null)} propertyId={propertyId} />
      ) : null}

      {removing ? (
        <ConfirmDialog
          confirmLabel={deactivateState.isLoading ? "Removing…" : "Remove"}
          destructive
          message={`${removing.itemName} will no longer be cooked for ${MEAL_LABEL[removing.mealType].toLowerCase()} on ${DAY_LABEL[removing.dayOfWeek]}.`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
          title="Remove from this menu?"
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </ScreenScrollView>
  );
}

function MealSection({
  day,
  entries,
  meal,
  onAdd,
  onEdit,
  onRemove,
  readOnly,
  stranded,
}: {
  day: DayOfWeek;
  entries: FoodMenuEntry[];
  meal: MealType;
  onAdd: () => void;
  onEdit: (entry: FoodMenuEntry) => void;
  onRemove: (entry: FoodMenuEntry) => void;
  readOnly: boolean;
  stranded?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        borderColor: stranded ? colors.warning : colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        // Each meal is a working area, not a list row. A minimum height keeps
        // an empty Dinner the same size as a full Lunch, so the three meals
        // read as three equal slots to fill rather than collapsing to nothing
        // the moment they are empty.
        minHeight: 210,
        padding: spacing.lg,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <MaterialCommunityIcons color={colors.ink} name={MEAL_ICON[meal]} size={21} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 18 }}>
          {MEAL_LABEL[meal]}
        </Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
          {entries.length === 1 ? "1 item" : `${entries.length} items`}
        </Text>
      </View>

      {stranded ? (
        <Text style={{ color: colors.warningText, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 }}>
          This property no longer serves {MEAL_LABEL[meal].toLowerCase()}, so none of this is cooked.
        </Text>
      ) : null}

      {entries.length === 0 ? (
        <View style={{ alignItems: "center", flex: 1, gap: spacing.xs, justifyContent: "center", paddingVertical: spacing.lg }}>
          <MaterialCommunityIcons color={colors.kicker} name="silverware-clean" size={26} />
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, textAlign: "center" }}>
            Nothing planned for {MEAL_LABEL[meal].toLowerCase()} on {DAY_LABEL[day]}.
          </Text>
        </View>
      ) : (
        entries.map((entry) => (
          <View
            key={entry.id}
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceRaised,
              borderRadius: radii.sm,
              flexDirection: "row",
              gap: spacing.sm,
              padding: spacing.sm,
            }}
          >
            <FoodItemThumb imageUrl={entry.itemImageUrl} size={46} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
                {entry.itemName}
              </Text>
              <Text numberOfLines={2} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16 }}>
                {entrySummary(entry)}
              </Text>
            </View>
            {!readOnly ? (
              <View style={{ flexDirection: "row", gap: spacing.xxs }}>
                <IconAction icon="pencil-outline" label="Edit" onPress={() => onEdit(entry)} tone={colors.primary} />
                <IconAction icon="close" label="Remove" onPress={() => onRemove(entry)} tone={colors.muted} />
              </View>
            ) : null}
          </View>
        ))
      )}

      {!readOnly && !stranded ? (
        <View style={{ flexDirection: "row", marginTop: "auto" }}>
          <ActionButton icon={foodIcon("plus")} label="Add item" onPress={onAdd} />
        </View>
      ) : null}
    </View>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: Parameters<typeof foodIcon>[0];
  label: string;
  onPress: () => void;
  tone: string;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.borderStrong,
        borderRadius: radii.pill,
        borderWidth: 1,
        height: 28,
        justifyContent: "center",
        width: 28,
      }}
    >
      <MaterialCommunityIcons color={tone} name={icon} size={15} />
    </AnimatedPressable>
  );
}

/**
 * The unit the bulk quantities are typed in.
 *
 * <p>A buffer and a batch size are kitchen-scale numbers: "half a kilo spare",
 * "a five kilo cooker". Typing those in grams means 500 and 5000 beside a
 * per-person field reading 150, and a slipped zero is a tenfold error nobody
 * spots. So these two fields are entered in the bulk unit and converted on the
 * way to the server, which still stores everything in the item's own unit.
 *
 * <p>Only mass and volume have a bulk form. Pieces and servings are already
 * counted in the unit people say out loud.
 */
const BULK_UNIT: Partial<Record<FoodQuantityUnit, { label: string; perUnit: number }>> = {
  GRAM: { label: "Kg", perUnit: 1000 },
  MILLILITRE: { label: "litres", perUnit: 1000 },
};

type Field = "item" | "base" | "repeat" | "repeatPercent" | "buffer" | "batch";

/**
 * Add or change one item on one meal of one day.
 *
 * <p>The per-person portion is the only quantity up front. The other four —
 * a second helping, how many take one, the standing buffer, and the batch the
 * kitchen cooks in — sit behind "Fine-tune", because most entries never need
 * them and a five-field form to say "four rotis" gets abandoned.
 */
/**
 * Picks several dishes for one meal at once.
 *
 * <p>A central dialog of pictures rather than a list of names in a dropdown.
 * Kitchens plan a meal as a set — rice AND dal AND a sabzi — and adding them
 * one at a time meant reopening the same sheet three times. The picture is what
 * makes a row scannable when a property has twenty items.
 *
 * <p>Each item lands with a one-per-person portion. That is a starting point,
 * not a guess at the real number: the owner sets quantities by tapping the row
 * afterwards, and a portion of one is the only value that is obviously
 * provisional.
 */
function FoodItemPickerDialog({
  day,
  items,
  meal,
  onClose,
  profileId,
  propertyId,
}: {
  day: DayOfWeek;
  items: FoodItem[];
  meal: MealType;
  onClose: () => void;
  profileId: string;
  propertyId: string;
}) {
  const { colors, fonts } = useTheme();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [create, createState] = useCreateFoodMenuEntryMutation();
  const opErrors = useFormErrors<never>();

  function toggle(itemId: string) {
    setSelected((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  }

  async function add() {
    if (selected.length === 0) {
      return;
    }
    try {
      // Sequential, not Promise.all: each create competes for the same
      // (profile, day, meal, item) uniqueness index, and a partial failure
      // should stop rather than leave a scattered half of the selection in.
      for (const itemId of selected) {
        await create({
          body: {
            baseQuantityPerSubscriber: 1,
            batchSize: null,
            dayOfWeek: day,
            expectedRepeatPercentage: 0,
            fixedBufferQuantity: 0,
            itemId,
            mealType: meal,
            repeatQuantity: 0,
          },
          profileId,
          propertyId,
        }).unwrap();
      }
      toast.ok(selected.length === 1 ? "Added to the menu" : `${selected.length} items added`);
      onClose();
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 14,
            maxHeight: "80%",
            maxWidth: DIALOG_MAX_WIDTH,
            overflow: "hidden",
            width: "100%",
          }}
        >
          {/* Close is the cross, not a Cancel down beside the confirm. A
              dismiss sitting next to the action halves the width of the button
              that actually does something, and the app closes every other sheet
              by the same grey disc. */}
          <View
            style={{
              alignItems: "flex-start",
              flexDirection: "row",
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>
                Add to {MEAL_LABEL[meal].toLowerCase()}
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5 }}>
                {DAY_LABEL[day]} · tap to pick as many as you need
              </Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: colors.surfaceSunken,
                borderRadius: 999,
                height: 32,
                justifyContent: "center",
                width: 32,
              }}
            >
              <X color={colors.ink} size={16} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

          {items.length === 0 ? (
            <Text
              style={{
                color: colors.muted,
                fontFamily: fonts.sans,
                fontSize: 12.5,
                lineHeight: 18,
                padding: spacing.lg,
              }}
            >
              Nothing left to add to {MEAL_LABEL[meal].toLowerCase()}. Either everything tagged for it is already
              here, or no food item is tagged for this meal yet — tag one on the Food items tab.
            </Text>
          ) : (
            <ScrollView
              contentContainerStyle={{ gap: spacing.xs, padding: spacing.lg }}
              showsVerticalScrollIndicator
            >
              {items.map((item) => {
                const picked = selected.includes(item.id);
                return (
                  <AnimatedPressable
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected: picked }}
                    key={item.id}
                    onPress={() => toggle(item.id)}
                    style={{
                      alignItems: "center",
                      // The one sanctioned pale blue fill: a selected row in a
                      // multi-select list, marked by the fill alone with no
                      // border change and no checkbox.
                      backgroundColor: picked ? colors.primarySoft : colors.surface,
                      borderColor: picked ? colors.primarySoft : colors.border,
                      borderRadius: radii.card,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: spacing.sm,
                      padding: spacing.sm,
                    }}
                  >
                    <FoodItemThumb imageUrl={item.imageUrl} size={48} />
                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: picked ? colors.primaryDeep : colors.ink,
                          fontFamily: fonts.sansBold,
                          fontSize: 14,
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5 }}>
                        Measured in {FOOD_UNIT_LABEL[item.quantityUnit]}
                      </Text>
                    </View>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          )}

          {/* No rule above it. The list scrolls under the action, the way the
              app's pinned footers work — a hairline here cut the dialog into
              two stacked boxes instead of one surface. */}
          <View style={{ flexDirection: "row", paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm }}>
            <ActionButton
              disabled={selected.length === 0 || createState.isLoading}
              label={
                createState.isLoading
                  ? "Adding…"
                  : selected.length === 0
                    ? "Add"
                    : selected.length === 1
                      ? "Add 1 item"
                      : `Add ${selected.length} items`
              }
              onPress={() => void add()}
            />
          </View>
        </View>
      </View>

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </Modal>
  );
}

function MenuEntrySheet({
  day,
  entry,
  onClose,
  propertyId,
}: {
  day: DayOfWeek;
  entry: FoodMenuEntry;
  onClose: () => void;
  propertyId: string;
}) {
  const { colors, fonts } = useTheme();
  const toast = useToast();
  const form = useFormErrors<Field>();
  const [base, setBase] = useState(String(entry.baseQuantityPerSubscriber));
  const [repeat, setRepeat] = useState(entry.repeatQuantity > 0 ? String(entry.repeatQuantity) : "");
  const [repeatPercent, setRepeatPercent] = useState(
    entry.expectedRepeatPercentage > 0 ? String(entry.expectedRepeatPercentage) : "",
  );
  // Stored in the item's unit, shown in the bulk one.
  const [buffer, setBuffer] = useState(
    entry.fixedBufferQuantity > 0 ? String(entry.fixedBufferQuantity / (BULK_UNIT[entry.quantityUnit]?.perUnit ?? 1)) : "",
  );
  const [batch, setBatch] = useState(
    entry.batchSize != null ? String(entry.batchSize / (BULK_UNIT[entry.quantityUnit]?.perUnit ?? 1)) : "",
  );
  const [explaining, setExplaining] = useState(false);
  const [tuning, setTuning] = useState(
    entry.repeatQuantity > 0 || entry.fixedBufferQuantity > 0 || entry.batchSize != null,
  );

  // A field counts as filled only when it carries a real, positive number:
  // "0" in either box is the same as leaving it blank, and marking its partner
  // required for a zero would demand a number that changes nothing.
  const repeatFilled = (decimal(repeat) ?? 0) > 0;
  const percentFilled = (Number(repeatPercent.trim()) || 0) > 0;

  const [update, updateState] = useUpdateFoodMenuEntryMutation();
  const saving = updateState.isLoading;
  const unit = FOOD_UNIT_LABEL[entry.quantityUnit];
  const bulk = BULK_UNIT[entry.quantityUnit] ?? null;
  const bulkLabel = bulk?.label ?? unit;
  const perBulk = bulk?.perUnit ?? 1;

  async function submit() {
    const found: Partial<Record<Field, string>> = {};
    const baseValue = decimal(base);
    if (baseValue == null || baseValue <= 0) {
      found.base = "Enter how much each person gets.";
    } else if (tooPrecise(base)) {
      found.base = "At most three decimal places.";
    }

    const repeatValue = repeat.trim() ? decimal(repeat) : 0;
    if (repeatValue == null || repeatValue < 0) {
      found.repeat = "Enter a number, or leave it blank.";
    } else if (tooPrecise(repeat)) {
      found.repeat = "At most three decimal places.";
    }

    const percentValue = repeatPercent.trim() ? Number(repeatPercent) : 0;
    if (!Number.isInteger(percentValue) || percentValue < 0 || percentValue > 100) {
      found.repeatPercent = "A whole number from 0 to 100.";
    }

    // The two repeat fields are one setting in two boxes and neither means
    // anything alone: a serving size with nobody taking it cooks nothing extra,
    // and a percentage with no size has nothing to multiply. Filling one makes
    // the other required rather than silently doing nothing.
    if (repeatFilled && !percentFilled) {
      found.repeatPercent = "Say how many tenants take a second serving.";
    }
    if (percentFilled && !repeatFilled) {
      found.repeat = "Say how much a second serving is.";
    }

    const bufferTyped = buffer.trim() ? decimal(buffer) : 0;
    const bufferValue = bufferTyped == null ? null : bufferTyped * perBulk;
    if (bufferTyped == null || bufferTyped < 0) {
      found.buffer = "Enter a number, or leave it blank.";
    } else if (tooPrecise(buffer)) {
      found.buffer = "At most three decimal places.";
    }

    const batchTyped = batch.trim() ? decimal(batch) : null;
    const batchValue = batchTyped == null ? null : batchTyped * perBulk;
    if (batch.trim() && (batchTyped == null || batchTyped <= 0)) {
      found.batch = "Enter a batch size, or leave it blank.";
    } else if (tooPrecise(batch)) {
      found.batch = "At most three decimal places.";
    }

    if (!form.validate(found) || baseValue == null) {
      return;
    }

    const body: SaveFoodMenuEntryBody = {
      baseQuantityPerSubscriber: baseValue,
      batchSize: batchValue,
      dayOfWeek: day,
      expectedRepeatPercentage: percentValue,
      fixedBufferQuantity: bufferValue ?? 0,
      itemId: entry.itemId,
      mealType: entry.mealType,
      repeatQuantity: repeatValue ?? 0,
    };

    try {
      await update({ body, entryId: entry.id, propertyId }).unwrap();
      toast.ok("Menu item updated");
      onClose();
    } catch (error) {
      form.failFromServer(errorMessage(error));
    }
  }

  return (
    <SheetShell animated onClose={onClose} title={`${MEAL_LABEL[entry.mealType]} · ${DAY_LABEL[day]}`}>
      {/* The dish is fixed. Swapping one item for another is a removal and an
          addition, not an edit — and the picker that used to sit here was the
          only reason this sheet needed the whole catalogue loaded. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <FoodItemThumb imageUrl={entry.itemImageUrl} size={44} />
        <Text numberOfLines={2} style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 16 }}>
          {entry.itemName}
        </Text>
      </View>

      <FormInput
        error={form.errors.base}
        keyboardType="decimal-pad"
        label={unit ? `Per person (${unit})` : "Per person"}
        onChangeText={(next) => {
          setBase(next);
          form.clearField("base");
        }}
        placeholder="2"
        required
        value={base}
      />

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <AnimatedPressable
          accessibilityLabel="Fine-tune quantities"
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setTuning((current) => !current)}
          style={{ alignItems: "center", flexDirection: "row", gap: spacing.xxs }}
        >
          <MaterialCommunityIcons
            color={colors.primary}
            name={tuning ? "chevron-up" : "chevron-down"}
            size={17}
          />
          <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
            Fine-tune quantities
          </Text>
        </AnimatedPressable>
        {/* The explanation lives behind the mark rather than under the fields.
            Four paragraphs of it inline is more copy than the form it explains,
            and most entries never open this section at all. */}
        <AnimatedPressable
          accessibilityLabel="What these quantities do"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setExplaining(true)}
        >
          <MaterialCommunityIcons color={colors.muted} name="information-outline" size={17} />
        </AnimatedPressable>
      </View>

      {tuning ? (
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 }}>
            All four are optional. Leave them blank to cook exactly the per-person portion.
          </Text>
          <FormInput
            error={form.errors.repeat}
            keyboardType="decimal-pad"
            label={`Second serving (${unit})`}
            required={percentFilled}
            onChangeText={(next) => {
              setRepeat(next);
              form.clearField("repeat");
            }}
            placeholder="1"
            value={repeat}
          />
          <FormInput
            error={form.errors.repeatPercent}
            keyboardType="number-pad"
            label="How many tenants repeat (%)"
            required={repeatFilled}
            onChangeText={(next) => {
              setRepeatPercent(next);
              form.clearField("repeatPercent");
            }}
            placeholder="30"
            value={repeatPercent}
          />
          <FormInput
            error={form.errors.buffer}
            keyboardType="decimal-pad"
            label={`Fixed buffer (${bulkLabel})`}
            onChangeText={(next) => {
              setBuffer(next);
              form.clearField("buffer");
            }}
            placeholder={bulk ? "0.5" : "2"}
            value={buffer}
          />
          <FormInput
            error={form.errors.batch}
            keyboardType="decimal-pad"
            label={`Cooked in batches of (${bulkLabel})`}
            onChangeText={(next) => {
              setBatch(next);
              form.clearField("batch");
            }}
            placeholder={bulk ? "5" : "500"}
            value={batch}
          />
          {bulk ? (
            <Text style={{ color: colors.kicker, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 17 }}>
              Buffer and batch size are in {bulkLabel}. Everything else is in {unit}.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={saving || form.blocked}
          label={saving ? "Saving…" : entry ? "Save changes" : "Add to menu"}
          onPress={() => void submit()}
        />
      </View>

      {explaining ? (
        <ConfirmDialog
          acknowledgeOnly
          bullets={[
            `Second serving (${unit}) — how much extra one person gets when they come back for more.`,
            "How many tenants repeat (%) — out of everyone on this plan, how many take a second serving.",
            `Fixed buffer (${bulkLabel}) — extra cooked every time, no matter how many people are eating.`,
            `Cooked in batches of (${bulkLabel}) — the quantity per batch, if cooked in multiple batches.`,
          ]}
          confirmLabel="Got it"
          footnote="Leave all four blank and you cook exactly the per-person portion, times the number of people."
          message="Four optional numbers that adjust how much gets cooked."
          onCancel={() => setExplaining(false)}
          onConfirm={() => setExplaining(false)}
          title="Fine-tune quantities"
        />
      ) : null}

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}

/** A typed quantity, or null when it is not a number at all. */
function decimal(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Whether a typed quantity is finer than the backend accepts.
 *
 * <p>`FoodMenuEntry` normalises every quantity to three decimals and refuses
 * anything finer, so catching it here turns a server refusal into a line under
 * the field the reader can actually act on.
 */
function tooPrecise(text: string): boolean {
  const decimals = text.trim().split(".")[1];
  return decimals != null && decimals.length > 3;
}
