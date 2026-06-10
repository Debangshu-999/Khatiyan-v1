import { useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { BedDouble, Check, ChevronDown, Layers, Pencil, Plus, Rows3, Settings2, Trash2, X } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import {
  ActionButton,
  BackButton,
  ChoiceButton,
  ConfirmDialog,
  FormInput,
  IconButton,
  formatMoneyPaise,
  humanizeToken,
  rupeesToPaise,
} from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  ROOM_CONDITIONINGS,
  ROOM_TYPES,
  useCreateRoomMutation,
  useCreateRoomsBulkMutation,
  useDeactivateRoomMutation,
  useListMyPropertiesQuery,
  useListPropertyRoomsQuery,
  useMarkRoomStatusMutation,
  useUpdateRoomMutation,
  type CreateRoomPayload,
  type OwnerProperty,
  type OwnerRoom,
  type RoomConditioning,
  type RoomStatus,
  type RoomType,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type RoomFormState = {
  prefix: string;
  roomNumber: string;
  floor: string;
  capacity: string;
  roomType: RoomType;
  conditioning: RoomConditioning;
  rent: string;
};

const emptyForm: RoomFormState = { capacity: "1", conditioning: "NON_AC", floor: "", prefix: "", rent: "", roomNumber: "", roomType: "SINGLE" };

// Default bed count implied by a room type. DORMITORY is variable, so it is
// left out and the existing capacity is kept when that type is chosen.
const CAPACITY_BY_TYPE: Partial<Record<RoomType, number>> = {
  DOUBLE: 2,
  FIVE_SHARING: 5,
  FOUR_SHARING: 4,
  SINGLE: 1,
  TRIPLE: 3,
};

function roomTypePatch(value: RoomType): Partial<RoomFormState> {
  const capacity = CAPACITY_BY_TYPE[value];
  return capacity != null ? { capacity: String(capacity), roomType: value } : { roomType: value };
}

export default function OwnerRoomsScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);

  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const rooms = (roomsQuery.data ?? []).filter((room) => room.active);

  const [deactivateRoom] = useDeactivateRoomMutation();

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<OwnerRoom | null>(null);
  const [statusRoom, setStatusRoom] = useState<OwnerRoom | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OwnerRoom | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);

  const totalBeds = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const occupiedBeds = rooms.reduce((sum, room) => sum + room.occupiedCount, 0);
  const maintenanceCount = rooms.filter((room) => room.status === "MAINTENANCE").length;
  const occupiedRoomsCount = rooms.filter((room) => room.occupiedCount > 0).length;
  const floors = Array.from(new Set(rooms.map((room) => room.floor ?? ""))).sort((left, right) => left.localeCompare(right));

  // Auto-select the first floor; fall back gracefully if the list changes.
  const activeFloor = selectedFloor != null && floors.includes(selectedFloor) ? selectedFloor : floors[0] ?? null;
  const floorRooms = activeFloor != null ? rooms.filter((room) => (room.floor ?? "") === activeFloor) : [];
  const floorBeds = floorRooms.reduce((sum, room) => sum + room.capacity, 0);
  const floorOccupiedBeds = floorRooms.reduce((sum, room) => sum + room.occupiedCount, 0);
  const floorMaintenance = floorRooms.filter((room) => room.status === "MAINTENANCE").length;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={BedDouble}
          eyebrow="Property required"
          title="No active property selected"
          description="Choose the property whose rooms you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Rooms" value={String(rooms.length)} hint={`${floors.length} floor${floors.length === 1 ? "" : "s"}`} tone="primary" />
            <MetricTile label="Beds" value={String(totalBeds)} hint={`${occupiedBeds} occupied`} />
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Out of service" value={String(maintenanceCount)} hint="Under maintenance" tone={maintenanceCount > 0 ? "danger" : "default"} />
            <MetricTile label="Occupied" value={String(occupiedRoomsCount)} hint={`${rooms.length - occupiedRoomsCount} with space`} />
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton icon={Plus} label="Add room" onPress={() => setAddOpen(true)} />
            <ActionButton icon={Layers} label="Bulk add" onPress={() => setBulkOpen(true)} variant="secondary" />
          </View>

          {roomsQuery.isFetching && rooms.length === 0 ? (
            <Card>
              <ActivityIndicator color={colors.primary} />
            </Card>
          ) : rooms.length === 0 ? (
            <EmptyState
              icon={BedDouble}
              eyebrow="No rooms"
              title="No rooms yet"
              description="Add rooms one by one, or bulk-create a numbered range."
            />
          ) : (
            <>
              <FloorSelector active={activeFloor} floors={floors} onSelect={setSelectedFloor} />
              {activeFloor != null ? (
                <Section eyebrow="Floor summary" title={activeFloor ? `Floor ${activeFloor}` : "Unassigned"}>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <MetricTile label="Rooms" value={String(floorRooms.length)} hint={`${floorBeds} bed${floorBeds === 1 ? "" : "s"}`} tone="primary" />
                    <MetricTile label="Occupied" value={String(floorOccupiedBeds)} hint={`${floorBeds - floorOccupiedBeds} vacant`} />
                  </View>
                  {floorMaintenance > 0 ? (
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <MetricTile label="Out of service" value={String(floorMaintenance)} hint="Under maintenance" tone="danger" />
                      <View style={{ flex: 1 }} />
                    </View>
                  ) : null}
                  {floorRooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      onDelete={() => setPendingDelete(room)}
                      onEdit={() => setEditRoom(room)}
                      onStatus={() => setStatusRoom(room)}
                    />
                  ))}
                </Section>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {addOpen && selectedProperty ? <AddRoomModal onClose={() => setAddOpen(false)} propertyId={selectedProperty.id} /> : null}
      {bulkOpen && selectedProperty ? <BulkRoomModal onClose={() => setBulkOpen(false)} propertyId={selectedProperty.id} /> : null}
      {editRoom && selectedProperty ? <EditRoomModal onClose={() => setEditRoom(null)} propertyId={selectedProperty.id} room={editRoom} /> : null}
      {statusRoom && selectedProperty ? <StatusModal onClose={() => setStatusRoom(null)} propertyId={selectedProperty.id} room={statusRoom} /> : null}

      {pendingDelete ? (
        <ConfirmDialog
          confirmLabel="Deactivate"
          destructive
          message={`Deactivate room ${pendingDelete.roomNumber}? It will no longer be available for new tenancies.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            if (selectedProperty) {
              void deactivateRoom({ propertyId: selectedProperty.id, roomId: target.id });
            }
          }}
          title="Deactivate room?"
        />
      ) : null}
    </ScreenScrollView>
  );
}

function floorLabel(floor: string | null) {
  if (floor == null) {
    return "Select floor";
  }
  return floor ? `Floor ${floor}` : "Unassigned";
}

function FloorSelector({ active, floors, onSelect }: { active: string | null; floors: string[]; onSelect: (floor: string) => void }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
        Floor
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 48,
          paddingHorizontal: spacing.md,
        }}
      >
        <Rows3 color={colors.kicker} size={18} strokeWidth={2.2} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" }} selectable>
          {floorLabel(active)}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          {floors.length} floor{floors.length === 1 ? "" : "s"}
        </Text>
        <ChevronDown color={colors.kicker} size={18} strokeWidth={2.2} />
      </Pressable>

      {open ? (
        <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible>
          <Pressable
            onPress={() => setOpen(false)}
            style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 18,
                borderWidth: 1,
                gap: spacing.xs,
                maxHeight: "70%",
                maxWidth: 420,
                padding: spacing.md,
                width: "100%",
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: spacing.xs, paddingHorizontal: spacing.xs }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "600" }} selectable>
                  Choose floor
                </Text>
                <IconButton accessibilityLabel="Close" icon={X} onPress={() => setOpen(false)} />
              </View>
              <ScrollView contentContainerStyle={{ gap: spacing.xs }} showsVerticalScrollIndicator={false}>
                {floors.map((floor) => {
                  const selected = floor === active;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={floor || "unassigned"}
                      onPress={() => {
                        onSelect(floor);
                        setOpen(false);
                      }}
                      style={{
                        alignItems: "center",
                        backgroundColor: selected ? colors.primarySoft : colors.surfaceSunken,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: 12,
                        borderWidth: 1,
                        flexDirection: "row",
                        gap: spacing.sm,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.md,
                      }}
                    >
                      <Text style={{ color: selected ? colors.primary : colors.ink, flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: "800" }} selectable>
                        {floor ? `Floor ${floor}` : "Unassigned"}
                      </Text>
                      {selected ? <Check color={colors.primary} size={18} strokeWidth={2.4} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function RoomCard({ onDelete, onEdit, onStatus, room }: { onDelete: () => void; onEdit: () => void; onStatus: () => void; room: OwnerRoom }) {
  const { colors, fonts, type } = useTheme();
  const statusTone =
    room.status === "OCCUPIED"
      ? colors.danger
      : room.status === "MAINTENANCE"
        ? colors.muted
        : room.status === "PARTIALLY_OCCUPIED"
          ? colors.primary
          : colors.successText;

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, fontWeight: "500" }} selectable>
              Room {room.roomNumber}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              {humanizeToken(room.roomType)} · {room.conditioning === "AC" ? "AC" : "Non-AC"} · {room.capacity} bed{room.capacity === 1 ? "" : "s"}
            </Text>
          </View>
          <Text style={[type.caption, { color: statusTone, fontWeight: "900" }]} selectable>
            {humanizeToken(room.status)}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricTile label="Rent" value={formatMoneyPaise(room.baseRentPaise)} hint="Per bed/month" />
          <MetricTile label="Vacancy" value={String(room.availableVacancies)} hint={`${room.occupiedCount}/${room.capacity} filled`} tone={room.availableVacancies > 0 ? "primary" : "default"} />
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton icon={Pencil} label="Edit" onPress={onEdit} variant="secondary" />
          <ActionButton icon={Settings2} label="Status" onPress={onStatus} variant="secondary" />
          <IconButton accessibilityLabel="Deactivate room" icon={Trash2} onPress={onDelete} />
        </View>
      </View>
    </Card>
  );
}

function ChoiceRow<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {options.map((option) => (
          <ChoiceButton active={option === value} key={option} label={humanizeToken(option)} onPress={() => onChange(option)} />
        ))}
      </View>
    </View>
  );
}

function RoomFieldset({
  form,
  setForm,
  showPrefix = true,
}: {
  form: RoomFormState;
  setForm: (patch: Partial<RoomFormState>) => void;
  showPrefix?: boolean;
}) {
  return (
    <>
      {showPrefix ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormInput label="Prefix (optional)" onChangeText={(value) => setForm({ prefix: value })} placeholder="R, A-…" value={form.prefix} />
          </View>
          <View style={{ flex: 2 }}>
            <FormInput label="Room number" onChangeText={(value) => setForm({ roomNumber: value })} placeholder="101" value={form.roomNumber} />
          </View>
        </View>
      ) : (
        <FormInput label="Room number" onChangeText={(value) => setForm({ roomNumber: value })} placeholder="101" value={form.roomNumber} />
      )}
      <FormInput label="Floor" onChangeText={(value) => setForm({ floor: value })} placeholder="Ground, 1, 2…" value={form.floor} />
      <ChoiceRow label="Room type" onChange={(value: RoomType) => setForm(roomTypePatch(value))} options={ROOM_TYPES} value={form.roomType} />
      <FormInput keyboardType="number-pad" label="Capacity (beds)" onChangeText={(value) => setForm({ capacity: value })} placeholder="2" value={form.capacity} />
      <ChoiceRow label="Conditioning" onChange={(value: RoomConditioning) => setForm({ conditioning: value })} options={ROOM_CONDITIONINGS} value={form.conditioning} />
      <FormInput keyboardType="decimal-pad" label="Base rent (₹)" onChangeText={(value) => setForm({ rent: value })} placeholder="Amount in rupees" value={form.rent} />
    </>
  );
}

function buildRoomPayload(form: RoomFormState): CreateRoomPayload | string {
  if (!form.roomNumber.trim()) {
    return "Enter a room number.";
  }
  const capacity = Number(form.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    return "Capacity must be at least 1.";
  }
  const baseRentPaise = rupeesToPaise(form.rent);
  if (baseRentPaise == null) {
    return "Enter a valid base rent.";
  }
  return {
    baseRentPaise,
    capacity,
    conditioning: form.conditioning,
    floor: form.floor.trim(),
    roomNumber: `${form.prefix.trim()}${form.roomNumber.trim()}`,
    roomType: form.roomType,
  };
}

function ModalShell({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              gap: spacing.md,
              maxHeight: "92%",
              paddingBottom: Math.max(insets.bottom, spacing.md),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} selectable>
                {title}
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddRoomModal({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const [form, setFormState] = useState<RoomFormState>(emptyForm);
  const setForm = (patch: Partial<RoomFormState>) => setFormState((current) => ({ ...current, ...patch }));
  const [error, setError] = useState<string | null>(null);
  const [createRoom, { isLoading }] = useCreateRoomMutation();

  async function submit() {
    if (isLoading) {
      return;
    }
    const payload = buildRoomPayload(form);
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    try {
      await createRoom({ payload, propertyId }).unwrap();
      onClose();
    } catch {
      setError("Could not create the room. The room number may already exist.");
    }
  }

  return (
    <ModalShell onClose={onClose} title="Add room">
      <RoomScroll>
        <RoomFieldset form={form} setForm={setForm} />
        {error ? (
          <Text style={[type.caption, { color: colors.danger }]} selectable>
            {error}
          </Text>
        ) : null}
      </RoomScroll>
      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={isLoading} label={isLoading ? "Saving" : "Create room"} onPress={() => void submit()} />
      </View>
    </ModalShell>
  );
}

function EditRoomModal({ onClose, propertyId, room }: { onClose: () => void; propertyId: string; room: OwnerRoom }) {
  const { colors, type } = useTheme();
  const [form, setFormState] = useState<RoomFormState>({
    capacity: String(room.capacity),
    conditioning: room.conditioning,
    floor: room.floor ?? "",
    prefix: "",
    rent: String(Math.round(room.baseRentPaise / 100)),
    roomNumber: room.roomNumber,
    roomType: room.roomType,
  });
  const setForm = (patch: Partial<RoomFormState>) => setFormState((current) => ({ ...current, ...patch }));
  const [error, setError] = useState<string | null>(null);
  const [updateRoom, { isLoading }] = useUpdateRoomMutation();

  async function submit() {
    if (isLoading) {
      return;
    }
    const payload = buildRoomPayload(form);
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    try {
      await updateRoom({ payload, propertyId, roomId: room.id }).unwrap();
      onClose();
    } catch {
      setError("Could not update the room. Capacity cannot drop below current occupants.");
    }
  }

  return (
    <ModalShell onClose={onClose} title={`Edit room ${room.roomNumber}`}>
      <RoomScroll>
        <RoomFieldset form={form} setForm={setForm} showPrefix={false} />
        {error ? (
          <Text style={[type.caption, { color: colors.danger }]} selectable>
            {error}
          </Text>
        ) : null}
      </RoomScroll>
      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={isLoading} label={isLoading ? "Saving" : "Save changes"} onPress={() => void submit()} />
      </View>
    </ModalShell>
  );
}

type BulkMode = "range" | "custom";

function BulkRoomModal({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const [mode, setMode] = useState<BulkMode>("range");

  // Serial-range state.
  const [prefix, setPrefix] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [form, setFormState] = useState<RoomFormState>(emptyForm);
  const setForm = (patch: Partial<RoomFormState>) => setFormState((current) => ({ ...current, ...patch }));

  // Custom-list state.
  const [customRooms, setCustomRooms] = useState<RoomFormState[]>([{ ...emptyForm }]);
  const updateCustom = (index: number, patch: Partial<RoomFormState>) =>
    setCustomRooms((current) => current.map((room, i) => (i === index ? { ...room, ...patch } : room)));
  const addCustom = () => setCustomRooms((current) => [...current, { ...emptyForm }]);
  const removeCustom = (index: number) => setCustomRooms((current) => current.filter((_, i) => i !== index));

  const [error, setError] = useState<string | null>(null);
  const [createRoomsBulk, { isLoading }] = useCreateRoomsBulkMutation();

  const startNumber = Number(start);
  const endNumber = Number(end);
  const rangeCount = Number.isInteger(startNumber) && Number.isInteger(endNumber) && endNumber >= startNumber ? endNumber - startNumber + 1 : 0;
  const submitLabel = mode === "range" ? `Create ${rangeCount || ""} room${rangeCount === 1 ? "" : "s"}`.trim() : `Create ${customRooms.length} room${customRooms.length === 1 ? "" : "s"}`;

  async function submitRange() {
    if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || endNumber < startNumber) {
      setError("Enter a valid start and end number.");
      return;
    }
    const capacity = Number(form.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      setError("Capacity must be at least 1.");
      return;
    }
    const baseRentPaise = rupeesToPaise(form.rent);
    if (baseRentPaise == null) {
      setError("Enter a valid base rent.");
      return;
    }
    setError(null);
    try {
      await createRoomsBulk({
        payload: {
          ranges: [
            {
              baseRentPaise,
              capacity,
              conditioning: form.conditioning,
              endNumber,
              floor: form.floor.trim(),
              prefix: prefix.trim(),
              roomType: form.roomType,
              startNumber,
            },
          ],
        },
        propertyId,
      }).unwrap();
      onClose();
    } catch {
      setError("Could not create rooms. Some numbers in this range may already exist.");
    }
  }

  async function submitCustom() {
    const rooms: CreateRoomPayload[] = [];
    for (let index = 0; index < customRooms.length; index += 1) {
      const payload = buildRoomPayload(customRooms[index]);
      if (typeof payload === "string") {
        setError(`Room ${index + 1}: ${payload}`);
        return;
      }
      rooms.push(payload);
    }
    if (rooms.length === 0) {
      setError("Add at least one room.");
      return;
    }
    setError(null);
    try {
      await createRoomsBulk({ payload: { rooms }, propertyId }).unwrap();
      onClose();
    } catch {
      setError("Could not create rooms. Some room numbers may already exist.");
    }
  }

  function submit() {
    if (isLoading) {
      return;
    }
    void (mode === "range" ? submitRange() : submitCustom());
  }

  return (
    <ModalShell onClose={onClose} title="Bulk add rooms">
      <RoomScroll>
        <View style={{ gap: spacing.xs }}>
          <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
            Method
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            <ChoiceButton active={mode === "range"} label="Serial range" onPress={() => setMode("range")} />
            <ChoiceButton active={mode === "custom"} label="Custom list" onPress={() => setMode("custom")} />
          </View>
          <Text style={[type.caption, { color: colors.kicker }]} selectable>
            {mode === "range"
              ? "Generate a numbered range of identical rooms."
              : "Add a list of rooms, each with its own details."}
          </Text>
        </View>

        {mode === "range" ? (
          <>
            <FormInput label="Prefix (optional)" onChangeText={setPrefix} placeholder="R, A-…" value={prefix} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <FormInput keyboardType="number-pad" label="Start number" onChangeText={setStart} placeholder="101" value={start} />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput keyboardType="number-pad" label="End number" onChangeText={setEnd} placeholder="110" value={end} />
              </View>
            </View>
            <FormInput label="Floor" onChangeText={(value) => setForm({ floor: value })} placeholder="Ground, 1, 2…" value={form.floor} />
            <ChoiceRow label="Room type" onChange={(value: RoomType) => setForm(roomTypePatch(value))} options={ROOM_TYPES} value={form.roomType} />
            <FormInput keyboardType="number-pad" label="Capacity (beds)" onChangeText={(value) => setForm({ capacity: value })} placeholder="2" value={form.capacity} />
            <ChoiceRow label="Conditioning" onChange={(value: RoomConditioning) => setForm({ conditioning: value })} options={ROOM_CONDITIONINGS} value={form.conditioning} />
            <FormInput keyboardType="decimal-pad" label="Base rent (₹)" onChangeText={(value) => setForm({ rent: value })} placeholder="Amount in rupees" value={form.rent} />
            {rangeCount > 0 ? (
              <Text style={[type.caption, { color: colors.primary }]} selectable>
                Will create {rangeCount} room{rangeCount === 1 ? "" : "s"}{prefix.trim() ? ` (${prefix.trim()}${startNumber}…${prefix.trim()}${endNumber})` : ""}.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {customRooms.map((room, index) => (
              <View
                key={index}
                style={{ borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: spacing.md, padding: spacing.md }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]} selectable>
                    Room {index + 1}
                  </Text>
                  {customRooms.length > 1 ? (
                    <IconButton accessibilityLabel={`Remove room ${index + 1}`} icon={Trash2} onPress={() => removeCustom(index)} />
                  ) : null}
                </View>
                <RoomFieldset form={room} setForm={(patch) => updateCustom(index, patch)} />
              </View>
            ))}
            <ActionButton icon={Plus} label="Add another room" onPress={addCustom} variant="secondary" />
          </>
        )}

        {error ? (
          <Text style={[type.caption, { color: colors.danger }]} selectable>
            {error}
          </Text>
        ) : null}
      </RoomScroll>
      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={isLoading} label={isLoading ? "Creating" : submitLabel} onPress={submit} />
      </View>
    </ModalShell>
  );
}

function StatusModal({ onClose, propertyId, room }: { onClose: () => void; propertyId: string; room: OwnerRoom }) {
  const { colors, type } = useTheme();
  const [markStatus, { isLoading }] = useMarkRoomStatusMutation();
  const [error, setError] = useState<string | null>(null);
  const occupied = room.occupiedCount > 0;
  const options: RoomStatus[] = ["VACANT", "MAINTENANCE"];

  async function apply(status: RoomStatus) {
    if (isLoading) {
      return;
    }
    setError(null);
    try {
      await markStatus({ propertyId, roomId: room.id, status }).unwrap();
      onClose();
    } catch {
      setError(
        occupied
          ? `This room has ${room.occupiedCount} active occupant${room.occupiedCount === 1 ? "" : "s"}. Exit or transfer them first.`
          : "Could not update the room status. Please try again.",
      );
    }
  }

  return (
    <ModalShell onClose={onClose} title={`Room ${room.roomNumber} status`}>
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        Occupied / partially occupied is set automatically from tenancies. You can mark a room vacant or under maintenance.
      </Text>

      {occupied ? (
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.danger,
            borderRadius: 12,
            borderWidth: 1,
            gap: spacing.xs,
            padding: spacing.md,
          }}
        >
          <Text style={[type.caption, { color: colors.danger, fontWeight: "800" }]} selectable>
            Room is occupied
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} selectable>
            {room.occupiedCount} active occupant{room.occupiedCount === 1 ? "" : "s"}. Vacate or move them out before marking this room
            vacant or under maintenance.
          </Text>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {options.map((status) => (
          <View key={status} style={{ flexDirection: "row" }}>
            <ActionButton
              disabled={isLoading || occupied || room.status === status}
              label={room.status === status ? `${humanizeToken(status)} (current)` : humanizeToken(status)}
              onPress={() => void apply(status)}
              variant={room.status === status ? "secondary" : "primary"}
            />
          </View>
        ))}
      </View>

      {error ? (
        <Text style={[type.caption, { color: colors.danger }]} selectable>
          {error}
        </Text>
      ) : null}
    </ModalShell>
  );
}

function RoomScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ flexShrink: 1 }}
    >
      {children}
    </ScrollView>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}
