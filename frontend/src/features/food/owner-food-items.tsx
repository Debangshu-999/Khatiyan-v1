import { useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SlidersHorizontal, X } from "lucide-react-native";
import { Image, Modal, ScrollView, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { MarqueeText } from "@/components/marquee-text";
import { PickerOptionRow } from "@/components/picker-option-row";
import { OptionPicker, SingleOptionPicker } from "@/components/option-picker";
import { SearchField } from "@/components/search-field";
import { SheetShell } from "@/components/sheet-shell";
import { StatusPill } from "@/components/status-pill";
import { FoodItemsSkeleton } from "@/components/skeletons";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, FormInput } from "@/features/owner/owner-ui";
import {
  FoodItemThumb,
  FoodStatusChip,
  MEAL_LABEL,
  MEAL_ORDER,
  NoDescription,
  foodIcon,
} from "@/features/food/food-ui";
import { AddPhotoTarget } from "@/features/property/photo-list";
import { uploadAsset } from "@/features/uploads/upload-asset";
import type { MealType } from "@/store/services/property-api";
import { DIALOG_MAX_WIDTH, radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import {
  FOOD_UNIT_LABEL,
  FOOD_UNIT_NAME,
  useCreateFoodItemMutation,
  useDeactivateFoodItemMutation,
  useDeleteFoodItemMutation,
  useReactivateFoodItemMutation,
  useUpdateFoodItemMutation,
  type FoodItem,
  type FoodQuantityUnit,
} from "@/store/services/food-api";

const UNITS: FoodQuantityUnit[] = ["PIECE", "SERVING", "GRAM", "KILOGRAM", "MILLILITRE", "LITRE"];

/**
 * The property's catalogue of dishes.
 *
 * <p>A flat, searchable list with active dishes first and retired dishes kept
 * below them. Retirement removes an item from menu pickers without erasing its
 * catalogue history.
 */
export function FoodItemsTab({
  availableMeals,
  createRequest = 0,
  items,
  loading,
  propertyId,
  readOnly,
}: {
  /**
   * The meals this property actually serves.
   *
   * <p>Tagging is offered against these, not against every MealType. Letting an
   * owner tag a dish for a meal their property does not serve produces a tag
   * that can never match anything — and the backfill that seeded existing items
   * with all four meals is exactly why rows were advertising evening snacks at
   * properties that serve none.
   */
  availableMeals: MealType[];
  createRequest?: number;
  items: FoodItem[];
  loading: boolean;
  propertyId: string;
  readOnly: boolean;
}) {
  const { colors, fonts } = useTheme();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ItemStatusFilter>("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewing, setViewing] = useState<FoodItem | null>(null);
  const [editing, setEditing] = useState<FoodItem | "new" | null>(null);
  const [retiring, setRetiring] = useState<FoodItem | null>(null);
  const [removing, setRemoving] = useState<FoodItem | null>(null);
  const [deactivate, deactivateState] = useDeactivateFoodItemMutation();
  const [reactivate] = useReactivateFoodItemMutation();
  const [remove, removeState] = useDeleteFoodItemMutation();
  const opErrors = useFormErrors<never>();
  const toast = useToast();

  // Only a FRESH press opens the sheet. This tab unmounts when another one is
  // shown, so on the way back the effect ran again against a counter that was
  // still non-zero from the last press — and the add-item sheet opened by
  // itself every time the tab was visited. Remembering the value seen at mount
  // makes the effect react to the increment rather than to the number.
  const handledCreateRequest = useRef(createRequest);
  useEffect(() => {
    if (createRequest > handledCreateRequest.current) {
      handledCreateRequest.current = createRequest;
      setEditing("new");
    }
  }, [createRequest]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = items.filter((item) => {
      if (status === "ACTIVE" && !item.active) {
        return false;
      }
      if (status === "INACTIVE" && item.active) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.description ?? "").toLowerCase().includes(needle)
      );
    });
    return [...matching].sort(
      (left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name),
    );
  }, [items, search, status]);

  const counts = useMemo(
    () => ({
      ACTIVE: items.filter((item) => item.active).length,
      ALL: items.length,
      INACTIVE: items.filter((item) => !item.active).length,
    }),
    [items],
  );

  async function retire(item: FoodItem) {
    setRetiring(null);
    try {
      await deactivate({ itemId: item.id, propertyId }).unwrap();
      toast.ok(`${item.name} retired`);
    } catch (error) {
      // The common refusal is "still on an active menu", which names the
      // profiles to clear first. That is the whole value of the message, so it
      // gets a modal rather than a toast that slides away mid-sentence.
      opErrors.failFromServer(errorMessage(error));
    }
  }

  async function bringBack(item: FoodItem) {
    try {
      await reactivate({ itemId: item.id, propertyId }).unwrap();
      toast.ok(`${item.name} is back in service`);
    } catch (error) {
      // Usually "a food item with this name already exists": retiring frees the
      // name, so something else may have taken it. That names the fix, so it
      // gets a modal rather than a toast that slides away.
      opErrors.failFromServer(errorMessage(error));
    }
  }

  async function removeForGood(item: FoodItem) {
    setRemoving(null);
    try {
      await remove({ itemId: item.id, propertyId }).unwrap();
      toast.ok(`${item.name} removed`);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {items.length > 0 ? (
        <SearchField
          onChangeText={setSearch}
          placeholder="Search food items"
          trailing={
            /* A bare glyph, not a button. `IconButton` is a 46pt control with
               its own border — inside the search field it read as a second
               control bolted onto the box rather than part of it. Tinted blue
               while a filter is on, which is the only cue that the list being
               shown is not the whole list. */
            <AnimatedPressable
              accessibilityLabel="Filter food items by status"
              accessibilityRole="button"
              accessibilityState={{ selected: status !== "ALL" }}
              hitSlop={10}
              onPress={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal
                color={status === "ALL" ? colors.muted : colors.primary}
                size={18}
                strokeWidth={2.2}
              />
            </AnimatedPressable>
          }
          value={search}
        />
      ) : null}

      {loading && items.length === 0 ? <FoodItemsSkeleton /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          artwork={require("../../../assets/workspace/food-module-no-items.png")}
          description="Add what your kitchen cooks, and the unit you measure each one in."
          title="No food items yet"
        />
      ) : null}

      {items.length > 0 && visible.length === 0 ? (
        <Text
          style={{
            color: colors.muted,
            fontFamily: fonts.sans,
            fontSize: 13,
            paddingVertical: spacing.lg,
            textAlign: "center",
          }}
        >
          {search.trim()
            ? `Nothing matches “${search.trim()}”`
            : status === "ACTIVE"
              ? "No items are in service."
              : "No items have been retired."}
        </Text>
      ) : null}

      {visible.map((item) => (
        <FoodItemRow
          availableMeals={availableMeals}
          item={item}
          onOpenDetail={() => setViewing(item)}
          key={item.id}
          onDelete={() => setRemoving(item)}
          onEdit={() => setEditing(item)}
          onReactivate={() => void bringBack(item)}
          onRetire={() => setRetiring(item)}
          readOnly={readOnly}
        />
      ))}

      {editing ? (
        <FoodItemSheet
          availableMeals={availableMeals}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          propertyId={propertyId}
        />
      ) : null}

      {retiring ? (
        <ConfirmDialog
          bullets={[
            "It stays in the catalogue as inactive.",
            "It no longer appears when adding food to a weekly menu.",
          ]}
          confirmLabel={deactivateState.isLoading ? "Retiring…" : "Retire item"}
          destructive
          footnote="Menus that already use it must be cleared first, and you will be told which."
          message={`${retiring.name} will be retired from this property's food catalogue.`}
          onCancel={() => setRetiring(null)}
          onConfirm={() => void retire(retiring)}
          title="Retire this item?"
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          bullets={[
            "It disappears from this list for good.",
            "Past menus and forecasts that used it are untouched.",
          ]}
          confirmLabel={removeState.isLoading ? "Removing…" : "Remove item"}
          destructive
          footnote="You cannot undo this from the app. Add it again as a new item if you need it back."
          message={`${removing.name} will be removed from your food items.`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void removeForGood(removing)}
          title="Remove this item?"
        />
      ) : null}

      {filtersOpen ? (
        <ItemStatusFilterDialog
          counts={counts}
          onClose={() => setFiltersOpen(false)}
          onSelect={setStatus}
          value={status}
        />
      ) : null}

      {viewing ? <FoodItemDetailDialog item={viewing} onClose={() => setViewing(null)} /> : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </View>
  );
}

type ItemStatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const ITEM_STATUS_FILTERS: { label: string; value: ItemStatusFilter }[] = [
  { label: "All items", value: "ALL" },
  { label: "In service", value: "ACTIVE" },
  { label: "Retired", value: "INACTIVE" },
];

/**
 * Narrows the catalogue to what is in service, or what has been retired.
 *
 * <p>The app's picker dialog, the same one the notice board filters with: a
 * centred card of rows, dismissed by the scrim rather than by a Cancel taking
 * up a fourth row.
 */
function ItemStatusFilterDialog({
  counts,
  onClose,
  onSelect,
  value,
}: {
  counts: Record<ItemStatusFilter, number>;
  onClose: () => void;
  onSelect: (value: ItemStatusFilter) => void;
  value: ItemStatusFilter;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <AnimatedPressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
        tapLockMs={0}
      >
        {/* Its own pressable so a tap on the card does not reach the scrim
            behind it and close the picker mid-decision. */}
        <AnimatedPressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 14,
            overflow: "hidden",
            width: "100%",
          }}
          tapLockMs={0}
        >
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.display,
              fontSize: 19,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            Filter by status
          </Text>
          <View style={{ paddingBottom: spacing.xs, paddingHorizontal: spacing.lg }}>
            {ITEM_STATUS_FILTERS.map((option) => (
              <PickerOptionRow
                key={option.value}
                label={option.label}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                selected={option.value === value}
                subtitle={counts[option.value] === 1 ? "1 item" : `${counts[option.value]} items`}
              />
            ))}
          </View>
        </AnimatedPressable>
      </AnimatedPressable>
    </Modal>
  );
}

function FoodItemRow({
  availableMeals,
  item,
  onDelete,
  onEdit,
  onOpenDetail,
  onReactivate,
  onRetire,
  readOnly,
}: {
  availableMeals: MealType[];
  item: FoodItem;
  onDelete: () => void;
  onEdit: () => void;
  onOpenDetail: () => void;
  onReactivate: () => void;
  onRetire: () => void;
  readOnly: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  // Only meals this property actually serves. A tag for a meal it does not
  // offer can never match anything, so printing it just raises the question of
  // where it came from.
  const tags = MEAL_ORDER.filter(
    (meal) => availableMeals.includes(meal) && (item.mealTags ?? []).includes(meal),
  );

  return (
    <View
      style={{
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.sm + 1,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <FoodItemThumb imageUrl={item.imageUrl} size={96} />
        {/* Top-aligned, not centred. Centring left the name floating in the
            middle of the thumbnail with dead space above it. */}
        <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
          {/* Name and status share the first row so the name starts level with
              the top of the thumbnail. On its own line the chip pushed the name
              down and left the image standing a line taller than everything
              beside it. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            {/* Scrolls back and forth when it overflows rather than
                ellipsising. A dish whose name is cut off is one the owner
                cannot tell apart from the next — and the app marquees every
                overflowing label it has. Honours reduce-motion on its own.
                flex with minWidth 0 is what gives the marquee a box to measure
                against instead of letting it push the chip off the row. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <MarqueeText style={[type.bodyStrong, { color: colors.ink }]}>{item.name}</MarqueeText>
            </View>
            <FoodStatusChip
              icon={item.active ? "check-circle" : "pause-circle-outline"}
              label={item.active ? "Active" : "Inactive"}
              tone={item.active ? "success" : "neutral"}
            />
          </View>
          {/* A few px of air under the name. The description sat tight against
              it and the two read as one wrapped line. */}
          <View style={{ marginTop: spacing.xxs }}>
            {item.description ? (
              <ClampedDescription lines={3} onReadMore={onOpenDetail} text={item.description} />
            ) : (
              <NoDescription />
            )}
          </View>
        </View>
      </View>

      {/* Two facts, two fills, on their own full-width row starting under the
          image. Beside the text they were competing with the description for a
          narrow column; down here the description gets the width and these get
          a line of their own.

          One row, never wrapping: the meal list marquees when it outgrows its
          share rather than pushing the unit onto a second line. */}
      <View style={{ flexDirection: "row", gap: spacing.xxs }}>
        <FactFill text={`Measured in ${FOOD_UNIT_LABEL[item.quantityUnit]}`} />
        <FactFill
          grow
          text={tags.length > 0 ? tags.map((meal) => MEAL_LABEL[meal]).join(" · ") : "Not on any meal"}
        />
      </View>
      {readOnly ? null : item.active ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton compact icon={foodIcon("pencil-outline")} label="Edit" onPress={onEdit} variant="secondary" />
          <ActionButton compact icon={foodIcon("archive-arrow-down-outline")} label="Retire" onPress={onRetire} variant="danger" />
        </View>
      ) : (
        /* A retired item has two ways out: back into service, or off the list.
           Remove is the destructive one and sits second, so the recoverable
           action is the one under the thumb. */
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton
            compact
            icon={foodIcon("backup-restore")}
            label="Reactivate"
            onPress={onReactivate}
            variant="secondary"
          />
          <ActionButton compact icon={foodIcon("trash-can-outline")} label="Remove" onPress={onDelete} variant="danger" />
        </View>
      )}
    </View>
  );
}

const DESCRIPTION_LINE_HEIGHT = 18;

/**
 * A description clamped to one line, with a way to read the rest.
 *
 * <p>Whether it overflows is MEASURED rather than guessed from length: the same
 * sentence fits on a wide phone and wraps on a narrow one, so a character count
 * would show "read more" on text that is fully visible and hide it on text that
 * is not.
 *
 * <p>The measurement is a second copy of the text, laid out at the same width
 * but unclamped and invisible. `onTextLayout` would be cheaper, but it reports
 * the lines AFTER truncation on iOS and does not fire at all on web — and this
 * screen is used on both.
 */
function ClampedDescription({
  lines,
  onReadMore,
  text,
}: {
  /** How many lines are shown before the rest is folded behind "read more". */
  lines: number;
  onReadMore: () => void;
  text: string;
}) {
  const { colors, fonts } = useTheme();
  const [overflows, setOverflows] = useState(false);

  const style = {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: DESCRIPTION_LINE_HEIGHT,
  } as const;

  return (
    <View>
      <Text numberOfLines={lines} style={style}>
        {text}
      </Text>

      {/* Zero opacity and absolutely positioned, so it measures without taking
          part in the layout. Half a line of tolerance absorbs the rounding
          different platforms apply to text height. */}
      <Text
        aria-hidden
        onLayout={(event) =>
          setOverflows(event.nativeEvent.layout.height > DESCRIPTION_LINE_HEIGHT * (lines + 0.5))
        }
        pointerEvents="none"
        style={[style, { left: 0, opacity: 0, position: "absolute", right: 0, top: 0 }]}
      >
        {text}
      </Text>

      {overflows ? (
        <AnimatedPressable
          accessibilityLabel="Read the full description"
          accessibilityRole="button"
          hitSlop={6}
          onPress={onReadMore}
          style={{ alignSelf: "flex-start" }}
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 11.5 }}>
            …read more
          </Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

/**
 * The whole dish: its picture, its name and the description in full.
 *
 * <p>Read-only. Editing is a separate act behind its own button, and offering
 * a Save here would mean two places that can change the same item.
 */
function FoodItemDetailDialog({ item, onClose }: { item: FoodItem; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
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
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, padding: spacing.lg }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>{item.name}</Text>
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

          <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg }}>
            {item.imageUrl ? (
              <Image
                resizeMode="cover"
                source={{ uri: item.imageUrl }}
                style={{ borderRadius: radii.card, height: 180, width: "100%" }}
              />
            ) : null}
            <Text style={[type.body, { color: colors.inkSoft }]}>{item.description}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * One grey-filled fact on an item row: its unit, or the meals it is on.
 *
 * <p>`grow` takes the leftover width and marquees what does not fit, so the two
 * fills stay on one line at any phone width instead of the longer one wrapping
 * underneath.
 */
function FactFill({ grow, text }: { grow?: boolean; text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderRadius: radii.sm,
        flexShrink: grow ? 1 : 0,
        minWidth: 0,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs + 1,
      }}
    >
      <MarqueeText style={{ color: colors.neutralText, fontFamily: fonts.sansMedium, fontSize: 11.5 }}>
        {text}
      </MarqueeText>
    </View>
  );
}

type Field = "name" | "unit" | "mealTags";

/**
 * Create or rename a dish.
 *
 * <p>The unit is deliberately editable after the fact. Changing grams to
 * kilograms does not rescale the quantities already on a menu, so the sheet
 * says so rather than blocking the change — an owner who set the wrong unit
 * needs a way out, and refusing them one leaves a dead item in the catalogue.
 */
function FoodItemSheet({
  availableMeals,
  item,
  onClose,
  propertyId,
}: {
  availableMeals: MealType[];
  item: FoodItem | null;
  onClose: () => void;
  propertyId: string;
}) {
  const { colors, fonts } = useTheme();
  const toast = useToast();
  const form = useFormErrors<Field>();
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [unit, setUnit] = useState<FoodQuantityUnit | null>(item?.quantityUnit ?? null);
  // Seeded from what the property serves, so a tag inherited from the backfill
  // for a meal it does not offer is dropped the first time the item is saved.
  const [mealTags, setMealTags] = useState<MealType[]>(
    (item?.mealTags ?? []).filter((meal) => availableMeals.includes(meal)),
  );
  const [image, setImage] = useState<{ publicId: string | null; url: string | null }>({
    publicId: item?.imagePublicId ?? null,
    url: item?.imageUrl ?? null,
  });
  const [uploading, setUploading] = useState(false);
  const [pickingSource, setPickingSource] = useState(false);
  const [create, createState] = useCreateFoodItemMutation();
  const [update, updateState] = useUpdateFoodItemMutation();
  const saving = createState.isLoading || updateState.isLoading;

  /**
   * Takes or picks a photo, once the owner has said which.
   *
   * <p>Asked rather than assumed. Going straight to the gallery means an owner
   * standing over the dish has to photograph it, leave, and come back — and
   * each path needs a different permission, so guessing wrong also throws the
   * wrong permission prompt at them.
   */
  async function pickImage(source: "camera" | "library") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      form.failFromServer(
        source === "camera"
          ? "Allow camera access to photograph this dish."
          : "Allow photo library access to add a picture of this dish.",
      );
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadAsset(
        {
          mimeType: asset.mimeType,
          name: asset.fileName ?? (name || "Food item"),
          size: asset.fileSize,
          uri: asset.uri,
        },
        "FOOD_ITEM_IMAGE",
      );
      setImage({ publicId: uploaded.publicId, url: uploaded.url });
    } catch {
      form.failFromServer("Could not upload that picture. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const trimmed = name.trim();
    const found: Partial<Record<Field, string>> = {};
    if (!trimmed) {
      found.name = "Name this dish.";
    }
    if (!unit) {
      found.unit = "Choose how you measure it.";
    }
    if (mealTags.length === 0) {
      found.mealTags = "Pick at least one meal.";
    }
    if (!form.validate(found) || !unit) {
      return;
    }

    const body = {
      description: description.trim() || null,
      imagePublicId: image.publicId,
      imageUrl: image.url,
      mealTags,
      name: trimmed,
      quantityUnit: unit,
    };

    try {
      if (item) {
        await update({ body, itemId: item.id, propertyId }).unwrap();
        toast.ok(`${trimmed} updated`);
      } else {
        await create({ body, propertyId }).unwrap();
        toast.ok(`${trimmed} added`);
      }
      onClose();
    } catch (error) {
      form.failFromServer(errorMessage(error));
    }
  }

  return (
    <SheetShell animated onClose={onClose} title={item ? "Edit food item" : "Add food item"}>
      <FormInput
        error={form.errors.name}
        label="Name"
        maxLength={100}
        onChangeText={(next) => {
          setName(next);
          form.clearField("name");
        }}
        placeholder="Paneer butter masala"
        required
        value={name}
      />
      <FormInput
        label="Description"
        maxLength={500}
        multiline
        onChangeText={setDescription}
        placeholder="Cottage cheese in a tomato gravy"
        value={description}
      />
      <SingleOptionPicker<FoodQuantityUnit>
        emptyLabel="Choose a unit"
        error={form.errors.unit}
        label="Measured in"
        onChange={(next) => {
          setUnit(next);
          form.clearField("unit");
        }}
        options={UNITS.map((value) => ({ label: FOOD_UNIT_NAME[value], value }))}
        required
        showIcon={false}
        title="How do you measure this?"
        value={unit}
      />
      {/* Multi-select: roti is dinner and breakfast. This is what the weekly
          menu's picker filters on, so an untagged item would be offered for no
          meal at all — which is why the form refuses to save without one. */}
      <OptionPicker<MealType>
        emptyLabel="Choose meals"
        error={form.errors.mealTags}
        label="Served at"
        onChange={(next) => {
          setMealTags(next);
          form.clearField("mealTags");
        }}
        options={MEAL_ORDER.filter((meal) => availableMeals.includes(meal)).map((value) => ({
          label: MEAL_LABEL[value],
          value,
        }))}
        required
        showIcon={false}
        title="Which meals is this served at?"
        value={mealTags}
      />
      {item && unit && unit !== item.quantityUnit ? (
        <Text style={{ color: colors.warningText, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 }}>
          Quantities already on a menu keep their numbers. Check them after saving.
        </Text>
      ) : null}

      {!image.url ? (
        <AddPhotoTarget
          busy={uploading}
          hint="Choose a clear picture from your gallery"
          label={uploading ? "Uploading food photo…" : "Add food photo"}
          onPress={() => setPickingSource(true)}
        />
      ) : (
        <View style={{ alignItems: "center", gap: spacing.md }}>
          <FoodItemThumb imageUrl={image.url} size={112} />
          <View style={{ flexDirection: "row", gap: spacing.xs, width: "100%" }}>
          <ActionButton
            compact
            disabled={uploading}
            icon={foodIcon("camera-outline")}
            label={uploading ? "Uploading…" : "Replace photo"}
            onPress={() => setPickingSource(true)}
            variant="secondary"
          />
          <ActionButton
            compact
            disabled={uploading}
            label="Remove"
            onPress={() => setImage({ publicId: null, url: null })}
            variant="danger"
          />
          </View>
        </View>
      )}

      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={saving || uploading || form.blocked}
          label={saving ? "Saving…" : item ? "Save changes" : "Add food item"}
          onPress={() => void submit()}
        />
      </View>

      {pickingSource ? (
        <SheetShell animated onClose={() => setPickingSource(false)} title="Add a photo">
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
            A picture helps tenants recognise the dish on their menu.
          </Text>
          <PhotoSourceRow
            description="Photograph the dish as it is served."
            icon="camera-outline"
            label="Take a photo"
            onPress={() => {
              setPickingSource(false);
              void pickImage("camera");
            }}
          />
          <PhotoSourceRow
            description="Pick one you have already taken."
            icon="image-multiple-outline"
            label="Choose from gallery"
            onPress={() => {
              setPickingSource(false);
              void pickImage("library");
            }}
          />
        </SheetShell>
      ) : null}

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}

/**
 * One way of getting a photo, as a full-width row.
 *
 * <p>Rows rather than two buttons side by side: each option earns a line of
 * explanation, and "Take a photo" beside "Choose from gallery" at button width
 * truncates on a narrow phone.
 */
function PhotoSourceRow({
  description,
  icon,
  label,
  onPress,
}: {
  description: string;
  icon: Parameters<typeof foodIcon>[0];
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.borderStrong,
          borderRadius: radii.pill,
          borderWidth: 1,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <MaterialCommunityIcons color={colors.ink} name={icon} size={17} />
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>{label}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5 }}>{description}</Text>
      </View>
      <MaterialCommunityIcons color={colors.kicker} name="chevron-right" size={20} />
    </AnimatedPressable>
  );
}
