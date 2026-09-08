import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { BedDouble, CalendarDays, Check } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FieldError } from "@/components/field-error";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { NoticeBar } from "@/features/owner/owner-ui";
import { useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import type { TenantRoomSummary } from "@/store/services/tenancy-api";
import {
  useCreateRoomChangeRequestMutation,
  useGetMyActiveTenancyQuery,
  useListMyActivePropertyRoomsQuery,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const UNASSIGNED_FLOOR = "Unassigned floor";
const CURRENT_ROOM_ERROR = "This is your current room. Select a different room.";
const SCREEN_DESCRIPTION = "Select a floor, choose an available room and share why you want to move.";

/** Every field the submit check can point at. */
type RequestField = "reason" | "room";

export default function TenancyRoomChangeRequestScreen() {
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const form = useFormErrors<RequestField>();
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const roomsQuery = useListMyActivePropertyRoomsQuery();
  const [createRoomChangeRequest, createRoomChangeState] = useCreateRoomChangeRequestMutation();
  const currentRoomId = activeTenancyQuery.data?.room.id;
  const activeTenancyId = activeTenancyQuery.data?.tenancy.id;
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(activeTenancyId ?? "", { skip: !activeTenancyId });
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

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
    const cycles = [...(cyclesQuery.data ?? [])].sort(
      (left, right) => (right.cycleNumber ?? 0) - (left.cycleNumber ?? 0),
    );
    return cycles.find((cycle) => cycle.status !== "PAID" && cycle.status !== "CANCELLED") ?? cycles[0] ?? null;
  }, [cyclesQuery.data]);
  const effectiveDate = currentCycle?.periodEndDate ?? null;

  useEffect(() => {
    if (form.errors.room !== CURRENT_ROOM_ERROR) {
      return;
    }

    const timeoutId = setTimeout(() => {
      form.clearField("room");
      setSelectedRoomId((current) => (current === currentRoomId ? null : current));
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [currentRoomId, form.clearField, form.errors.room]);

  const selectRoom = (room: TenantRoomSummary) => {
    if (selectedRoomId === room.id) {
      setSelectedRoomId(null);
      form.clearField("room");
      return;
    }

    setSelectedRoomId(room.id);
    const state = roomActionState(room, currentRoomId);
    if (state.kind === "error") {
      form.validate({ ...form.errors, room: state.message });
      return;
    }
    form.clearField("room");
  };

  const submit = async () => {
    const state = selectedRoom ? roomActionState(selectedRoom, currentRoomId) : null;
    const blocking = form.validate({
      ...(selectedRoom
        ? state?.kind === "error"
          ? { room: state.message }
          : {}
        : { room: "Select a target room." }),
      ...(reason.trim() ? {} : { reason: "Add a reason for the room change request." }),
    });
    if (!blocking || !selectedRoom) {
      return;
    }

    try {
      await createRoomChangeRequest({
        reason: reason.trim(),
        targetRoomId: selectedRoom.id,
      }).unwrap();
      router.replace({ pathname: "/tenancy", params: { roomChangeRequested: "1" } });
    } catch (caught) {
      form.failFromServer(
        errorMessage(caught) || "Could not submit room change request. Please check room availability and try again.",
      );
    }
  };

  return (
    <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        title="Room change"
        italicTail="request."
        subtitle={SCREEN_DESCRIPTION}
      />

      {activeTenancyQuery.isFetching || roomsQuery.isFetching ? (
        <SkeletonCard />
      ) : roomsQuery.error ? (
        <EmptyState
          icon={BedDouble}
          title="Could not load rooms"
          description="Refresh after the backend is running with the latest tenant room endpoint."
        />
      ) : !activeTenancyQuery.data ? (
        <EmptyState
          icon={BedDouble}
          title="No current stay"
          description="Room change requests can be raised only from an active tenancy."
        />
      ) : (
        <View style={{ gap: spacing.xl }}>
          <CurrentStayCard room={activeTenancyQuery.data.room} />

          <SelectionGroup
            label="Select a floor"
            options={floors}
            selected={resolvedFloor}
            onSelect={(floor) => {
              setSelectedFloor(floor);
              setSelectedRoomId(null);
              form.clearField("room");
            }}
          />

          <View style={{ gap: spacing.sm }}>
            <RoomSelectionGroup
              currentRoomId={currentRoomId}
              rooms={roomsForFloor}
              selectedRoomId={selectedRoomId}
              onSelect={selectRoom}
            />
            <FieldError message={form.errors.room} />
          </View>

          <CycleRuleCard cycleEndDate={effectiveDate} loading={cyclesQuery.isFetching} />

          {selectedRoom && selectedRoomState?.kind === "success" ? <SelectedRoomCard room={selectedRoom} /> : null}

          <FormField
            error={form.errors.reason}
            label="Reason"
            maxLength={500}
            multiline
            onChangeText={(value) => {
              setReason(value);
              form.clearField("reason");
            }}
            placeholder="Why do you want to change rooms?"
            value={reason}
          />

          <NoticeBar
            message="Your request will be reviewed by management before approval."
            messageStyle={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 }}
            title="REQUEST REVIEW"
            tone="warning"
          />
          <EffectiveDateCard cycleEndDate={effectiveDate} loading={cyclesQuery.isFetching} />

          <AnimatedPressable
            accessibilityRole="button"
            onPress={form.blocked ? undefined : submit}
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderCurve: "continuous",
              borderRadius: 14,
              justifyContent: "center",
              minHeight: 56,
              opacity:
                form.blocked || selectedRoomState?.kind === "error" || createRoomChangeState.isLoading ? 0.65 : 1,
              padding: spacing.md,
            }}
          >
            {createRoomChangeState.isLoading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 15 }}>
                Submit room change request
              </Text>
            )}
          </AnimatedPressable>
        </View>
      )}
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

function CurrentStayCard({ room }: { room: TenantRoomSummary }) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        overflow: "hidden",
        padding: 0,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          backgroundColor: colors.tabSelected,
          bottom: 0,
          left: 0,
          position: "absolute",
          top: 0,
          width: 5,
        }}
      />
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, padding: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.neutralSoft,
            borderRadius: 999,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <BedDouble color={colors.ink} size={21} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.sansBold,
              fontSize: 13,
              letterSpacing: 0.7,
              textTransform: "uppercase",
            }}
          >
            Current stay
          </Text>
          <View style={{ alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>
              Room {room.roomNumber}
            </Text>
            <View
              style={{
                backgroundColor: colors.primarySoft,
                borderRadius: 999,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xxs,
              }}
            >
              <Text style={[type.caption, { color: colors.primaryDeep }]}>
                {room.floor ? formatFloor(room.floor) : UNASSIGNED_FLOOR}
              </Text>
            </View>
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>You are currently staying here.</Text>
        </View>
      </View>
    </Card>
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
  const { colors, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const optionWidth = Math.max(
    84,
    Math.min(116, (width - spacing.lg * 2 - spacing.sm * 2) / 3),
  );

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 18 }}>{label}</Text>
      <ScrollView
        horizontal
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        snapToInterval={optionWidth + spacing.sm}
      >
        {options.map((option) => {
          const active = selected === option;
          return (
            <AnimatedPressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(option)}
              style={{
                alignItems: "center",
                backgroundColor: active ? colors.tabSelected : colors.surface,
                borderColor: active ? colors.tabSelected : colors.borderStrong,
                borderCurve: "continuous",
                borderRadius: 999,
                borderWidth: 1,
                justifyContent: "center",
                minHeight: 48,
                paddingHorizontal: spacing.md,
                width: optionWidth,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}
              >
                {option === UNASSIGNED_FLOOR ? option : formatFloor(option)}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
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
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 18 }}>Choose a new room</Text>
        <Text style={[type.caption, { color: colors.muted }]}>Available rooms on this floor</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {rooms.map((room) => {
          const active = selectedRoomId === room.id;
          const current = room.id === currentRoomId;
          const state = roomActionState(room, currentRoomId);
          const available = state.kind === "success";
          return (
            <AnimatedPressable
              key={room.id}
              accessibilityRole="button"
              onPress={() => onSelect(room)}
              style={{
                backgroundColor: current ? colors.surfaceSunken : active ? colors.primarySoft : colors.surface,
                borderColor: colors.border,
                borderCurve: "continuous",
                borderRadius: 12,
                borderWidth: 1,
                flexBasis: "47%",
                maxWidth: "48.5%",
                minHeight: 94,
                padding: spacing.md,
                shadowColor: colors.shadow,
                shadowOffset: { height: 3, width: 0 },
                shadowOpacity: current ? 0 : 0.65,
                shadowRadius: 8,
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", flex: 1, justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22 }}>{room.roomNumber}</Text>
                  <Text
                    style={[
                      type.caption,
                      {
                        color: current ? colors.danger : available ? colors.primary : colors.muted,
                        fontFamily: fonts.sansBold,
                      },
                    ]}
                  >
                    {current ? "Current room" : `${room.availableVacancies}/${room.capacity} free`}
                  </Text>
                </View>
                {active && available ? (
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.jade,
                      borderRadius: 999,
                      height: 28,
                      justifyContent: "center",
                      width: 28,
                    }}
                  >
                    <Check color={colors.onPrimary} size={16} strokeWidth={2.8} />
                  </View>
                ) : (
                  <BedDouble color={current ? colors.kicker : colors.inkSoft} size={25} strokeWidth={1.8} />
                )}
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function CycleRuleCard({ cycleEndDate, loading }: { cycleEndDate: string | null; loading: boolean }) {
  const { colors, fonts } = useTheme();
  const dateLabel = effectiveDateLabel(cycleEndDate, loading);

  return (
    <Card tone="sunken" style={{ backgroundColor: colors.warningSoft, borderWidth: 0 }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <CalendarDays color={colors.ink} size={25} strokeWidth={2} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.sansBold,
              fontSize: 14,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Execution rule
          </Text>
          <Text style={{ color: colors.warningText, fontFamily: fonts.sansBold, fontSize: 16 }}>
            Effective on {dateLabel}
          </Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 }}>
            The request can be raised and approved anytime, but the room change executes on the last day of the
            current billing cycle before the next cycle is generated.
          </Text>
        </View>
      </View>
    </Card>
  );
}

function SelectedRoomCard({ room }: { room: TenantRoomSummary }) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card tone="raised" style={{ borderColor: colors.borderStrong }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.lg }}>
        <BedDouble color={colors.inkSoft} size={31} strokeWidth={1.8} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: colors.muted }]}>Selected room</Text>
          <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 19 }}>
            Room {room.roomNumber} · <Text style={{ color: colors.primary }}>{room.availableVacancies}/{room.capacity} free</Text>
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>
            {room.floor ? formatFloor(room.floor) : UNASSIGNED_FLOOR}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function EffectiveDateCard({ cycleEndDate, loading }: { cycleEndDate: string | null; loading: boolean }) {
  const { colors, fonts, type } = useTheme();
  const dateLabel = effectiveDateLabel(cycleEndDate, loading);

  return (
    <Card tone="raised" style={{ borderColor: colors.border }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <CalendarDays color={colors.inkSoft} size={25} strokeWidth={2} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={[type.eyebrow, { color: colors.muted }]}>Effective date</Text>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>Effective on {dateLabel}</Text>
          <Text style={[type.caption, { color: colors.muted }]}>If approved, your room change will take effect on this date.</Text>
        </View>
      </View>
    </Card>
  );
}

function FormField({
  error,
  label,
  maxLength,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  error?: string;
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 18 }}>{label}</Text>
        {maxLength ? (
          <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13 }}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
      <AppTextInput
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          backgroundColor: colors.surface,
          borderColor: error ? colors.danger : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 12,
          borderWidth: error ? 1.5 : 1,
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 15,
          minHeight: multiline ? 150 : 54,
          padding: spacing.lg,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
      <FieldError message={error} />
    </View>
  );
}

function roomActionState(room: TenantRoomSummary, currentRoomId?: string) {
  if (room.id === currentRoomId) {
    return {
      kind: "error" as const,
      label: "Not available for action",
      message: CURRENT_ROOM_ERROR,
    };
  }
  if (!room.active) {
    return { kind: "error" as const, label: "Not available for action", message: "This room is not active." };
  }
  if (room.status === "MAINTENANCE") {
    return {
      kind: "error" as const,
      label: "Not available for action",
      message: "This room is under maintenance.",
    };
  }
  if (room.availableVacancies <= 0) {
    return {
      kind: "error" as const,
      label: "Not available for action",
      message: "This room has no vacancy right now.",
    };
  }
  return {
    kind: "success" as const,
    label: "Available for action",
    message: "This room can be requested for transfer review.",
  };
}

function effectiveDateLabel(cycleEndDate: string | null, loading: boolean) {
  if (loading) {
    return "current cycle end";
  }
  return cycleEndDate ? formatDate(cycleEndDate) : "current billing cycle end";
}

function compareRooms(left: TenantRoomSummary, right: TenantRoomSummary) {
  return (
    compareFloorLabels(floorKey(left.floor), floorKey(right.floor)) ||
    left.roomNumber.localeCompare(right.roomNumber, undefined, { numeric: true })
  );
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}
