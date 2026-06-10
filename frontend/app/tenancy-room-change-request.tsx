import { useMemo, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, BedDouble } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import type { TenantRoomSummary } from "@/store/services/tenancy-api";
import { useCreateRoomChangeRequestMutation, useGetMyActiveTenancyQuery, useListMyActivePropertyRoomsQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const UNASSIGNED_FLOOR = "Unassigned floor";

export default function TenancyRoomChangeRequestScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const roomsQuery = useListMyActivePropertyRoomsQuery();
  const [createRoomChangeRequest, createRoomChangeState] = useCreateRoomChangeRequestMutation();
  const currentRoomId = activeTenancyQuery.data?.room.id;
  const activeTenancyId = activeTenancyQuery.data?.tenancy.id;
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(activeTenancyId ?? "", { skip: !activeTenancyId });
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rooms = useMemo(() => {
    const roomMap = new Map<string, TenantRoomSummary>();

    for (const room of roomsQuery.data ?? []) {
      roomMap.set(room.id, room);
    }

    if (activeTenancyQuery.data?.room) {
      roomMap.set(activeTenancyQuery.data.room.id, activeTenancyQuery.data.room);
    }

    return Array.from(roomMap.values()).sort(compareRooms);
  }, [activeTenancyQuery.data?.room, roomsQuery.data]);
  const floors = useMemo(() => {
    const uniqueFloors = Array.from(new Set(rooms.map((room) => floorKey(room.floor))));
    return uniqueFloors.sort(compareFloorLabels);
  }, [rooms]);
  const resolvedFloor = selectedFloor ?? floors[0] ?? null;
  const roomsForFloor = rooms.filter((room) => floorKey(room.floor) === resolvedFloor);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedRoomState = selectedRoom ? roomActionState(selectedRoom, currentRoomId) : null;
  const currentCycle = useMemo(() => {
    const cycles = [...(cyclesQuery.data ?? [])].sort((left, right) => right.cycleNumber - left.cycleNumber);
    return cycles.find((cycle) => cycle.status !== "PAID" && cycle.status !== "CANCELLED") ?? cycles[0] ?? null;
  }, [cyclesQuery.data]);

  const selectRoom = (room: TenantRoomSummary) => {
    setSelectedRoomId(room.id);
    const state = roomActionState(room, currentRoomId);
    setError(state.kind === "error" ? state.message : null);
  };

  const submit = async () => {
    if (!selectedRoom) {
      setError("Select a target room.");
      return;
    }

    const state = roomActionState(selectedRoom, currentRoomId);
    if (state.kind === "error") {
      setError(state.message);
      return;
    }

    if (!reason.trim()) {
      setError("Add a reason for the room change request.");
      return;
    }

    try {
      await createRoomChangeRequest({
        reason: reason.trim(),
        targetRoomId: selectedRoom.id,
      }).unwrap();
      router.replace({ pathname: "/tenancy", params: { roomChangeRequested: "1" } });
    } catch {
      setError("Could not submit room change request. Please check room availability and try again.");
    }
  };

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="REQUEST"
        title="Room change"
        italicTail="request."
        subtitle="Select a floor, choose an available room and share why you want to move."
        trailing={<BackButton onPress={() => router.back()} />}
      />

      {activeTenancyQuery.isFetching || roomsQuery.isFetching ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : roomsQuery.error ? (
        <EmptyState
          icon={BedDouble}
          eyebrow="Room data"
          title="Could not load rooms"
          description="Refresh after the backend is running with the latest tenant room endpoint."
        />
      ) : !activeTenancyQuery.data ? (
        <EmptyState
          icon={BedDouble}
          eyebrow="No active tenancy"
          title="No current stay"
          description="Room change requests can be raised only from an active tenancy."
        />
      ) : (
        <Card>
          <View style={{ gap: spacing.lg }}>
            <Card tone="sunken">
              <Text style={[type.body, { color: colors.muted }]} selectable>
                Current room: {activeTenancyQuery.data.room.roomNumber}
                {activeTenancyQuery.data.room.floor ? ` · ${formatFloor(activeTenancyQuery.data.room.floor)}` : ""}
              </Text>
            </Card>

            <SelectionGroup
              label="Floor"
              options={floors}
              selected={resolvedFloor}
              onSelect={(floor) => {
                setSelectedFloor(floor);
                setSelectedRoomId(null);
                setError(null);
              }}
            />

            <RoomSelectionGroup
              currentRoomId={currentRoomId}
              rooms={roomsForFloor}
              selectedRoomId={selectedRoomId}
              onSelect={selectRoom}
            />

            {selectedRoom ? <RoomDetailsCard room={selectedRoom} state={selectedRoomState} /> : null}

            <CycleRuleCard cycleEndDate={currentCycle?.periodEndDate ?? null} loading={cyclesQuery.isFetching} />

            <FormField
              label="Reason"
              maxLength={500}
              multiline
              onChangeText={(value) => {
                setReason(value);
                setError(null);
              }}
              placeholder="Why do you want to change rooms?"
              value={reason}
            />

            {error ? (
              <Text style={[type.body, { color: colors.danger, fontWeight: "700" }]} selectable>
                {error}
              </Text>
            ) : null}

            <AnimatedPressable
              accessibilityRole="button"
              onPress={submit}
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderRadius: 14,
                justifyContent: "center",
                minHeight: 52,
                opacity: selectedRoomState?.kind === "error" || createRoomChangeState.isLoading ? 0.65 : 1,
                padding: spacing.md,
              }}
            >
              {createRoomChangeState.isLoading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 15, fontWeight: "800" }} selectable>
                  Submit room change request
                </Text>
              )}
            </AnimatedPressable>
          </View>
        </Card>
      )}
    </ScreenScrollView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back to tenancy"
      onPress={onPress}
      style={{ alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: "center", width: 42 }}
    >
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function SelectionGroup({
  label,
  onSelect,
  options,
  selected,
}: {
  label: string;
  onSelect: (value: string) => void;
  options: string[];
  selected: string | null;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {options.map((option) => {
          const active = selected === option;
          return (
            <AnimatedPressable
              key={option}
              accessibilityRole="button"
              onPress={() => onSelect(option)}
              style={{
                backgroundColor: active ? colors.primarySoft : colors.surface,
                borderColor: active ? colors.primary : colors.border,
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={{ color: active ? colors.primary : colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "900" }} selectable>
                {option === UNASSIGNED_FLOOR ? option : formatFloor(option)}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function RoomSelectionGroup({
  currentRoomId,
  onSelect,
  rooms,
  selectedRoomId,
}: {
  currentRoomId?: string;
  onSelect: (room: TenantRoomSummary) => void;
  rooms: TenantRoomSummary[];
  selectedRoomId: string | null;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        Rooms available on this floor
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {rooms.map((room) => {
          const active = selectedRoomId === room.id;
          const current = room.id === currentRoomId;
          const available = roomActionState(room, currentRoomId).kind === "success";
          return (
            <AnimatedPressable
              key={room.id}
              accessibilityRole="button"
              onPress={() => onSelect(room)}
              style={{
                backgroundColor: active ? colors.primarySoft : colors.surface,
                borderColor: active ? colors.primary : colors.border,
                borderRadius: 14,
                borderWidth: 1,
                minWidth: 92,
                padding: spacing.sm,
              }}
            >
              <Text style={{ color: active ? colors.primary : colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "500" }} selectable>
                {room.roomNumber}
              </Text>
              <Text style={[type.caption, { color: current ? colors.danger : available ? colors.primary : colors.kicker, fontWeight: "800" }]} selectable>
                {current ? "Current" : `${room.availableVacancies}/${room.capacity} free`}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function RoomDetailsCard({ room, state }: { room: TenantRoomSummary; state: ReturnType<typeof roomActionState> | null }) {
  const { colors, type } = useTheme();
  const statusColor = state?.kind === "success" ? colors.primary : colors.danger;

  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricTile label="Occupancy" value={`${room.occupiedCount}/${room.capacity}`} hint={`${room.availableVacancies} vacancy${room.availableVacancies === 1 ? "" : "ies"}`} />
          <MetricTile label="Rent" value={formatMoney(room.baseRentPaise)} hint="Base rent" tone="primary" />
        </View>
        <DetailLine label="Room type" value={humanizeToken(room.roomType)} />
        <DetailLine label="Conditioning" value={humanizeToken(room.conditioning)} />
        <DetailLine label="Status" value={humanizeToken(room.status)} />
        <View style={{ borderColor: statusColor, borderRadius: 14, borderWidth: 1, padding: spacing.md }}>
          <Text style={[type.eyebrow, { color: statusColor, textAlign: "center" }]} selectable>
            {state?.label ?? "Select a room"}
          </Text>
          {state?.message ? (
            <Text style={[type.caption, { color: colors.muted, marginTop: spacing.xs, textAlign: "center" }]} selectable>
              {state.message}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function CycleRuleCard({ cycleEndDate, loading }: { cycleEndDate: string | null; loading: boolean }) {
  const { colors, type } = useTheme();

  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          Execution rule
        </Text>
        <Text style={[type.body, { color: colors.ink, fontWeight: "800" }]} selectable>
          Effective on {loading ? "current cycle end" : cycleEndDate ? formatDate(cycleEndDate) : "current billing cycle end"}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          The request can be raised and approved anytime, but the room change executes on the last day of the current billing cycle before the next cycle is generated.
        </Text>
      </View>
    </Card>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>
        {label}
      </Text>
      <Text style={[type.body, { color: colors.ink, flex: 1, fontWeight: "800", textAlign: "right" }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function FormField({
  label,
  maxLength,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          {label}
        </Text>
        {maxLength ? (
          <Text style={[type.caption, { color: colors.kicker }]} selectable>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
      <TextInput
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 15,
          minHeight: multiline ? 130 : 54,
          padding: spacing.md,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
    </View>
  );
}

function roomActionState(room: TenantRoomSummary, currentRoomId?: string) {
  if (room.id === currentRoomId) {
    return { kind: "error" as const, label: "Not available for action", message: "This is your current room. Select a different room." };
  }
  if (!room.active) {
    return { kind: "error" as const, label: "Not available for action", message: "This room is not active." };
  }
  if (room.status === "MAINTENANCE") {
    return { kind: "error" as const, label: "Not available for action", message: "This room is under maintenance." };
  }
  if (room.availableVacancies <= 0) {
    return { kind: "error" as const, label: "Not available for action", message: "This room has no vacancy right now." };
  }
  return { kind: "success" as const, label: "Available for action", message: "This room can be requested for transfer review." };
}

function compareRooms(left: TenantRoomSummary, right: TenantRoomSummary) {
  return compareFloorLabels(floorKey(left.floor), floorKey(right.floor)) || left.roomNumber.localeCompare(right.roomNumber, undefined, { numeric: true });
}

function floorKey(floor: string | null) {
  const trimmed = floor?.trim();
  return trimmed ? trimmed : UNASSIGNED_FLOOR;
}

function compareFloorLabels(left: string, right: string) {
  if (left === UNASSIGNED_FLOOR) return 1;
  if (right === UNASSIGNED_FLOOR) return -1;
  return left.localeCompare(right, undefined, { numeric: true });
}

function formatFloor(value: string) {
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith("floor") ? trimmed : `Floor ${trimmed}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: value % 100 === 0 ? 0 : 2, style: "currency" }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function humanizeToken(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}
