import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ChevronDown, ChevronUp, UserRound } from "lucide-react-native";

import { damageRecordName } from "./damage-record-card";
import { LoadFailedCard, loadFailure } from "@/components/load-failed";
import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { NotchedInput } from "@/components/notched-input";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { AMENITY_LABELS } from "@/features/property/amenity-picker";
import { compareFloors, formatFloor } from "@/features/property/floor";
import { ItemIcon } from "@/features/property/item-icon";
import { DamageLevelDropdown, DamageLevelPill, DamageLevelsSheet } from "@/features/tenancy/damage-level";
import { MultiImageField } from "@/features/uploads/multi-image-field";
import { SplitIcon } from "@/features/damage/split-icon";
import { cardName } from "@/lib/person-name";
import {
  useCreateDamageRecordMutation,
  useGetDamageRecordsQuery,
  useGetRoomItemConditionsQuery,
  useUpdateDamageRecordMutation,
  type DamageRecord,
  type SaveDamageRecordPayload,
} from "@/store/services/damage-api";
import {
  useGetPropertyExitPoliciesQuery,
  useListPropertyRoomsQuery,
  type DamageLevel,
  type OwnerRoom,
  type PropertyDamageCharge,
} from "@/store/services/property-api";
import { useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { useSoftShadow } from "@/theme/shadows";

type Section = "ROOM" | "BATHROOM";
type ItemOption = { name: string; section: Section; now: DamageLevel };

const SPLIT = "SPLIT";
const DAMAGE_OPTIONS: DamageLevel[] = ["D1", "D2", "D3"];

/** The levels an item is priced at in the catalogue, D1 first (user, 2026-11-07: price tiers only). */
function pricedLevels(charges: PropertyDamageCharge[], name: string | null): DamageLevel[] {
  if (!name) return [];
  const charge = charges.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!charge) return [];
  return (["D1", "D2", "D3"] as const).filter((level) =>
    (level === "D1" ? charge.d1Paise : level === "D2" ? charge.d2Paise : charge.d3Paise) != null);
}

/**
 * The catalogue's price for an item at a level, when it has one. Without a level, the
 * item's one flat price (2026-11-07: levels off).
 */
function catalogueCost(charges: PropertyDamageCharge[], name: string, level: DamageLevel | null) {
  const charge = charges.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!charge) return null;
  if (level === null) return charge.d1Paise ?? (charge.chargePaise > 0 ? charge.chargePaise : null);
  return level === "D1" ? charge.d1Paise : level === "D2" ? charge.d2Paise : level === "D3" ? charge.d3Paise : null;
}

function livesHere(stay: TenancySummary, roomId: string | null) {
  return stay.roomId === roomId && stay.billingType === "MONTHLY" && (stay.status === "ACTIVE" || stay.status === "PENDING_EXIT");
}

/**
 * Record a damage, or edit one (user, 2026-10-29). Four parts under the app's
 * subheading bands: the room (by floor) and the item, the damage (its new
 * level and cost, prefilled from the catalogue), who answers for it, and the
 * photos and notes. Save keeps it for exit, Charge now raises a one-off bill.
 */
export function RecordDamageSheet({
  fixedStay,
  onClose,
  propertyId,
  record,
}: {
  /**
   * From the End tenancy screen (2026-10-31): the room is this stay's, the
   * tenant is picked, and there is no Charge now, since that bill would only
   * block the same checkout.
   */
  fixedStay?: { roomId: string; tenancyId: string };
  onClose: () => void;
  propertyId: string;
  /** Present when editing. */
  record?: DamageRecord;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const roomsQuery = useListPropertyRoomsQuery(propertyId);
  const tenanciesQuery = useListPropertyTenanciesQuery({ propertyId });
  const policiesQuery = useGetPropertyExitPoliciesQuery(propertyId);
  const [create, createState] = useCreateDamageRecordMutation();
  const [update, updateState] = useUpdateDamageRecordMutation();

  const [roomId, setRoomId] = useState<string | null>(record?.roomId ?? fixedStay?.roomId ?? null);
  const [itemName, setItemName] = useState<string | null>(record?.itemName ?? null);
  // Nothing picked on a new record: "Pick a level" (user, 2026-11-07).
  const [level, setLevel] = useState<DamageLevel | null>(record?.damageLevel ?? null);
  const [cost, setCost] = useState(record ? String(Math.round(record.costPaise / 100)) : "");
  const [costTouched, setCostTouched] = useState(Boolean(record));
  const [responsible, setResponsible] = useState<string | null>(
    record ? (record.responsibility === "SPLIT" ? SPLIT : record.shares[0]?.tenancyId ?? null) : fixedStay?.tenancyId ?? null,
  );
  const [photos, setPhotos] = useState<string[]>(record?.photoUrls ?? []);
  const [note, setNote] = useState(record?.note ?? "");
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [levelHelp, setLevelHelp] = useState(false);
  // One split: the room, item, level and tenant are the damage's, so only its own cost, note and photos change.
  const oneSplit = Boolean(record?.splitNumber);

  const conditionsQuery = useGetRoomItemConditionsQuery({ propertyId, roomId: roomId ?? "" }, { skip: !roomId });
  // Open damages, to warn about one still open on the picked item. Nothing is blocked (2026-11-07).
  const openQuery = useGetDamageRecordsQuery({ history: false, propertyId });
  const charges = policiesQuery.data?.damageCharges ?? [];
  const rooms = roomsQuery.data ?? [];
  const stays = tenanciesQuery.data ?? [];
  const room = rooms.find((entry) => entry.id === roomId);

  // What this room has: its variant (AC or a fan), its type's picks, and
  // anything its condition already knows, each with its level now.
  const items = useMemo<ItemOption[]>(() => {
    if (!room) return [];
    const categoryOf = new Map(charges.map((entry) => [entry.name.toLowerCase(), entry.category]));
    const nowOf = new Map((conditionsQuery.data ?? []).map((entry) => [entry.itemName.toLowerCase(), entry]));
    const seen = new Set<string>();
    const list: ItemOption[] = [];
    const add = (name: string, fallback?: Section) => {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      const category = categoryOf.get(key);
      if (category === "COMMON_TOILET") return;
      seen.add(key);
      const known = nowOf.get(key);
      list.push({
        name: name.trim(),
        now: known?.level ?? "NA",
        section: known?.section ?? (category === "BATHROOM" ? "BATHROOM" : fallback ?? "ROOM"),
      });
    };
    add(room.conditioning === "AC" ? "AC" : "Fan");
    room.amenities.forEach((amenity) => {
      if (amenity === "ATTACHED_TOILET" || amenity === "COMMON_TOILET") return;
      add(AMENITY_LABELS[amenity]);
    });
    room.customAmenities.forEach((name) => add(name));
    (conditionsQuery.data ?? []).forEach((entry) => add(entry.itemName, entry.section));
    return list;
  }, [charges, conditionsQuery.data, room]);
  const item = items.find((entry) => entry.name === itemName) ?? null;
  // Levels are only price tiers (user, 2026-11-07): one is asked for only when the item is
  // priced at more than one, or the record being edited has one.
  const tiers = pricedLevels(charges, itemName);
  const asksLevel = Boolean(record?.damageLevel) || tiers.length > 1;
  const openOnItem = itemName
    ? (openQuery.data ?? []).find((other) => other.roomId === roomId
      && other.itemName.trim().toLowerCase() === itemName.trim().toLowerCase()
      && other.code !== record?.code)?.code ?? null
    : null;
  // One open damage per item at a time (user, 2026-11-07): the next waits for the fix.
  const blockedByOpen = openOnItem !== null;

  const tenants = stays.filter((stay) => livesHere(stay, roomId));

  // The catalogue's price fills the cost whenever the item or level changes, and the
  // owner can still type their own (user, 2026-11-07). No price leaves a typed cost alone.
  function suggest(name: string | null, at: DamageLevel | null) {
    if (!name) return;
    // Several tiers and none picked yet: no price to fill until one is.
    const price = !at && pricedLevels(charges, name).length > 1 ? null : catalogueCost(charges, name, at);
    if (price) {
      setCost(String(Math.round(price / 100)));
    } else if (!costTouched) {
      setCost("");
    }
  }
  const levelOptions = tiers.length > 1 ? tiers : DAMAGE_OPTIONS;

  const costPaise = Math.round(Number(cost || "0") * 100);
  const catalogue = itemName && (level || !asksLevel) ? catalogueCost(charges, itemName, asksLevel ? level : null) : null;
  const errors = {
    room: roomId ? undefined : "Pick the room",
    item: itemName ? undefined : "Pick the item",
    level: !asksLevel || level ? undefined : "Pick a level",
    cost: costPaise >= 100 ? undefined : "Enter the cost",
    responsible: responsible ? undefined : "Pick who is responsible",
    photos: photos.length > 0 ? undefined : "Add at least one photo",
  };
  const valid = Object.values(errors).every((error) => !error);
  const busy = createState.isLoading || updateState.isLoading;
  // The photos field's own label, for every label in the sheet (user, 2026-10-29).
  const labelStyle = [type.caption, { color: colors.muted, fontWeight: "700" as const }];

  async function submit(chargeNow: boolean) {
    setTried(true);
    if (!valid || !roomId || !itemName || (asksLevel && !level)) return;
    const payload: SaveDamageRecordPayload = {
      costPaise,
      damageLevel: asksLevel ? level : null,
      itemName,
      note: note.trim() || null,
      photoUrls: photos,
      responsibility: responsible === SPLIT ? "SPLIT" : "TENANT",
      roomId,
      section: item?.section ?? record?.section ?? "ROOM",
      tenancyId: responsible === SPLIT ? null : responsible,
      // In one step, so a split is billed whole or not at all.
      chargeNow,
    };
    try {
      const saved = record
        ? await update({ payload, propertyId, recordId: record.id, version: record.version }).unwrap()
        : await create({ payload, propertyId }).unwrap();
      toast.success(chargeNow ? `${saved.code} recorded and billed.` : record ? `${saved.code} updated.` : `${saved.code} recorded.`);
      onClose();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  const loadFailed = loadFailure(roomsQuery, tenanciesQuery, policiesQuery);
  if (loadFailed) {
    return (
      <SheetShell onClose={onClose} title={record ? "Edit damage" : "Record damage"}>
        <LoadFailedCard error={loadFailed.error} onReload={loadFailed.reload} />
      </SheetShell>
    );
  }

  return (
    <SheetShell
      footer={
        <View style={{ gap: spacing.sm }}>
          {record?.charged ? (
            <NoticeBar
              message="Changing the cost, level or who is responsible cancels its unpaid bill. Charge it again after."
              selectable={false}
              title="Changes affect the bill"
              tone="info"
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {/* Blocked while the item has an open damage (user, 2026-11-07). */}
            <ActionButton disabled={busy || blockedByOpen} label={busy ? "Saving…" : "Save"} onPress={() => void submit(false)} variant="primary" />
            {record?.charged || fixedStay ? null : <ActionButton disabled={busy || blockedByOpen} label="Charge now" onPress={() => void submit(true)} />}
          </View>
        </View>
      }
      fullBleed
      onClose={onClose}
      size="tall"
      title={record ? "Edit damage" : "Record damage"}
    >
      {/* Out to the sheet's edges, the padding put back inside. */}
      <ScrollView
        contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}
        keyboardShouldPersistTaps="handled"
        style={{ marginHorizontal: -spacing.lg }}
      >
        {/* Each part titled, lines between them, no subheading bands or boxes (user, 2026-11-07). */}
        <FormCard first title="Room & item">
        {oneSplit && record ? (
          <Text style={[type.bodyStrong, { color: colors.ink }]}>
            {`${damageRecordName(record)} · ${record.damageLevel} · Room ${record.roomLabel ?? "unavailable"}`}
          </Text>
        ) : null}
        {fixedStay || oneSplit ? null : (
          <RoomByFloorField
            error={tried ? errors.room : undefined}
            onChange={(next) => {
              setRoomId(next);
              setItemName(null);
              setResponsible(null);
            }}
            rooms={rooms}
            stays={stays}
            value={roomId}
          />
        )}
        {room && !oneSplit ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={labelStyle}>All items</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {items.map((entry) => (
                <ChoiceTile
                  key={entry.name}
                  onPress={() => {
                    setItemName(entry.name);
                    // Another item has its own tiers: its level is picked again.
                    const keep = record ? level : null;
                    if (keep !== level) setLevel(keep);
                    suggest(entry.name, keep);
                  }}
                  selected={entry.name === itemName}
                >
                  <ItemIcon color={colors.inkSoft} name={entry.name} size={18} />
                  <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, flexShrink: 1 }]}>{entry.name}</Text>
                </ChoiceTile>
              ))}
            </View>
            {tried && errors.item ? <FieldError message={errors.item} /> : null}
            {/* A nudge, not a rule (user, 2026-11-07). */}
            {openOnItem ? (
              <NoticeBar
                message={`${openOnItem} is still open for ${itemName}. Mark it repaired or replaced before recording a new damage.`}
                selectable={false}
                title="Open damage record"
                tone="warning"
              />
            ) : null}
          </View>
        ) : null}
        </FormCard>

        <FormCard title="The damage">
        {oneSplit || !asksLevel ? null : <View style={{ gap: spacing.xs }}>
          <DamageLevelDropdown
            label="New damage level"
            onChange={(next) => {
              setLevel(next);
              suggest(itemName, next);
            }}
            inline
            onHelp={() => setLevelHelp(true)}
            options={levelOptions}
            placeholder="Pick a level"
            value={level}
          />
          {tried && errors.level ? <FieldError message={errors.level} /> : null}
        </View>}
        <View style={{ gap: spacing.xs }}>
          <NotchedInput
            invalid={tried && Boolean(errors.cost)}
            keyboardType="number-pad"
            editable={!blockedByOpen}
            label="Cost"
            maxLength={7}
            onChangeText={(value) => {
              setCost(value.replace(/[^0-9]/g, ""));
              setCostTouched(true);
            }}
            placeholder="0"
            prefix="₹"
            value={cost}
          />
          {tried && errors.cost ? <FieldError message={errors.cost} /> : null}
          {catalogue ? (
            <Text style={[type.caption, { color: colors.muted }]}>
              {asksLevel ? `Catalogue price at ${level}: ` : "Catalogue price: "}{formatMoneyPaise(catalogue)}
            </Text>
          ) : null}
        </View>
        </FormCard>

        <FormCard title="Who is responsible">
        {oneSplit && record ? (
          <Text style={[type.bodyStrong, { color: colors.ink }]}>{cardName(record.shares[0]?.tenantName ?? "Tenant")}</Text>
        ) : !roomId ? (
          <Text style={[type.caption, { color: colors.muted }]}>Pick the room first.</Text>
        ) : tenants.length === 0 ? (
          <Text style={[type.caption, { color: colors.muted }]}>Nobody lives in this room now.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {tenants.map((stay) => (
              <ChoiceRow
                icon={(color) => <UserRound color={color} fill={color} size={18} strokeWidth={2.2} />}
                key={stay.id}
                label={cardName(stay.tenantName ?? "Tenant")}
                onPress={() => setResponsible(stay.id)}
                selected={responsible === stay.id}
                trailing={responsible === stay.id && costPaise > 0 ? formatMoneyPaise(costPaise) : undefined}
              />
            ))}
            {tenants.length >= 2 ? (
              <ChoiceRow
                icon={(color) => <SplitIcon color={color} size={18} />}
                label={`Split equally between ${tenants.length}`}
                onPress={() => setResponsible(SPLIT)}
                selected={responsible === SPLIT}
                trailing={costPaise > 0 ? `${formatMoneyPaise(Math.floor(costPaise / tenants.length))} each` : undefined}
              />
            ) : null}
            {tried && errors.responsible ? <FieldError message={errors.responsible} /> : null}
          </View>
        )}
        </FormCard>

        <FormCard title="Photos & notes">
        <View style={{ gap: spacing.xs }}>
          <MultiImageField
            label={`All photos (${photos.length}/3)`}
            max={3}
            onChange={setPhotos}
            target="MOVE_IN_PHOTO"
            urls={photos}
          />
          {tried && errors.photos ? <FieldError message={errors.photos} /> : null}
        </View>
        {/* A label above, like the photos', not one in the border (user, 2026-10-29). */}
        <View style={{ gap: spacing.xs }}>
          <Text style={labelStyle}>Notes</Text>
          <NotchedInput maxLength={300} multiline onChangeText={setNote} placeholder="What exactly is damaged" value={note} />
        </View>
        </FormCard>

      </ScrollView>
      {serverError ? <AlertModal message={serverError} onClose={() => setServerError(null)} /> : null}
      {/* What each level means here, as points marked by their pill, no numbers (user, 2026-10-29). */}
      {levelHelp ? (
        <DamageLevelsSheet onClose={() => setLevelHelp(false)} />
      ) : null}
    </SheetShell>
  );
}

/**
 * One part of the form: its title, then its fields, a line above every part but the
 * first (user, 2026-11-07: the same structure as the cards, without the boxes).
 */
function FormCard({ children, first = false, title }: { children: React.ReactNode; first?: boolean; title: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        borderTopColor: colors.border,
        borderTopWidth: first ? 0 : 1,
        gap: spacing.md,
        paddingTop: first ? 0 : spacing.lg,
      }}
    >
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, lineHeight: 22 }}>{title}</Text>
      {children}
    </View>
  );
}

function FieldError({ message }: { message: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.caption, { color: colors.danger }]}>{message}</Text>;
}

/** A tile picked from a wrap: the item it names, bordered blue and ticked when chosen. */
function ChoiceTile({ blocked = null, children, onPress, selected }: {
  /** Greyed out with this word when the item takes no new damage (user, 2026-11-07). */
  blocked?: string | null;
  children: React.ReactNode;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(blocked), selected }}
      disabled={Boolean(blocked)}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.primarySoft : blocked ? colors.surfaceSunken : colors.surface,
        opacity: blocked ? 0.55 : 1,
        borderColor: selected ? colors.primary : colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        maxWidth: "100%",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {children}
      {blocked ? <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 11 }}>{blocked}</Text> : null}
    </AnimatedPressable>
  );
}

/** One choice of who answers for it: a name, or the split, with what it comes to. */
function ChoiceRow({ icon, label, onPress, selected, trailing }: {
  icon: (color: string) => React.ReactNode;
  label: string;
  onPress: () => void;
  selected: boolean;
  trailing?: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      {icon(selected ? colors.primary : colors.inkSoft)}
      <Text numberOfLines={1} style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15 }}>{label}</Text>
      {trailing ? <Text style={[type.caption, { color: colors.muted }]}>{trailing}</Text> : null}
    </AnimatedPressable>
  );
}

/**
 * The room, chosen floor by floor (user, 2026-10-29). Opens in place under the
 * field: each floor in building order, its rooms in number order as tiles with
 * how many live there.
 */
/** No floor open: a key no floor can have. */
const CLOSED_ALL = "\u0000";

function RoomByFloorField({
  error,
  onChange,
  rooms,
  stays,
  value,
}: {
  error?: string;
  onChange: (roomId: string) => void;
  rooms: OwnerRoom[];
  stays: TenancySummary[];
  value: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const softShadow = useSoftShadow();
  const [open, setOpen] = useState(!value);
  // Three to a row, filling it edge to edge (user, 2026-10-29).
  const [rowWidth, setRowWidth] = useState(0);
  // The row is padded by md each side inside its floor.
  const tileWidth = rowWidth > 0 ? Math.floor((rowWidth - spacing.md * 2 - spacing.sm * 2) / 3) - 1 : undefined;
  const chosen = rooms.find((room) => room.id === value) ?? null;
  const floors = useMemo(() => {
    const byFloor = new Map<string, OwnerRoom[]>();
    for (const room of rooms) {
      const key = room.floor ?? "";
      byFloor.set(key, [...(byFloor.get(key) ?? []), room]);
    }
    return [...byFloor.entries()]
      .sort(([left], [right]) => compareFloors(left, right))
      .map(([floor, inFloor]) => ({
        floor,
        rooms: [...inFloor].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })),
      }));
  }, [rooms]);
  const living = (roomId: string) => stays.filter((stay) => livesHere(stay, roomId)).length;
  // One floor open at a time (user, 2026-11-07): the chosen room's, else the first.
  // CLOSED_ALL marks every floor folded by hand.
  const [openFloor, setOpenFloor] = useState<string | null>(() => {
    const at = rooms.find((room) => room.id === value);
    return at ? at.floor ?? "" : null;
  });
  const shownFloor = openFloor ?? floors[0]?.floor ?? null;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.label, { color: colors.muted }]}>Room</Text>
      <AnimatedPressable
        accessibilityLabel={chosen ? `Room ${chosen.roomNumber}, ${formatFloor(chosen.floor)}` : "Pick the room"}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((shown) => !shown)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: error ? colors.danger : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 50,
          paddingLeft: spacing.md,
          paddingRight: spacing.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          {chosen ? (
            <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
              Room {chosen.roomNumber}
              <Text style={{ color: colors.muted, fontFamily: fonts.sans }}>  ·  {formatFloor(chosen.floor)}</Text>
            </Text>
          ) : (
            <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 15 }}>Pick the room</Text>
          )}
        </View>
        <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 12, height: 24, justifyContent: "center", width: 24 }}>
          {open ? <ChevronUp color={colors.muted} size={16} /> : <ChevronDown color={colors.muted} size={16} />}
        </View>
      </AnimatedPressable>
      {open ? (
        // A card under the field, its floors folding open one at a time (user, 2026-11-07).
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, overflow: "hidden" }}>
          {floors.map(({ floor, rooms: inFloor }, index) => {
            const expanded = floor === shownFloor;
            return (
            <View key={floor || "none"} style={{ borderTopColor: colors.border, borderTopWidth: index === 0 ? 0 : 1 }}>
              <AnimatedPressable
                accessibilityLabel={`${formatFloor(floor)}, ${inFloor.length} ${inFloor.length === 1 ? "room" : "rooms"}`}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpenFloor(expanded ? CLOSED_ALL : floor)}
                style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 }}
              >
                {/* The floor, and its room count in a grey pill (user, 2026-10-29). */}
                <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>{formatFloor(floor)}</Text>
                <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                  <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 12 }}>
                    {inFloor.length} {inFloor.length === 1 ? "room" : "rooms"}
                  </Text>
                </View>
                <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 12, height: 24, justifyContent: "center", width: 24 }}>
                  {expanded ? <ChevronUp color={colors.muted} size={16} /> : <ChevronDown color={colors.muted} size={16} />}
                </View>
              </AnimatedPressable>
              {expanded ? (
              <View
                onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
                style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.md }}
              >
                {inFloor.map((room) => {
                  const selected = room.id === value;
                  const people = living(room.id);
                  return (
                    <AnimatedPressable
                      accessibilityLabel={`Room ${room.roomNumber}, ${people} living there`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={room.id}
                      onPress={() => {
                        onChange(room.id);
                        setOpen(false);
                      }}
                      style={{
                        alignItems: "center",
                        backgroundColor: selected ? colors.primarySoft : colors.surface,
                        borderColor: selected ? colors.primary : colors.border,
                        borderCurve: "continuous",
                        borderRadius: radii.card,
                        borderWidth: 1,
                        gap: 2,
                        paddingHorizontal: spacing.xs,
                        paddingVertical: spacing.sm,
                        width: tileWidth ?? "31%",
                        // Each room lifts like the app's cards (user, 2026-10-29).
                        ...softShadow(colors.shadow, 2, 8),
                      }}
                    >
                      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{room.roomNumber}</Text>
                      {/* A person for each living there, as a count (user, 2026-10-29). */}
                      {people > 0 ? (
                        <View style={{ alignItems: "center", flexDirection: "row", gap: 3 }}>
                          <UserRound color={colors.jade} fill={colors.jade} size={13} strokeWidth={2.4} />
                          <Text style={[type.caption, { color: colors.jade, fontFamily: fonts.sansBold }]}>{people}</Text>
                        </View>
                      ) : (
                        <Text style={[type.caption, { color: colors.muted }]}>Empty</Text>
                      )}
                    </AnimatedPressable>
                  );
                })}
              </View>
              ) : null}
            </View>
            );
          })}
        </View>
      ) : null}
      {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}
