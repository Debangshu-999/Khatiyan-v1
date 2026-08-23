import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
// Lucide has no staircase; MaterialCommunityIcons does, and is already in use.
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Bed,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Snowflake,
  Trash2,
  X,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { SheetShell } from "@/components/sheet-shell";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { FieldError } from "@/components/field-error";
import { errorMessage } from "@/features/forms/server-error";
import { isUnchanged } from "@/features/forms/unchanged";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { SkeletonCard } from "@/components/skeleton";
import { RoomCarousel } from "@/features/owner/room-carousel";
import {
  ActionButton,
  ChoiceButton,
  ConfirmDialog,
  FormInput,
  IconButton,
  formatMoneyPaise,
  humanizeToken,
  rupeesToPaise,
  ViewOnlyChip,
} from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  ROOM_CONDITIONINGS,
  ROOM_TYPES,
  useCreateRoomMutation,
  useCreateRoomsBulkMutation,
  useDeactivateRoomMutation,
  useListAllPropertyRoomsQuery,
  useListMyPropertiesQuery,
  useMarkRoomStatusMutation,
  useReactivateRoomMutation,
  useUpdateRoomMaintenanceMutation,
  useUpdateRoomMutation,
  type CreateRoomBulkPayload,
  type CreateRoomPayload,
  type OwnerProperty,
  type OwnerRoom,
  type RoomConditioning,
  type RoomStatus,
  type RoomType,
} from "@/store/services/property-api";
import { useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
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
  // Both of these are refused by the server, not by anything on screen.
  const reactivateErrors = useFormErrors<never>();
  const deactivateErrors = useFormErrors<never>();
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  // Adding and editing rooms is ROOMS at MANAGE.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const canManageRooms = canManageResource("ROOMS");

  // Includes deactivated rooms so the per-floor filters can offer them.
  const roomsQuery = useListAllPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const allRooms = roomsQuery.data ?? [];
  const rooms = allRooms.filter((room) => room.active);

  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const ownerId = selectedProperty?.ownerId ?? null;

  // Current tenancies drive the per-bed occupant grid on each room card.
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: false, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );
  const occupantsByRoom = useMemo(() => {
    const map = new Map<string, TenancySummary[]>();
    for (const tenancy of tenanciesQuery.data ?? []) {
      const existing = map.get(tenancy.roomId);
      if (existing) {
        existing.push(tenancy);
      } else {
        map.set(tenancy.roomId, [tenancy]);
      }
    }
    return map;
  }, [tenanciesQuery.data]);

  const toast = useToast();
  const [deactivateRoom] = useDeactivateRoomMutation();
  const [reactivateRoom] = useReactivateRoomMutation();

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<OwnerRoom | null>(null);
  const [statusRoom, setStatusRoom] = useState<OwnerRoom | null>(null);
  const [maintenanceEditRoom, setMaintenanceEditRoom] = useState<OwnerRoom | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OwnerRoom | null>(null);
  const [pendingReactivate, setPendingReactivate] = useState<OwnerRoom | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("active");

  const totalBeds = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const occupiedBeds = rooms.reduce((sum, room) => sum + room.occupiedCount, 0);
  const maintenanceCount = rooms.filter((room) => room.status === "MAINTENANCE").length;
  const occupiedRoomsCount = rooms.filter((room) => room.occupiedCount > 0).length;
  const floors = Array.from(new Set(allRooms.map((room) => room.floor ?? ""))).sort((left, right) => left.localeCompare(right));

  // Auto-select the first floor; fall back gracefully if the list changes.
  const activeFloor = selectedFloor != null && floors.includes(selectedFloor) ? selectedFloor : floors[0] ?? null;
  const floorAllRooms = activeFloor != null ? allRooms.filter((room) => (room.floor ?? "") === activeFloor) : [];
  const floorActiveCount = floorAllRooms.filter((room) => room.active && room.status !== "MAINTENANCE").length;
  const floorMaintenanceCount = floorAllRooms.filter((room) => room.active && room.status === "MAINTENANCE").length;
  const floorDeactivatedCount = floorAllRooms.filter((room) => !room.active).length;
  const visibleFloorRooms = floorAllRooms
    .filter((room) => matchesRoomFilter(room, roomFilter))
    // Ascending by room number, numerically aware so "2" < "10" < "101".
    .sort((left, right) => left.roomNumber.localeCompare(right.roomNumber, undefined, { numeric: true, sensitivity: "base" }));
  const floorActiveRooms = floorAllRooms.filter((room) => room.active);
  const floorBeds = floorActiveRooms.reduce((sum, room) => sum + room.capacity, 0);
  const floorOccupiedBeds = floorActiveRooms.reduce((sum, room) => sum + room.occupiedCount, 0);

  function confirmDeactivate() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target || !selectedProperty) {
      return;
    }
    void (async () => {
      try {
        await deactivateRoom({ propertyId: selectedProperty.id, roomId: target.id }).unwrap();
        toast.success(`Room ${target.roomNumber} deactivated.`);
      } catch (caught) {
        // The server refuses an occupied room outright. The call used to be
        // fired and forgotten, so that refusal — and the success — both landed
        // nowhere, and the room simply appeared to stay put for no reason.
        deactivateErrors.failFromServer(
          target.occupiedCount > 0
            ? "Failed to deactivate room, this room has active occupancy"
            : errorMessage(caught) || "Could not deactivate the room. Please try again.",
        );
      }
    })();
  }

  function confirmReactivate() {
    const target = pendingReactivate;
    setPendingReactivate(null);
    if (!target || !selectedProperty) {
      return;
    }
    void (async () => {
      try {
        await reactivateRoom({ propertyId: selectedProperty.id, roomId: target.id }).unwrap();
        toast.success(`Room ${target.roomNumber} reactivated.`);
      } catch {
        reactivateErrors.failFromServer("Could not reactivate the room. The room number may already be in use.");
      }
    })();
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        badge={!canManageRooms ? <ViewOnlyChip /> : null}
        eyebrow="Property"
        onBack={() => router.back()}
        title="Rooms"
        italicTail="and beds."
        subtitle="Floors, rooms and bed occupancy for this property."
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={BedDouble}
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
            <MetricTile label="Occupied / partial" value={String(occupiedRoomsCount)} hint={`${rooms.length - occupiedRoomsCount} fully vacant`} />
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={!canManageRooms} icon={Plus} label="Add room" onPress={() => setAddOpen(true)} />
            <ActionButton
              disabled={!canManageRooms}
              icon={Layers}
              label="Bulk add"
              onPress={() => setBulkOpen(true)}
              variant="secondary"
            />
          </View>

          {roomsQuery.isFetching && allRooms.length === 0 ? (
            <SkeletonCard />
          ) : allRooms.length === 0 ? (
            <EmptyState
              icon={BedDouble}
              title="No rooms yet"
              description="Add rooms one by one, or bulk-create a numbered range."
            />
          ) : (
            <>
              <FloorSelector active={activeFloor} floors={floors} onSelect={setSelectedFloor} />
              {activeFloor != null ? (
                <Section
                  title={activeFloor ? `Floor ${activeFloor}` : "Unassigned"}
                  trailing={
                    <FloorFilters
                      active={roomFilter}
                      counts={{ active: floorActiveCount, deactivated: floorDeactivatedCount, maintenance: floorMaintenanceCount }}
                      onSelect={setRoomFilter}
                    />
                  }
                >
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <MetricTile label="In service" value={String(floorActiveRooms.length)} hint={`${floorBeds} bed${floorBeds === 1 ? "" : "s"}`} tone="primary" />
                    <MetricTile label="Occupied beds" value={String(floorOccupiedBeds)} hint={`${floorBeds - floorOccupiedBeds} vacant`} />
                  </View>
                  {visibleFloorRooms.length === 0 ? (
                    <Text style={[type.caption, { color: colors.muted, paddingVertical: spacing.sm }]}>
                      No {roomFilter} rooms on this floor.
                    </Text>
                  ) : (
                    <RoomCarousel
                      rooms={visibleFloorRooms}
                      renderRoom={(room) => (
                        <RoomCard
                          canManage={canManageRooms}
                          room={room}
                          occupants={occupantsByRoom.get(room.id) ?? []}
                          canEditMaintenance={Boolean(
                            currentUserId && (currentUserId === room.maintenanceMarkedByUserId || currentUserId === ownerId),
                          )}
                          onDelete={() => setPendingDelete(room)}
                          onEdit={() => setEditRoom(room)}
                          onEditMaintenance={() => setMaintenanceEditRoom(room)}
                          onReactivate={() => setPendingReactivate(room)}
                          onStatus={() => setStatusRoom(room)}
                        />
                      )}
                    />
                  )}
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
      {maintenanceEditRoom && selectedProperty ? (
        <EditMaintenanceModal onClose={() => setMaintenanceEditRoom(null)} propertyId={selectedProperty.id} room={maintenanceEditRoom} />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          confirmLabel="Deactivate"
          destructive
          message={`Deactivate room ${pendingDelete.roomNumber}? It will no longer be available for new tenancies.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDeactivate}
          title="Deactivate room?"
        />
      ) : null}

      {pendingReactivate ? (
        <ConfirmDialog
          confirmLabel="Reactivate"
          message={`Reactivate room ${pendingReactivate.roomNumber}? It will come back as a vacant, available room.`}
          onCancel={() => setPendingReactivate(null)}
          onConfirm={confirmReactivate}
          title="Reactivate room?"
        />
      ) : null}
      {reactivateErrors.serverError ? <AlertModal message={reactivateErrors.serverError} onClose={reactivateErrors.dismissServerError} /> : null}
      {deactivateErrors.serverError ? <AlertModal message={deactivateErrors.serverError} onClose={deactivateErrors.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

type RoomFilter = "active" | "maintenance" | "deactivated";

function matchesRoomFilter(room: OwnerRoom, filter: RoomFilter) {
  if (filter === "deactivated") {
    return !room.active;
  }
  if (filter === "maintenance") {
    return room.active && room.status === "MAINTENANCE";
  }
  return room.active && room.status !== "MAINTENANCE";
}

// Compact full-date and date-time formatters  -  Hermes' Intl is limited, so we
// format by hand to keep maintenance timestamps readable across platforms.
function formatDate(iso: string | null | undefined) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}, ${hour12}:${minutes} ${period}`;
}

const ROOM_FILTERS: { key: RoomFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "maintenance", label: "Maint." },
  { key: "deactivated", label: "Off" },
];

// The per-floor Active / Maintenance / Deactivated filter chips with live counts,
// shown to the right of the floor header.
function FloorFilters({
  active,
  counts,
  onSelect,
}: {
  active: RoomFilter;
  counts: Record<RoomFilter, number>;
  onSelect: (filter: RoomFilter) => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
      {ROOM_FILTERS.map(({ key, label }) => {
        const selected = key === active;
        return (
          <AnimatedPressable
            accessibilityLabel={`${label} rooms: ${counts[key]}`}
            accessibilityRole="button"
            key={key}
            onPress={() => onSelect(key)}
            style={{
              alignItems: "center",
              backgroundColor: selected ? colors.primary : colors.surfaceSunken,
              borderColor: selected ? colors.primary : colors.border,
              borderCurve: "continuous",
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 4,
              paddingHorizontal: spacing.sm,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: selected ? colors.onPrimary : colors.muted, fontFamily: fonts.sansBold, fontSize: 11.5, }}>
              {label}
            </Text>
            <Text style={{ color: selected ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 11.5, }}>
              {counts[key]}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
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
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
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
        <MaterialCommunityIcons color={colors.kicker} name="stairs" size={19} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 15, }}>
          {floorLabel(active)}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
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
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, }}>
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
                        backgroundColor: selected ? colors.ink : colors.surfaceSunken,
                        borderColor: selected ? colors.ink : colors.border,
                        borderRadius: 12,
                        borderWidth: 1,
                        flexDirection: "row",
                        gap: spacing.sm,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.md,
                      }}
                    >
                      <Text style={{ color: selected ? colors.surface : colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 15, }}>
                        {floor ? `Floor ${floor}` : "Unassigned"}
                      </Text>
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

function shortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

// One seat in the room's bed grid. Occupied beds glow amber with the tenant's
// first name; vacant beds stay muted grey. Daily stays get a dashed border, a
// clock chip and the checkout date so short stays read differently at a glance.
function BedTile({ index, occupant }: { index: number; occupant: TenancySummary | null }) {
  const { colors, fonts, type } = useTheme();
  const daily = occupant?.billingType === "DAILY";
  const firstName = occupant?.tenantName?.trim().split(/\s+/)[0];

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: occupant ? colors.accentSoft : colors.surfaceSunken,
        borderColor: daily ? colors.accent : "transparent",
        borderRadius: 18,
        borderStyle: daily ? "dashed" : "solid",
        borderWidth: daily ? 1.5 : 1,
        flexBasis: "22%",
        flexGrow: 1,
        gap: 6,
        minWidth: 72,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: occupant ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.7)",
          borderRadius: 14,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <Bed color={occupant ? colors.accent : colors.muted} size={20} strokeWidth={2.2} />
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 3 }}>
        <Text style={[type.caption, { color: occupant ? colors.accent : colors.ink, fontWeight: "800" }]}>
          Bed {index + 1}
        </Text>
        {daily ? <Clock color={colors.accent} size={11} strokeWidth={2.4} /> : null}
      </View>
      {occupant ? (
        <>
          <Text
            numberOfLines={1}
            style={{ alignSelf: "stretch", color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12.5, textAlign: "center" }}
          >
            {firstName ?? "Tenant"}
          </Text>
          {daily && occupant.plannedEndDate ? (
            <Text style={{ color: colors.accent, fontFamily: fonts.sansBold, fontSize: 11, textAlign: "center" }}>
              Until {shortDate(occupant.plannedEndDate)}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12.5, }}>
          Vacant
        </Text>
      )}
    </View>
  );
}

function RoomCard({
  canManage,
  canEditMaintenance,
  occupants,
  onDelete,
  onEdit,
  onEditMaintenance,
  onReactivate,
  onStatus,
  room,
}: {
  canEditMaintenance: boolean;
  occupants: TenancySummary[];
  onDelete: () => void;
  onEdit: () => void;
  onEditMaintenance: () => void;
  onReactivate: () => void;
  onStatus: () => void;
  canManage: boolean;
  room: OwnerRoom;
}) {
  const { colors, fonts, type } = useTheme();
  const [showInfo, setShowInfo] = useState(false);
  const isAc = room.conditioning === "AC";
  const isDeactivated = !room.active;
  const isMaintenance = room.active && room.status === "MAINTENANCE";
  const statusLabel = isDeactivated ? "Deactivated" : humanizeToken(room.status);
  const statusTone = isDeactivated
    ? colors.muted
    : room.status === "OCCUPIED"
      ? colors.danger
      : room.status === "MAINTENANCE"
        ? colors.accent
        : room.status === "PARTIALLY_OCCUPIED"
          ? colors.primary
          : colors.successText;

  const untilText = formatDate(room.maintenanceUntil);
  const markedAtText = formatDateTime(room.maintenanceMarkedAt);

  // Fill beds in order: occupied first, the rest vacant up to the room capacity.
  const beds = Array.from({ length: room.capacity }, (_, index) => occupants[index] ?? null);

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.md, opacity: isDeactivated ? 0.55 : 1 }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Room
              </Text>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 30, letterSpacing: -1 }}>
                  {room.roomNumber}
                </Text>
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: isAc ? colors.primarySoft : colors.surfaceSunken,
                    borderRadius: 999,
                    flexDirection: "row",
                    gap: 4,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 4,
                  }}
                >
                  {isAc ? <Snowflake color={colors.primary} size={13} strokeWidth={2.4} /> : null}
                  <Text style={[type.caption, { color: isAc ? colors.primaryDeep : colors.muted, fontWeight: "800" }]}>
                    {isAc ? "AC" : "Non-AC"}
                  </Text>
                </View>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
                <Text style={[type.caption, { color: statusTone, fontWeight: "900" }]}>
                  {statusLabel}
                </Text>
                {isMaintenance ? (
                  <AnimatedPressable
                    accessibilityLabel="Maintenance details"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setShowInfo(true)}
                  >
                    <Info color={colors.accent} size={16} strokeWidth={2.4} />
                  </AnimatedPressable>
                ) : null}
              </View>
              <Text style={[type.caption, { color: colors.muted }]}>
                {humanizeToken(room.roomType)}  -  {room.capacity} bed{room.capacity === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {beds.map((occupant, index) => (
              <BedTile index={index} key={index} occupant={occupant} />
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Rent" value={formatMoneyPaise(room.baseRentPaise)} hint="Per bed/month" />
            <MetricTile label="Vacancy" value={String(room.availableVacancies)} hint={`${room.occupiedCount}/${room.capacity} filled`} tone={room.availableVacancies > 0 ? "primary" : "default"} />
          </View>
        </View>

        {isDeactivated ? (
          <View style={{ flexDirection: "row" }}>
            <ActionButton disabled={!canManage} icon={RotateCcw} label="Reactivate" onPress={onReactivate} />
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={!canManage} icon={Pencil} label="Edit" onPress={onEdit} variant="secondary" />
            <ActionButton disabled={!canManage} icon={Settings2} label="Status" onPress={onStatus} variant="secondary" />
            <IconButton
              accessibilityLabel="Deactivate room"
              bordered
              disabled={!canManage}
              icon={Trash2}
              onPress={onDelete}
            />
          </View>
        )}
      </View>

      {showInfo ? (
        <Modal animationType="fade" onRequestClose={() => setShowInfo(false)} transparent visible>
          <Pressable
            onPress={() => setShowInfo(false)}
            style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderCurve: "continuous",
                borderRadius: 20,
                borderWidth: 1,
                gap: spacing.md,
                maxWidth: 420,
                padding: spacing.lg,
                width: "100%",
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, }}>
                  Room {room.roomNumber}  -  Maintenance
                </Text>
                <IconButton accessibilityLabel="Close" icon={X} onPress={() => setShowInfo(false)} />
              </View>

              <InfoLine label="Reason" value={room.maintenanceReason ?? " - "} />
              {untilText ? <InfoLine label="Until" value={untilText} /> : <InfoLine label="Until" value="No end date set" />}
              <InfoLine label="Marked by" value={room.maintenanceMarkedByName ?? " - "} />
              {markedAtText ? <InfoLine label="On" value={markedAtText} /> : null}

              {canEditMaintenance ? (
                <View style={{ flexDirection: "row" }}>
                  <ActionButton
                    icon={Pencil}
                    label="Edit details"
                    onPress={() => {
                      setShowInfo(false);
                      onEditMaintenance();
                    }}
                  />
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Card>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.caption, { color: colors.kicker, fontWeight: "700" }]}>
        {label}
      </Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 14.5, }}>
        {value}
      </Text>
    </View>
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
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
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

/**
 * How many beds a type fixes, or null when it leaves capacity to the owner.
 * Shown on each option because picking a type also rewrites the capacity field,
 * which is otherwise a silent edit two rows further down.
 */
function roomTypeBeds(value: RoomType) {
  const capacity = CAPACITY_BY_TYPE[value];
  return capacity != null ? `${capacity} bed${capacity === 1 ? "" : "s"}` : "Capacity you set";
}

/**
 * Occupancy picker for a room, in the same shape as the floor picker above.
 *
 * <p>A pill row was wrong for six options: they wrapped across three lines,
 * which made the room type the visually heaviest thing in a form where it is
 * one field among eight, and left no room to say what each type does to the
 * capacity field.
 */
function RoomTypePicker({ onChange, value }: { onChange: (value: RoomType) => void; value: RoomType }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
        Room type
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
        <BedDouble color={colors.kicker} size={19} strokeWidth={2} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 15, }}>
          {humanizeToken(value)}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
          {roomTypeBeds(value)}
        </Text>
        <ChevronDown color={colors.kicker} size={18} strokeWidth={2.2} />
      </Pressable>

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Choose room type">
          <View style={{ gap: spacing.xs }}>
            {ROOM_TYPES.map((option) => {
              const selected = option === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option}
                  onPress={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  style={{
                    alignItems: "center",
                    backgroundColor: selected ? colors.ink : colors.surfaceSunken,
                    borderColor: selected ? colors.ink : colors.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.md,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: selected ? colors.surface : colors.ink, fontFamily: fonts.sansBold, fontSize: 15, }}>
                      {humanizeToken(option)}
                    </Text>
                    <Text style={[type.caption, { color: selected ? colors.surface : colors.muted, opacity: selected ? 0.75 : 1 }]}>
                      {roomTypeBeds(option)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </SheetShell>
      ) : null}
    </View>
  );
}

function RoomFieldset({
  errors,
  form,
  onClearField,
  setForm,
  showPrefix = true,
}: {
  errors?: Partial<Record<RoomField, string>>;
  form: RoomFormState;
  /** Clears one field's error as it is edited, releasing the submit gate. */
  onClearField?: (field: RoomField) => void;
  setForm: (patch: Partial<RoomFormState>) => void;
  showPrefix?: boolean;
}) {
  const edit = (field: RoomField, patch: Partial<RoomFormState>) => {
    setForm(patch);
    onClearField?.(field);
  };

  return (
    <>
      {showPrefix ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormInput label="Prefix (optional)" onChangeText={(value) => setForm({ prefix: value })} placeholder="R, A-..." value={form.prefix} />
          </View>
          <View style={{ flex: 2 }}>
            <FormInput
              error={errors?.roomNumber}
              label="Room number"
              onChangeText={(value) => edit("roomNumber", { roomNumber: value })}
              placeholder="101"
              value={form.roomNumber}
            />
          </View>
        </View>
      ) : (
        <FormInput
          error={errors?.roomNumber}
          label="Room number"
          onChangeText={(value) => edit("roomNumber", { roomNumber: value })}
          placeholder="101"
          value={form.roomNumber}
        />
      )}
      <FormInput
        error={errors?.floor}
        label="Floor"
        onChangeText={(value) => edit("floor", { floor: value })}
        placeholder="Ground, 1, 2..."
        value={form.floor}
      />
      <RoomTypePicker onChange={(value) => setForm(roomTypePatch(value))} value={form.roomType} />
      {/* Every type but Dormitory fixes its own bed count, so the field was
          asking for something already decided — and an owner could contradict
          it, leaving a "Single" with three beds. Dormitory has no fixed size,
          so it is the one type that still has to be told. */}
      {form.roomType === "DORMITORY" ? (
        <FormInput
          error={errors?.capacity}
          keyboardType="number-pad"
          label="Beds in this dormitory"
          onChangeText={(value) => edit("capacity", { capacity: value })}
          placeholder="8"
          value={form.capacity}
        />
      ) : null}
      <ChoiceRow label="Conditioning" onChange={(value: RoomConditioning) => setForm({ conditioning: value })} options={ROOM_CONDITIONINGS} value={form.conditioning} />
      <FormInput
        error={errors?.rent}
        keyboardType="decimal-pad"
        label="Base rent"
        onChangeText={(value) => edit("rent", { rent: value })}
        placeholder="0"
        prefix="₹"
        value={form.rent}
      />
    </>
  );
}

/** The fields the room form can complain about. */
export type RoomField = "roomNumber" | "floor" | "capacity" | "rent";

/**
 * Validates the room form and builds its payload.
 *
 * <p>Returns EVERY problem, each keyed to the field that owns it. It used to
 * return the first as a bare string, which meant a form with three empty fields
 * was corrected one submit at a time, and the message named a field the reader
 * then had to go find.
 *
 * <p>`payload` is null exactly when `errors` is non-empty.
 */
function buildRoomPayload(form: RoomFormState): {
  errors: Partial<Record<RoomField, string>>;
  payload: CreateRoomPayload | null;
} {
  const errors: Partial<Record<RoomField, string>> = {};

  if (!form.roomNumber.trim()) {
    errors.roomNumber = "Enter a room number.";
  }
  if (!form.floor.trim()) {
    errors.floor = "Enter a floor.";
  }

  const capacity = Number(form.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    errors.capacity = "Capacity must be at least 1.";
  }

  const baseRentPaise = form.rent.trim() ? rupeesToPaise(form.rent) : null;
  if (!form.rent.trim()) {
    errors.rent = "Enter the base rent.";
  } else if (baseRentPaise == null) {
    errors.rent = "Enter a valid base rent.";
  }

  if (Object.keys(errors).length > 0 || baseRentPaise == null) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: {
      baseRentPaise,
      capacity,
      conditioning: form.conditioning,
      floor: form.floor.trim(),
      roomNumber: `${form.prefix.trim()}${form.roomNumber.trim()}`,
      roomType: form.roomType,
    },
  };
}

// Reports the outcome of a bulk create: the backend silently skips room numbers
// that already exist, so diff the requested numbers against what came back.
function bulkResultMessage(expected: string[], created: OwnerRoom[]): string {
  const createdSet = new Set(created.map((room) => room.roomNumber));
  const skipped = expected.filter((number) => !createdSet.has(number));
  const createdCount = created.length;

  if (skipped.length === 0) {
    return `All ${createdCount} room${createdCount === 1 ? "" : "s"} created.`;
  }
  if (createdCount === 0) {
    return `No rooms created  -  ${skipped.length} already exist: ${skipped.join(", ")}.`;
  }
  return `Created ${createdCount} room${createdCount === 1 ? "" : "s"}. Skipped ${skipped.length} (already exist): ${skipped.join(", ")}.`;
}

function ModalShell({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingBottom: insets.bottom + spacing.md,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
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
  const toast = useToast();
  const [form, setFormState] = useState<RoomFormState>(emptyForm);
  const setForm = (patch: Partial<RoomFormState>) => setFormState((current) => ({ ...current, ...patch }));
  const fieldErrors = useFormErrors<RoomField>();
  const [pendingPayload, setPendingPayload] = useState<CreateRoomPayload | null>(null);
  const [createRoom, { isLoading }] = useCreateRoomMutation();

  // Validate up front; a valid form opens the confirmation dialog instead of
  // submitting straight away.
  function review() {
    if (isLoading) {
      return;
    }
    const { errors, payload } = buildRoomPayload(form);
    if (!fieldErrors.validate(errors) || !payload) {
      return;
    }
    setPendingPayload(payload);
  }

  async function confirm() {
    if (!pendingPayload) {
      return;
    }
    const payload = pendingPayload;
    setPendingPayload(null);
    try {
      await createRoom({ payload, propertyId }).unwrap();
      onClose();
      toast.success(`Room ${payload.roomNumber} created.`);
    } catch (caught) {
      // Stay open: the room number is the likely culprit and it is on screen.
      fieldErrors.failFromServer(errorMessage(caught));
    }
  }

  return (
    <ModalShell onClose={onClose} title="Add room">
      <RoomScroll>
        <RoomFieldset errors={fieldErrors.errors} form={form} onClearField={fieldErrors.clearField} setForm={setForm} />
      </RoomScroll>
      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={isLoading || fieldErrors.blocked}
          label={isLoading ? "Creating" : "Create room"}
          onPress={review}
        />
      </View>

      {fieldErrors.serverError ? (
        <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} />
      ) : null}

      {pendingPayload ? (
        <ConfirmDialog
          confirmLabel="Yes, create"
          message={`Create room ${pendingPayload.roomNumber} on floor ${pendingPayload.floor} at ${formatMoneyPaise(pendingPayload.baseRentPaise)} per bed/month?`}
          onCancel={() => setPendingPayload(null)}
          onConfirm={() => void confirm()}
          title="Create this room?"
        />
      ) : null}
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
  const fieldErrors = useFormErrors<RoomField>();
  const toast = useToast();
  const [updateRoom, { isLoading }] = useUpdateRoomMutation();

  // What the room held when the sheet opened, for the no-changes guard.
  const initial = {
    capacity: String(room.capacity),
    conditioning: room.conditioning,
    floor: room.floor ?? "",
    rent: String(Math.round(room.baseRentPaise / 100)),
    roomNumber: room.roomNumber,
    roomType: room.roomType,
  };

  async function submit() {
    if (isLoading) {
      return;
    }
    const { errors, payload } = buildRoomPayload(form);
    if (!fieldErrors.validate(errors) || !payload) {
      return;
    }

    const { prefix: _prefix, ...current } = form;
    if (isUnchanged(initial, current)) {
      toast.warning("No changes have been made.");
      return;
    }

    try {
      await updateRoom({ payload, propertyId, roomId: room.id }).unwrap();
      onClose();
      toast.success(`Room ${payload.roomNumber} updated.`);
    } catch (caught) {
      fieldErrors.failFromServer(errorMessage(caught));
    }
  }

  return (
    <ModalShell onClose={onClose} title={`Edit room ${room.roomNumber}`}>
      <RoomScroll>
        <RoomFieldset
          errors={fieldErrors.errors}
          form={form}
          onClearField={fieldErrors.clearField}
          setForm={setForm}
          showPrefix={false}
        />
      </RoomScroll>
      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={isLoading || fieldErrors.blocked}
          label={isLoading ? "Saving" : "Save changes"}
          onPress={() => void submit()}
        />
      </View>

      {fieldErrors.serverError ? (
        <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} />
      ) : null}
    </ModalShell>
  );
}

type BulkMode = "range" | "custom";

/** What a closed custom-list row shows in place of its form. */
function customRoomSummary(room: RoomFormState) {
  const number = `${room.prefix.trim()}${room.roomNumber.trim()}`.trim();
  const beds = Number(room.capacity);
  return [
    number || "No number yet",
    humanizeToken(room.roomType),
    Number.isInteger(beds) && beds > 0 ? `${beds} bed${beds === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function BulkRoomModal({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const [mode, setMode] = useState<BulkMode>("range");

  // Serial-range state.
  const [prefix, setPrefix] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [form, setFormState] = useState<RoomFormState>(emptyForm);
  const setForm = (patch: Partial<RoomFormState>) => setFormState((current) => ({ ...current, ...patch }));

  // Custom-list state.
  const [customRooms, setCustomRooms] = useState<RoomFormState[]>([{ ...emptyForm }]);
  // One row open at a time. Ten rooms of open form is a wall to scroll past,
  // and the row being filled loses its own heading somewhere above the fold.
  // -1 means every row is closed.
  const [expandedRow, setExpandedRow] = useState(0);
  const updateCustom = (index: number, patch: Partial<RoomFormState>) =>
    setCustomRooms((current) => current.map((room, i) => (i === index ? { ...room, ...patch } : room)));
  const addCustom = () => {
    // Length before the append, so the new row is the one that opens.
    setExpandedRow(customRooms.length);
    setCustomRooms((current) => [...current, { ...emptyForm }]);
  };
  const removeCustom = (index: number) => {
    setCustomRooms((current) => current.filter((_, i) => i !== index));
    // Row errors are keyed by index, and removing a row shifts every index
    // after it, so a kept error would then be pointing at the wrong room.
    setRowErrors({});
    setExpandedRow((current) => (current === index ? -1 : current > index ? current - 1 : current));
  };

  const fieldErrors = useFormErrors<RoomField | "range" | "rooms">();
  // The repeater validates N rooms, so an error has to say WHICH row it means.
  // A single form-level line naming "Room 3" made the reader count cards.
  const [rowErrors, setRowErrors] = useState<Record<number, Partial<Record<RoomField, string>>>>({});
  const [pending, setPending] = useState<{ count: number; expected: string[]; payload: CreateRoomBulkPayload } | null>(null);
  const toast = useToast();
  const [createRoomsBulk, { isLoading }] = useCreateRoomsBulkMutation();

  const startNumber = Number(start);
  const endNumber = Number(end);
  const rangeCount = Number.isInteger(startNumber) && Number.isInteger(endNumber) && endNumber >= startNumber ? endNumber - startNumber + 1 : 0;
  const submitLabel = mode === "range" ? `Create ${rangeCount || ""} room${rangeCount === 1 ? "" : "s"}`.trim() : `Create ${customRooms.length} room${customRooms.length === 1 ? "" : "s"}`;

  // Validate and build the request, returning what would be created. Returns
  // null after surfacing an inline error so the modal stays open to fix it.
  function prepareRange(): { count: number; expected: string[]; payload: CreateRoomBulkPayload } | null {
    const capacity = Number(form.capacity);
    const baseRentPaise = rupeesToPaise(form.rent);
    const problems = {
      ...(Number.isInteger(startNumber) && Number.isInteger(endNumber) && endNumber >= startNumber
        ? {}
        : { range: "Enter a valid start and end number." }),
      ...(form.floor.trim() ? {} : { floor: "Enter a floor." }),
      ...(Number.isInteger(capacity) && capacity >= 1 ? {} : { capacity: "Capacity must be at least 1." }),
      ...(baseRentPaise == null ? { rent: "Enter a valid base rent." } : {}),
    };
    if (!fieldErrors.validate(problems) || baseRentPaise == null) {
      return null;
    }
    const expected: string[] = [];
    for (let number = startNumber; number <= endNumber; number += 1) {
      expected.push(`${prefix.trim()}${number}`);
    }
    return {
      count: expected.length,
      expected,
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
    };
  }

  function prepareCustom(): { count: number; expected: string[]; payload: CreateRoomBulkPayload } | null {
    const rooms: CreateRoomPayload[] = [];
    const foundRowErrors: Record<number, Partial<Record<RoomField, string>>> = {};

    // Every row checked, not just up to the first bad one — otherwise a sheet
    // of ten rooms is corrected ten submits at a time.
    customRooms.forEach((room, index) => {
      const { errors, payload } = buildRoomPayload(room);
      if (payload) {
        rooms.push(payload);
      } else {
        foundRowErrors[index] = errors;
      }
    });

    setRowErrors(foundRowErrors);
    const badRows = Object.keys(foundRowErrors);
    if (badRows.length > 0) {
      // A closed row hides its own errors, so open the first one that failed
      // rather than blocking submit with nothing visible to fix.
      setExpandedRow(Number(badRows[0]));
      return null;
    }
    if (rooms.length === 0) {
      fieldErrors.validate({ rooms: "Add at least one room." });
      return null;
    }
    return { count: rooms.length, expected: rooms.map((room) => room.roomNumber), payload: { rooms } };
  }

  function review() {
    if (isLoading) {
      return;
    }
    const prepared = mode === "range" ? prepareRange() : prepareCustom();
    if (prepared) {
      setPending(prepared);
    }
  }

  async function confirm() {
    if (!pending) {
      return;
    }
    const { expected, payload } = pending;
    setPending(null);
    try {
      const created = await createRoomsBulk({ payload, propertyId }).unwrap();
      onClose();
      toast.success(bulkResultMessage(expected, created));
    } catch (caught) {
      fieldErrors.failFromServer(errorMessage(caught) || "Could not create rooms. Please try again.");
    }
  }

  return (
    <ModalShell onClose={onClose} title="Bulk add rooms">
      <RoomScroll>
        <View style={{ gap: spacing.xs }}>
          <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
            Method
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            <ChoiceButton active={mode === "range"} label="Serial range" onPress={() => setMode("range")} />
            <ChoiceButton active={mode === "custom"} label="Custom list" onPress={() => setMode("custom")} />
          </View>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {mode === "range"
              ? "Generate a numbered range of identical rooms."
              : "Add a list of rooms, each with its own details."}
          </Text>
        </View>

        {mode === "range" ? (
          <>
            <FormInput label="Prefix (optional)" onChangeText={setPrefix} placeholder="R, A-..." value={prefix} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <FormInput keyboardType="number-pad" label="Start number" onChangeText={setStart} placeholder="101" value={start} />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput keyboardType="number-pad" label="End number" onChangeText={setEnd} placeholder="110" value={end} />
              </View>
            </View>
            <FormInput label="Floor" onChangeText={(value) => setForm({ floor: value })} placeholder="Ground, 1, 2..." value={form.floor} />
            <RoomTypePicker onChange={(value) => setForm(roomTypePatch(value))} value={form.roomType} />
            {form.roomType === "DORMITORY" ? (
              <FormInput
                error={fieldErrors.errors.capacity}
                keyboardType="number-pad"
                label="Beds in this dormitory"
                onChangeText={(value) => setForm({ capacity: value })}
                placeholder="8"
                value={form.capacity}
              />
            ) : null}
            <ChoiceRow label="Conditioning" onChange={(value: RoomConditioning) => setForm({ conditioning: value })} options={ROOM_CONDITIONINGS} value={form.conditioning} />
            <FormInput keyboardType="decimal-pad" label="Base rent" onChangeText={(value) => setForm({ rent: value })} placeholder="0" prefix="₹" value={form.rent} />
            {rangeCount > 0 ? (
              <Text style={[type.caption, { color: colors.primary }]}>
                Will create {rangeCount} room{rangeCount === 1 ? "" : "s"}{prefix.trim() ? ` (${prefix.trim()}${startNumber}...${prefix.trim()}${endNumber})` : ""}.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {customRooms.map((room, index) => {
              const expanded = expandedRow === index;
              const failed = Boolean(rowErrors[index]);
              return (
                <View
                  key={index}
                  style={{
                    borderColor: failed && !expanded ? colors.danger : colors.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    gap: expanded ? spacing.md : 0,
                    padding: spacing.md,
                  }}
                >
                  <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => setExpandedRow(expanded ? -1 : index)}
                      style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16, letterSpacing: -0.2 }}>
                          Room {index + 1}
                        </Text>
                        {/* A closed row has to be identifiable without opening
                            it, so the summary stands in for the form. */}
                        {expanded ? null : (
                          <Text numberOfLines={1} style={[type.caption, { color: failed ? colors.danger : colors.muted }]}>
                            {failed ? "Needs attention" : customRoomSummary(room)}
                          </Text>
                        )}
                      </View>
                      {expanded ? (
                        <ChevronUp color={colors.muted} size={18} strokeWidth={2.2} />
                      ) : (
                        <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
                      )}
                    </Pressable>
                    {customRooms.length > 1 ? (
                      <IconButton accessibilityLabel={`Remove room ${index + 1}`} icon={Trash2} onPress={() => removeCustom(index)} />
                    ) : null}
                  </View>
                  {expanded ? (
                    <RoomFieldset
                      errors={rowErrors[index]}
                      form={room}
                      onClearField={(field) =>
                        setRowErrors((current) => {
                          if (!current[index]?.[field]) {
                            return current;
                          }
                          const next = { ...current, [index]: { ...current[index] } };
                          delete next[index][field];
                          return next;
                        })
                      }
                      setForm={(patch) => updateCustom(index, patch)}
                    />
                  ) : null}
                </View>
              );
            })}
            <ActionButton icon={Plus} label="Add another room" onPress={addCustom} variant="secondary" />
          </>
        )}

        {/* Range bounds and "add at least one room" have no single input to sit
            under, so they stay here — beneath the controls they describe. */}
        <FieldError message={fieldErrors.errors.range ?? fieldErrors.errors.rooms} />
      </RoomScroll>
      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={isLoading || fieldErrors.blocked || Object.keys(rowErrors).length > 0}
          label={isLoading ? "Creating" : submitLabel}
          onPress={review}
        />
      </View>

      {fieldErrors.serverError ? (
        <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} />
      ) : null}

      {pending ? (
        <ConfirmDialog
          confirmLabel="Yes, create"
          message={`Create ${pending.count} room${pending.count === 1 ? "" : "s"}? Room numbers that already exist will be skipped.`}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
          title="Create these rooms?"
        />
      ) : null}
    </ModalShell>
  );
}

function StatusModal({ onClose, propertyId, room }: { onClose: () => void; propertyId: string; room: OwnerRoom }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const [markStatus, { isLoading }] = useMarkRoomStatusMutation();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState<Date | null>(null);
  const fieldErrors = useFormErrors<"reason">();
  const occupied = room.occupiedCount > 0;
  const isMaintenance = room.status === "MAINTENANCE";

  const occupiedMessage = `This room has ${room.occupiedCount} active occupant${room.occupiedCount === 1 ? "" : "s"}. Exit or transfer them first.`;

  async function takeOffMaintenance() {
    if (isLoading) {
      return;
    }
    try {
      await markStatus({ propertyId, roomId: room.id, status: "VACANT" }).unwrap();
      onClose();
      toast.success(`Room ${room.roomNumber} taken off maintenance.`);
    } catch (caught) {
      fieldErrors.failFromServer(occupied ? occupiedMessage : errorMessage(caught));
    }
  }

  async function startMaintenance() {
    if (isLoading) {
      return;
    }
    if (!reason.trim()) {
      fieldErrors.validate({ reason: "Enter a maintenance reason." });
      return;
    }
    try {
      await markStatus({
        propertyId,
        reason: reason.trim(),
        roomId: room.id,
        status: "MAINTENANCE",
        until: until ? until.toISOString() : null,
      }).unwrap();
      onClose();
      toast.success(`Room ${room.roomNumber} marked under maintenance.`);
    } catch (caught) {
      fieldErrors.failFromServer(occupied ? occupiedMessage : errorMessage(caught));
    }
  }

  return (
    <ModalShell onClose={onClose} title={`Room ${room.roomNumber} status`}>
      <RoomScroll>
        <Text style={[type.caption, { color: colors.muted }]}>
          Occupied / partially occupied is set automatically from tenancies. You can mark a vacant room under maintenance or bring it back.
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
            <Text style={[type.caption, { color: colors.danger, fontWeight: "800" }]}>
              Room is occupied
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {room.occupiedCount} active occupant{room.occupiedCount === 1 ? "" : "s"}. Vacate or move them out before marking this room
              under maintenance.
            </Text>
          </View>
        ) : isMaintenance ? (
          <>
            <Text style={[type.caption, { color: colors.muted }]}>
              This room is under maintenance. Take it off to make it available again. To change the reason or end date, use the info (i)
              button on the room card.
            </Text>
            <View style={{ flexDirection: "row" }}>
              <ActionButton disabled={isLoading} label="Take off maintenance" onPress={() => void takeOffMaintenance()} />
            </View>
          </>
        ) : (
          <>
            <FormInput
              error={fieldErrors.errors.reason}
              label="Maintenance reason"
              onChangeText={(next) => {
                setReason(next);
                fieldErrors.clearField("reason");
              }}
              placeholder="e.g. Repainting, plumbing repair"
              value={reason}
            />
            <MaintenanceUntilField onChange={setUntil} value={until} />
            <View style={{ flexDirection: "row" }}>
              <ActionButton
                disabled={isLoading || fieldErrors.blocked}
                label={isLoading ? "Saving" : "Mark under maintenance"}
                onPress={() => void startMaintenance()}
              />
            </View>
          </>
        )}

      </RoomScroll>

      {fieldErrors.serverError ? (
        <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} />
      ) : null}
    </ModalShell>
  );
}

function EditMaintenanceModal({ onClose, propertyId, room }: { onClose: () => void; propertyId: string; room: OwnerRoom }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const [updateMaintenance, { isLoading }] = useUpdateRoomMaintenanceMutation();
  const [reason, setReason] = useState(room.maintenanceReason ?? "");
  const [until, setUntil] = useState<Date | null>(room.maintenanceUntil ? new Date(room.maintenanceUntil) : null);
  const fieldErrors = useFormErrors<"reason">();

  async function submit() {
    if (isLoading) {
      return;
    }
    if (!reason.trim()) {
      fieldErrors.validate({ reason: "Enter a maintenance reason." });
      return;
    }
    try {
      await updateMaintenance({
        propertyId,
        reason: reason.trim(),
        roomId: room.id,
        until: until ? until.toISOString() : null,
      }).unwrap();
      onClose();
      toast.success(`Maintenance details updated for room ${room.roomNumber}.`);
    } catch (caught) {
      fieldErrors.failFromServer(errorMessage(caught));
    }
  }

  return (
    <ModalShell onClose={onClose} title={`Edit maintenance  -  Room ${room.roomNumber}`}>
      <RoomScroll>
        <FormInput
          error={fieldErrors.errors.reason}
          label="Maintenance reason"
          onChangeText={(next) => {
            setReason(next);
            fieldErrors.clearField("reason");
          }}
          placeholder="e.g. Repainting, plumbing repair"
          value={reason}
        />
        <MaintenanceUntilField onChange={setUntil} value={until} />
      </RoomScroll>
      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={isLoading || fieldErrors.blocked}
          label={isLoading ? "Saving" : "Save details"}
          onPress={() => void submit()}
        />

        {fieldErrors.serverError ? (
          <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} />
        ) : null}
      </View>
    </ModalShell>
  );
}

// Optional "maintenance until" date field shared by the status + edit modals.
function MaintenanceUntilField({ onChange, value }: { onChange: (value: Date | null) => void; value: Date | null }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: colors.inkSoft }]}>
        Maintenance until (optional)
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <AnimatedPressable
          onPress={() => setOpen(true)}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            flex: 1,
            flexDirection: "row",
            gap: spacing.sm,
            minHeight: 50,
            paddingHorizontal: spacing.md,
          }}
        >
          <CalendarDays color={colors.primary} size={18} strokeWidth={2.1} />
          <Text style={{ color: value ? colors.ink : colors.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, }}>
            {value ? (formatDate(value.toISOString()) ?? "No end date") : "No end date"}
          </Text>
        </AnimatedPressable>
        {value ? <IconButton accessibilityLabel="Clear date" bordered icon={X} onPress={() => onChange(null)} /> : null}
      </View>
      {open ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={new Date()}
          mode="date"
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            if (Platform.OS !== "ios") {
              setOpen(false);
            }
            if (event.type === "set" && selected) {
              onChange(selected);
            }
          }}
          value={value ?? new Date()}
        />
      ) : null}
      {open && Platform.OS === "ios" ? (
        <View style={{ flexDirection: "row" }}>
          <ActionButton label="Done" onPress={() => setOpen(false)} variant="secondary" />
        </View>
      ) : null}
    </View>
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
