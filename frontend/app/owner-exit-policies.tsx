import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DoorOpen, Info, Pencil, Plus } from "lucide-react-native";
import { DeleteIcon as Trash2 } from "@/components/delete-icon";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { OwnerRulesEditorSkeleton } from "@/components/skeletons/owner";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { isUnchanged } from "@/features/forms/unchanged";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, FormInput, NoticeBar, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  useGetPropertyExitPoliciesQuery,
  useListMyPropertiesQuery,
  useListPropertyRoomsQuery,
  useUpdatePropertyExitPoliciesMutation,
  type DamageCategory,
  type PropertyDamageCharge,
} from "@/store/services/property-api";
import { ChevronDisc } from "@/components/chevron-disc";
import { NotchedInput } from "@/components/notched-input";
import { SheetShell } from "@/components/sheet-shell";
import { roomDamageItems } from "@/features/property/damage-catalogue";
import { DamageLevelPill } from "@/features/tenancy/damage-level";
import { ItemIcon } from "@/features/property/item-icon";

type LevelWords = { d1: string; d2: string; d3: string };
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Property-level exit policies: the damage-charge schedule and move-out
// checklist. These apply to EVERY monthly tenancy at deposit settlement (with or
// without an agreement) and are read into agreements by the compliance module.
export default function OwnerExitPoliciesScreen() {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  // Exit policies and the tenancy agreement share one permission: both are the
  // rules a stay runs under. View-only keeps the screen fully legible and
  // disables the controls rather than removing them — on a settings screen the
  // shape of what is configurable is itself the information.
  const { canManage } = usePropertyPermissions(propertyId);
  const readOnly = !canManage("TENANCY_RULES");
  const policiesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const [savePolicies, saveState] = useUpdatePropertyExitPoliciesMutation();
  // Every room's amenities and the bathroom type decide what the damage list holds by itself (2026-10-29).
  const roomsQuery = useListPropertyRoomsQuery(propertyId, { skip: !propertyId });
  const myPropertiesQuery = useListMyPropertiesQuery();
  const bathroomType = myPropertiesQuery.data?.find((item) => item.id === propertyId)?.bathroomType;

  // Editable draft, seeded from the server copy once it arrives.
  const [damageCharges, setDamageCharges] = useState<PropertyDamageCharge[] | null>(null);
  const [checklist, setChecklist] = useState<string[] | null>(null);
  // What D1, D2 and D3 mean here, the same for every item (2026-10-29).
  const [levelWords, setLevelWords] = useState<LevelWords | null>(null);
  // The premature-exit policy is NOT edited here any more. It moved to the
  // agreement screen, under the indefinite term it qualifies — the two halves of
  // "how does this tenancy end" were split across two screens, so neither read
  // as a whole rule.
  useEffect(() => {
    if (policiesQuery.data && damageCharges === null && checklist === null) {
      setDamageCharges(policiesQuery.data.damageCharges);
      setChecklist(policiesQuery.data.exitChecklist);
      setLevelWords(wordsOf(policiesQuery.data.damageLevels));
    }
  }, [checklist, damageCharges, policiesQuery.data]);

  // Server refusal — no field owns it, so it takes a modal.
  const opErrors = useFormErrors<never>();

  async function save() {
    if (!propertyId || damageCharges === null || checklist === null || levelWords === null) {
      return;
    }
    if (!levelWords.d1.trim() || !levelWords.d2.trim() || !levelWords.d3.trim()) {
      opErrors.failFromServer("Describe what each damage level means.");
      return;
    }

    // Compared against the server copy, so returning a field to its original
    // value counts as no change rather than arming the save forever.
    const saved = policiesQuery.data;
    if (
      saved &&
      isUnchanged(
        {
          checklist: saved.exitChecklist,
          damages: saved.damageCharges.map(damageKey),
          levels: Object.values(wordsOf(saved.damageLevels)),
        },
        {
          checklist,
          damages: damageCharges.map(damageKey),
          levels: [levelWords.d1.trim(), levelWords.d2.trim(), levelWords.d3.trim()],
        },
      )
    ) {
      toast.warning("No changes have been made.");
      return;
    }

    try {
      await savePolicies({
        propertyId,
        payload: {
          damageCharges,
          damageLevels: { d1: levelWords.d1.trim(), d2: levelWords.d2.trim(), d3: levelWords.d3.trim() },
          exitChecklist: checklist,
          permittedDeductions: policiesQuery.data?.permittedDeductions ?? [],
        },
        // The property as loaded (2026-09-29): the policies live on it.
        version: policiesQuery.data?.version ?? 0,
      }).unwrap();
      toast.success("Item catalogue saved.");
    } catch (caught) {
      opErrors.failFromServer(errorMessage(caught));
    }
  }

  const ready = Boolean(property) && !policiesQuery.isLoading && damageCharges !== null && checklist !== null && levelWords !== null;

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        bottomPaddingCovered={ready}
        safeAreaEdges={["top"]}
        contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE + insets.bottom }}
      >
        <ScreenHeader
          badge={readOnly ? <ViewOnlyChip /> : null}
          italicTail="catalogue & Damages."
          title="Item"
          subtitle={
            property
              ? `Everything a room at ${property.name} can have, and what damage to it costs.`
              : "Select a property from Home to manage its item catalogue."
          }
        />

        {!property ? (
          <EmptyState
            icon={DoorOpen}
            title="No property selected"
            description="Choose an active property from Home before managing its exit policies."
          />
        ) : policiesQuery.isLoading || damageCharges === null || checklist === null || levelWords === null ? (
          <OwnerRulesEditorSkeleton />
        ) : (
          <>
            {/* The same four levels for every item, in the property's own words (P1.9.a, 2026-10-29). */}
            <Section title="Damage levels">
              <Card>
                <DamageLevelsEditor onChange={setLevelWords} readOnly={readOnly} words={levelWords} />
              </Card>
            </Section>

            <Section title="Item catalogue & Damages">
              <Text style={[type.description, { color: colors.muted }]}>
                Each item is priced at one to three damage levels. NA costs nothing.
              </Text>
              <DamageChargesEditor
                attached={bathroomType === "ATTACHED"}
                charges={damageCharges}
                onChange={setDamageCharges}
                readOnly={readOnly}
                roomItems={roomDamageItems(roomsQuery.data ?? [], bathroomType)}
              />
            </Section>

            {/* The move-out checklist is each tenancy's own now, set at onboarding (user, 2026-10-29). */}
          </>
        )}

      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
      </ScreenScrollView>

      {ready ? (
        <PinnedFooter>
          <ActionButton
            disabled={readOnly || saveState.isLoading}
            label={saveState.isLoading ? "Saving…" : readOnly ? "View only" : "Save item catalogue"}
            onPress={() => void save()}
          />
        </PinnedFooter>
      ) : null}
    </View>
  );
}

const CATEGORY_HEADINGS: Record<DamageCategory, { title: string; tail: string }> = {
  AMENITY: { tail: "items", title: "Room" },
  BATHROOM: { tail: "bathroom", title: "Attached" },
  COMMON_TOILET: { tail: "toilet", title: "Common" },
  ROOM: { tail: "items", title: "Room" },
};

type PriceDraft = { d1: string; d2: string; d3: string };
type CatalogueDeletion =
  | { kind: "item"; name: string; category: DamageCategory }
  | { kind: "level"; name: string; category: DamageCategory; index: number };

/** An item's priced levels in order, D1 first: one to three of them. */
function levelsOf(charge: PropertyDamageCharge): number[] {
  // None at all: on the list, not priced yet.
  return [charge.d1Paise, charge.d2Paise, charge.d3Paise].filter((price): price is number => price != null);
}

/** Prices in order back onto D1 to D3; the flat amount is the highest. */
function withLevels(charge: { name: string; category: DamageCategory }, levels: number[]): PropertyDamageCharge {
  return {
    category: charge.category,
    chargePaise: levels[levels.length - 1] ?? 0,
    d1Paise: levels[0] ?? null,
    d2Paise: levels[1] ?? null,
    d3Paise: levels[2] ?? null,
    name: charge.name,
  };
}

function catalogueDeletionMessage(target: CatalogueDeletion, charges: PropertyDamageCharge[]) {
  if (target.kind === "item") {
    const { title, tail } = CATEGORY_HEADINGS[target.category];
    return `Remove ${target.name} from the ${title.toLowerCase()} ${tail} catalogue?${target.category === "COMMON_TOILET" ? "" : " Its damage prices will also be removed."}`;
  }
  const charge = charges.find((entry) => entry.name.toLowerCase() === target.name.toLowerCase());
  const count = charge ? levelsOf(charge).length : 0;
  const consequence = count === 1
    ? "The item will stay in the catalogue without damage prices."
    : target.index < count - 1
      ? "Higher damage levels will move down to fill the gap. The item will stay in the catalogue."
      : "The item and its other damage prices will stay in the catalogue.";
  return `Remove the D${target.index + 1} price for ${target.name}? ${consequence}`;
}

/**
 * The damage list by category, as the move-in checklist has it (user,
 * 2026-10-29): the rooms' amenities, an attached bathroom's things, the room's
 * items. Every amenity across the rooms is on it by itself, priced or not.
 * Each item opens to its levels, each with Edit and Delete; deleting a level
 * moves the ones above it down. Each category adds its own.
 */
function DamageChargesEditor({
  attached,
  charges,
  onChange,
  readOnly,
  roomItems,
}: {
  attached: boolean;
  charges: PropertyDamageCharge[];
  onChange: (next: PropertyDamageCharge[]) => void;
  readOnly: boolean;
  roomItems: { name: string; category: DamageCategory }[];
}) {
  const { colors, fonts, type } = useTheme();
  const [sheet, setSheet] = useState<{ category: DamageCategory; name: string | null } | null>(null);
  // Every removal is staged until its own confirmation is accepted.
  const [deleting, setDeleting] = useState<CatalogueDeletion | null>(null);
  const fromRooms = new Set(roomItems.map((item) => item.name.toLowerCase()));

  const stored = new Set(charges.map((charge) => charge.name.toLowerCase()));
  const entries: { name: string; category: DamageCategory; charge: PropertyDamageCharge | null }[] = [
    // An old amenity item is a Room item now (2026-10-29).
    ...charges.map((charge) => ({ category: (charge.category === "AMENITY" || !charge.category ? "ROOM" : charge.category) as DamageCategory, charge, name: charge.name })),
    ...roomItems
      .filter((item) => !stored.has(item.name.toLowerCase()))
      .map((item) => ({ ...item, charge: null })),
  ];
  const hasBathroom = attached || entries.some((entry) => entry.category === "BATHROOM");
  // Common bathrooms show where the bathroom would be, as the move-in checklist does (user, 2026-10-29).
  // The one list of what a room can have (user, 2026-10-29): Room items, then the
  // attached bathroom's, or the common toilet's list, which is never priced.
  const categories: DamageCategory[] = ["ROOM", hasBathroom ? "BATHROOM" : "COMMON_TOILET"];

  // An item stays on the list with no levels left, unpriced: only its bin takes it
  // off. A room's own amenity with no price simply goes back to being the room's.
  function save(name: string, category: DamageCategory, levels: number[]) {
    const kept = charges.filter((charge) => charge.name.toLowerCase() !== name.toLowerCase());
    const amenityOnly = levels.length === 0 && fromRooms.has(name.toLowerCase());
    onChange(amenityOnly ? kept : [...kept, withLevels({ category, name }, levels)]);
  }

  return (
    <View style={{ gap: spacing.md }}>
      {categories.map((category) => {
        // A common toilet's things: listed, added and deleted, never priced.
        if (category === "COMMON_TOILET") {
          const things = entries.filter((entry) => entry.category === "COMMON_TOILET");
          return (
            <CategoryCard
              key={category}
              onAdd={readOnly ? undefined : () => setSheet({ category, name: null })}
              summary={`${things.length} item${things.length === 1 ? "" : "s"}, not priced`}
              tail="toilet"
              title="Common"
            >
              {things.map((entry, index) => (
                <View
                  key={entry.name}
                  style={{ alignItems: "center", borderTopColor: colors.border, borderTopWidth: index === 0 ? 0 : 1, flexDirection: "row", gap: spacing.sm, paddingTop: index === 0 ? 0 : spacing.sm }}
                >
                  <ItemIcon color={colors.inkSoft} name={entry.name} size={20} />
                  <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>{entry.name}</Text>
                  {readOnly ? null : (
                    <AnimatedPressable accessibilityLabel={`Delete ${entry.name}`} accessibilityRole="button" hitSlop={10} onPress={() => setDeleting({ kind: "item", name: entry.name, category })}>
                      <Trash2 color={colors.danger} size={17} strokeWidth={2.2} />
                    </AnimatedPressable>
                  )}
                </View>
              ))}
              <View style={{ alignItems: "flex-start", borderTopColor: colors.border, borderTopWidth: things.length > 0 ? 1 : 0, flexDirection: "row", gap: spacing.sm, paddingTop: things.length > 0 ? spacing.sm : 0 }}>
                <Info color={colors.muted} size={18} />
                <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>Shared by everyone here, so nothing in it is charged to one tenant.</Text>
              </View>
            </CategoryCard>
          );
        }
        const list = entries.filter((entry) => entry.category === category);
        const priced = list.filter((entry) => entry.charge?.d1Paise != null).length;
        const { tail, title } = CATEGORY_HEADINGS[category];
        return (
          <CategoryCard
            key={category}
            onAdd={readOnly ? undefined : () => setSheet({ category, name: null })}
            summary={`${list.length} item${list.length === 1 ? "" : "s"}, ${priced} priced`}
            tail={tail}
            title={title}
          >
            {list.length === 0 ? (
              <Text style={[type.caption, { color: colors.muted }]}>Nothing here yet. Use Add for anything in it.</Text>
            ) : null}
            {list.map((entry, index) => (
              <DamageItemRow
                charge={entry.charge}
                first={index === 0}
                key={entry.name}
                name={entry.name}
                onDeleteLevel={(at) => {
                  if (!entry.charge) return;
                  setDeleting({ kind: "level", name: entry.name, category, index: at });
                }}
                onDelete={!fromRooms.has(entry.name.toLowerCase()) ? () => setDeleting({ kind: "item", name: entry.name, category }) : undefined}
                onEdit={() => setSheet({ category, name: entry.name })}
                readOnly={readOnly}
              />
            ))}
          </CategoryCard>
        );
      })}

      {deleting ? (
        <ConfirmDialog
          confirmLabel={deleting.kind === "level" ? `Delete D${deleting.index + 1}` : "Delete item"}
          destructive
          footnote="This change takes effect when you save the item catalogue."
          message={catalogueDeletionMessage(deleting, charges)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            setDeleting(null);
            if (readOnly) return;
            if (deleting.kind === "item") {
              onChange(charges.filter((charge) => charge.name.toLowerCase() !== deleting.name.toLowerCase()));
              return;
            }
            const charge = charges.find((entry) => entry.name.toLowerCase() === deleting.name.toLowerCase());
            if (!charge) return;
            const levels = levelsOf(charge);
            levels.splice(deleting.index, 1);
            save(deleting.name, deleting.category, levels);
          }}
          title={deleting.kind === "level" ? "Delete damage level?" : "Delete this item?"}
        />
      ) : null}

      {sheet ? (
        <PriceSheet
          category={sheet.category}
          existing={sheet.name ? charges.find((charge) => charge.name.toLowerCase() === sheet.name!.toLowerCase()) ?? null : null}
          name={sheet.name}
          onClose={() => setSheet(null)}
          onSave={(name, levels) => {
            save(name, sheet.category, levels);
            setSheet(null);
          }}
          taken={(name) => entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase())}
        />
      ) : null}
    </View>
  );
}

/** A category's card: its heading and summary, Add beside it, collapsing to the summary. */
function CategoryCard({
  children,
  onAdd,
  summary,
  tail,
  title,
}: {
  children: React.ReactNode;
  onAdd?: () => void;
  summary: string;
  tail: string;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(true);
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, overflow: "hidden" }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
      >
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
            {title}<Text style={{ color: colors.accent }}> {tail}</Text>
          </Text>
          {open ? null : <Text style={[type.description, { color: colors.muted }]}>{summary}</Text>}
        </View>
        {onAdd ? (
          <AnimatedPressable
            accessibilityLabel={`Add to ${title} ${tail}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onAdd}
            style={{ alignItems: "center", borderColor: colors.primary, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 }}
          >
            <Plus color={colors.primary} size={14} strokeWidth={2.4} />
            <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>Add</Text>
          </AnimatedPressable>
        ) : null}
        <ChevronDisc direction={open ? "up" : "down"} size={32} />
      </AnimatedPressable>
      {open ? (
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** One item: its name and prices in a line, opening to each level with Edit and Delete. */
function DamageItemRow({
  charge,
  first,
  name,
  onDelete,
  onDeleteLevel,
  onEdit,
  readOnly,
}: {
  charge: PropertyDamageCharge | null;
  first: boolean;
  name: string;
  /** Only for an item added by hand: the rooms' own come back unpriced, never off the list. */
  onDelete?: () => void;
  onDeleteLevel: (index: number) => void;
  onEdit: () => void;
  readOnly: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const levels = charge ? levelsOf(charge) : [];
  return (
    <View style={{ borderTopColor: colors.border, borderTopWidth: first ? 0 : 1, paddingTop: first ? 0 : spacing.sm }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs }}
      >
        <ItemIcon color={colors.inkSoft} name={name} size={20} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{name}</Text>
          <Text style={[type.caption, { color: levels.length ? colors.muted : colors.kicker, fontVariant: ["tabular-nums"] }]}>
            {levels.length ? levels.map((price, at) => `D${at + 1} ${formatMoneyPaise(price)}`).join("  ·  ") : "No prices set"}
          </Text>
        </View>
        {onDelete && !readOnly ? (
          <AnimatedPressable accessibilityLabel={`Delete ${name}`} accessibilityRole="button" hitSlop={10} onPress={onDelete}>
            <Trash2 color={colors.danger} size={17} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}
        <ChevronDisc direction={open ? "up" : "down"} />
      </AnimatedPressable>
      {open ? (
        <View style={{ gap: spacing.xs, paddingBottom: spacing.xs, paddingTop: spacing.xs }}>
          {levels.map((price, at) => (
            <View key={at} style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: radii.card, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
              <DamageLevelPill level={(["D1", "D2", "D3"] as const)[at]} />
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14, fontVariant: ["tabular-nums"] }}>{formatMoneyPaise(price)}</Text>
              {readOnly ? null : (
                <>
                  <AnimatedPressable accessibilityLabel={`Edit ${name} prices`} accessibilityRole="button" hitSlop={10} onPress={onEdit}>
                    <Pencil color={colors.primary} size={16} strokeWidth={2.3} />
                  </AnimatedPressable>
                  <AnimatedPressable accessibilityLabel={`Delete ${name} D${at + 1}`} accessibilityRole="button" hitSlop={10} onPress={() => onDeleteLevel(at)}>
                    <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
                  </AnimatedPressable>
                </>
              )}
            </View>
          ))}
          {readOnly || levels.length === 3 ? null : (
            <View style={{ flexDirection: "row" }}>
              <ActionButton
                compact
                icon={levels.length ? Plus : Pencil}
                label={levels.length ? `Price D${levels.length + 1}` : "Set prices"}
                onPress={onEdit}
                variant="secondary"
              />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Adding an item, or editing an item's prices, in a bottom sheet. D1 is
 * required; D2 and D3 are optional, D3 never without D2, each at least the
 * one before. One message under the prices says what is wrong.
 */
function PriceSheet({
  category,
  existing,
  name,
  onClose,
  onSave,
  taken,
}: {
  category: DamageCategory;
  existing: PropertyDamageCharge | null;
  /** Null when adding a new item. */
  name: string | null;
  onClose: () => void;
  onSave: (name: string, levels: number[]) => void;
  taken: (name: string) => boolean;
}) {
  const { colors, type } = useTheme();
  const rupees = (paise: number | null | undefined) => (paise == null ? "" : String(Math.round(paise / 100)));
  const [itemName, setItemName] = useState("");
  const [draft, setDraft] = useState<PriceDraft>({ d1: rupees(existing?.d1Paise), d2: rupees(existing?.d2Paise), d3: rupees(existing?.d3Paise) });
  const [nameError, setNameError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const { tail, title } = CATEGORY_HEADINGS[category];

  function submit() {
    const finalName = name ?? itemName.trim();
    if (!name) {
      if (!finalName) { setNameError("Enter the item's name."); return; }
      if (taken(finalName)) { setNameError("This item is already on the list."); return; }
    }
    const d1 = toRupeesCount(draft.d1) * 100;
    const d2 = draft.d2.trim() ? toRupeesCount(draft.d2) * 100 : null;
    const d3 = draft.d3.trim() ? toRupeesCount(draft.d3) * 100 : null;
    if (category === "COMMON_TOILET") { onSave(finalName, []); return; }
    if (d1 <= 0) { setPriceError("Enter prices, D1 at least."); return; }
    if (d3 != null && d2 == null) { setPriceError("Price D2 before D3."); return; }
    if ((d2 != null && d2 < d1) || (d3 != null && d2 != null && d3 < d2)) { setPriceError("Each level costs at least the one before."); return; }
    onSave(finalName, [d1, ...(d2 != null ? [d2] : []), ...(d3 != null ? [d3] : [])]);
  }

  return (
    <SheetShell onClose={onClose} title={name ? name : `Add to ${title.toLowerCase()} ${tail}`}>
      <View style={{ gap: spacing.md }}>
        {name ? null : (
          <View style={{ gap: spacing.xs }}>
            <NotchedInput
              invalid={Boolean(nameError)}
              label="Item"
              maxLength={80}
              onChangeText={(value) => { setItemName(value); setNameError(null); }}
              placeholder="e.g. Study chair, Door lock"
              value={itemName}
            />
            {nameError ? <Text style={[type.caption, { color: colors.danger }]}>{nameError}</Text> : null}
          </View>
        )}
        {category === "COMMON_TOILET" ? null : (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {(["d1", "d2", "d3"] as const).map((key) => (
            <View key={key} style={{ flex: 1 }}>
              <NotchedInput
                invalid={Boolean(priceError)}
                keyboardType="number-pad"
                label={key.toUpperCase()}
                onChangeText={(value) => { setDraft((current) => ({ ...current, [key]: value })); setPriceError(null); }}
                placeholder={key === "d1" ? "0" : "Optional"}
                prefix="₹"
                value={draft[key]}
              />
            </View>
          ))}
        </View>
        )}
        {/* One message for the prices, under D2 (user, 2026-10-29). */}
        {priceError ? (
          <Text style={[type.caption, { color: colors.danger, textAlign: "center" }]}>{priceError}</Text>
        ) : null}
        <View style={{ flexDirection: "row" }}>
          <ActionButton icon={name ? Pencil : Plus} label={name ? "Save prices" : "Add item"} onPress={submit} />
        </View>
      </View>
    </SheetShell>
  );
}

/**
 * NA fixed as no damage; D1 to D3 in the property's own words, each level set
 * inside its field like a ₹ (user, 2026-10-29).
 */
function DamageLevelsEditor({
  onChange,
  readOnly,
  words,
}: {
  onChange: (next: LevelWords) => void;
  readOnly: boolean;
  words: LevelWords;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <NotchedInput editable={false} prefix="NA:" value="No damage" />
      {(["d1", "d2", "d3"] as const).map((key) => (
        <NotchedInput
          editable={!readOnly}
          key={key}
          maxLength={120}
          onChangeText={(value) => onChange({ ...words, [key]: value })}
          placeholder="What this level means"
          prefix={`${key.toUpperCase()}:`}
          value={words[key]}
        />
      ))}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs, paddingTop: spacing.xs }}>
        <Info color={colors.muted} size={14} strokeWidth={2.2} style={{ marginTop: 2 }} />
        <Text style={[type.description, { color: colors.muted, flex: 1 }]}>The same four levels for every item. D3 means the most damage.</Text>
      </View>
    </View>
  );
}

function toRupeesCount(text: string) {
  const value = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * One damage charge flattened to a comparable string.
 *
 * <p>`isUnchanged` compares arrays element by element; a list of objects would
 * compare by identity and every reload would read as an edit.
 */
function damageKey(charge: PropertyDamageCharge) {
  return `${charge.name}::${charge.d1Paise}::${charge.d2Paise}::${charge.d3Paise}::${charge.category}`;
}

function wordsOf(levels: { level: string; description: string }[] | undefined): LevelWords {
  const of = (level: string) => levels?.find((entry) => entry.level === level)?.description ?? "";
  return { d1: of("D1"), d2: of("D2"), d3: of("D3") };
}
