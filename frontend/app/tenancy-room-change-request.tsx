import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, BedDouble, Check, CircleHelp, Info } from "lucide-react-native";

import { LoadFailed } from "@/components/load-failed";
import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { compareFloors, formatFloor } from "@/features/property/floor";
import { FloorSelector } from "@/features/property/floor-selector";
import { roomChangeRequestBlock } from "@/features/tenancy/request-blocked-modal";
import { REQUESTS_NOT_STARTED, tenancyNotStarted } from "@/features/tenancy/starts-soon-bubble";
import { useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import type { TenantRoomSummary } from "@/store/services/tenancy-api";
import {
  useCreateRoomChangeRequestMutation,
  useGetMyActiveTenancyQuery,
  useListMyActivePropertyRoomsQuery,
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
} from "@/store/services/tenancy-api";
import { BedColorIcon } from "@/components/bed-color-icon";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CURRENT_ROOM_ERROR = "This is your current room. Select a different room.";
/** The note above the button, taller than the standard footer by one line. */
const FOOTER_CLEARANCE = PINNED_FOOTER_CLEARANCE + 32;

/** Every field the submit check can point at. */
type RequestField = "reason" | "room";

/**
 * A tenant's room change request, laid out like the owner's screens (user,
 * 2026-11-11): the current room, the owner's floor switcher and the free rooms
 * on that floor, the reason, the effective date as its own section with the
 * execution rule behind How it works, and the submit button pinned to the
 * bottom with the review note in one line above it.
 */
export default function TenancyRoomChangeRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reason?: string; reRaiseRequestId?: string; targetRoomId?: string }>();
  const reRaiseRequestId = firstParam(params.reRaiseRequestId);
  const initialTargetRoomId = firstParam(params.targetRoomId);
  const { colors, fonts, type } = useTheme();
  const form = useFormErrors<RequestField>();
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const roomsQuery = useListMyActivePropertyRoomsQuery();
  const roomRequestsQuery = useListMyRoomChangeRequestsQuery();
  const exitRequestsQuery = useListMyExitRequestsQuery();
  const [createRoomChangeRequest, createRoomChangeState] = useCreateRoomChangeRequestMutation();
  const currentRoomId = activeTenancyQuery.data?.room.id;
  const activeTenancyId = activeTenancyQuery.data?.tenancy.id;
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(activeTenancyId ?? "", { skip: !activeTenancyId });
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialTargetRoomId ?? null);
  const [reason, setReason] = useState(firstParam(params.reason) ?? "");
  const [howOpen, setHowOpen] = useState(false);

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
  const floors = useMemo(() => Array.from(new Set(rooms.map((room) => floorKey(room.floor)))).sort(compareFloors), [rooms]);
  const activeFloor = selectedFloor != null && floors.includes(selectedFloor) ? selectedFloor : floors[0] ?? null;
  const roomsForFloor = rooms.filter((room) => floorKey(room.floor) === activeFloor);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedRoomState = selectedRoom ? roomActionState(selectedRoom, currentRoomId) : null;
  const currentCycle = useMemo(() => {
    const cycles = [...(cyclesQuery.data ?? [])].sort((left, right) => (right.cycleNumber ?? 0) - (left.cycleNumber ?? 0));
    const today = localISODate(new Date());
    return (
      cycles.find((cycle) => cycle.category === "RENT_CYCLE" && cycle.periodStartDate <= today && cycle.periodEndDate >= today)
      ?? cycles.find((cycle) => cycle.category === "RENT_CYCLE")
      ?? null
    );
  }, [cyclesQuery.data]);
  const effectiveDate = currentCycle?.periodEndDate ?? null;
  const correction = (roomRequestsQuery.data ?? []).find((request) => request.id === reRaiseRequestId && request.reRaiseAllowed);
  const requestBlock = roomChangeRequestBlock(exitRequestsQuery.data, roomRequestsQuery.data, activeTenancyId);

  useEffect(() => {
    if (!initialTargetRoomId || rooms.length === 0) return;
    const initialRoom = rooms.find((room) => room.id === initialTargetRoomId);
    if (initialRoom) setSelectedFloor(floorKey(initialRoom.floor));
  }, [initialTargetRoomId, rooms]);

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
      ...(selectedRoom ? (state?.kind === "error" ? { room: state.message } : {}) : { room: "Select a target room." }),
      ...(reason.trim() ? {} : { reason: "Add a reason for the room change request." }),
    });
    if (!blocking || !selectedRoom) return;
    try {
      await createRoomChangeRequest({ reason: reason.trim(), targetRoomId: selectedRoom.id }).unwrap();
      router.replace({ pathname: "/tenancy-request-desk", params: { roomChangeRequested: "1" } });
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not submit room change request. Please check room availability and try again.");
    }
  };

  const loading = activeTenancyQuery.isFetching || roomsQuery.isFetching || roomRequestsQuery.isFetching || exitRequestsQuery.isFetching;
  const tenancy = activeTenancyQuery.data;
  const blockedEmpty = loading
    ? null
    : tenancy && tenancyNotStarted(tenancy.tenancy.startDate)
      ? { description: REQUESTS_NOT_STARTED.roomChange, title: "Your tenancy has not started" }
      : requestBlock
        ? { description: `${requestBlock.referenceCode}: ${requestBlock.message}`, title: requestBlock.title }
        : reRaiseRequestId && !correction
          ? { description: "This room change request can no longer be edited and raised again.", title: "Correction window closed" }
          : !tenancy && !roomsQuery.error
            ? { description: "Room change requests can be raised only from an active tenancy.", title: "No current stay" }
            : null;
  const showForm = !loading && !blockedEmpty && !roomsQuery.error && Boolean(tenancy);

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        bottomPaddingCovered={showForm}
        contentContainerStyle={showForm ? { paddingBottom: FOOTER_CLEARANCE } : undefined}
        safeAreaEdges={["top", "bottom"]}
      >
        <ScreenHeader
          italicTail="request."
          subtitle="Pick a floor and a free room, and tell us why you want to move."
          title="Room change"
          trailing={
            <AnimatedPressable
              accessibilityLabel="How a room change works"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setHowOpen(true)}
              style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
              tapLockMs={0}
            >
              <CircleHelp color={colors.kicker} size={20} strokeWidth={2.4} />
            </AnimatedPressable>
          }
        />

        {loading ? (
          <SkeletonCard />
        ) : blockedEmpty ? (
          <EmptyState icon={BedDouble} title={blockedEmpty.title} description={blockedEmpty.description} />
        ) : roomsQuery.error ? (
          <LoadFailed error={roomsQuery.error} onReload={() => void roomsQuery.refetch()} />
        ) : tenancy ? (
          <>
            <CurrentRoomCard room={tenancy.room} />

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: colors.muted }]}>Move to</Text>
              <FloorSelector
                active={activeFloor}
                floors={floors}
                onSelect={(floor) => {
                  setSelectedFloor(floor);
                  setSelectedRoomId(null);
                  form.clearField("room");
                }}
              />
              <RoomGrid currentRoomId={currentRoomId} onSelect={selectRoom} rooms={roomsForFloor} selectedRoomId={selectedRoomId} />
              <RoomErrorPill message={form.errors.room} />
            </View>

            <FormInput
              error={form.errors.reason}
              label="Reason"
              maxLength={500}
              multiline
              onChangeText={(value) => {
                setReason(value);
                form.clearField("reason");
              }}
              placeholder="Why do you want to change rooms?"
              required
              value={reason}
            />

            {/* The date in a section of its own, the rule behind How it works. */}
            <View style={{ gap: spacing.sm }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                <Text style={[type.label, { color: colors.muted }]}>Effective date</Text>
                <AnimatedPressable accessibilityLabel="When a room change happens" accessibilityRole="button" hitSlop={10} onPress={() => setHowOpen(true)} tapLockMs={0}>
                  <CircleHelp color={colors.muted} size={16} strokeWidth={2.2} />
                </AnimatedPressable>
              </View>
              <EffectiveDateCard cycleEndDate={effectiveDate} from={tenancy.room} loading={cyclesQuery.isFetching} room={selectedRoomState?.kind === "success" ? selectedRoom : null} />
            </View>
          </>
        ) : null}
      </ScreenScrollView>

      {showForm ? (
        <PinnedFooter>
          <View style={{ gap: spacing.sm }}>
            {/* The review note, one line with an i, above the button. */}
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center" }}>
              <Info color={colors.muted} size={14} strokeWidth={2.3} />
              <Text style={[type.caption, { color: colors.muted }]}>Management reviews your request before approving it.</Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <ActionButton
                disabled={form.blocked || selectedRoomState?.kind === "error" || createRoomChangeState.isLoading}
                label={createRoomChangeState.isLoading ? "Submitting..." : "Submit request"}
                onPress={() => void submit()}
              />
            </View>
          </View>
        </PinnedFooter>
      ) : null}

      {howOpen ? (
        <HowItWorksSheet
          eyebrow="Room change"
          onClose={() => setHowOpen(false)}
          steps={[
            { body: "Ask for a room change any day. Pick a room with a free bed.", title: "Raise it anytime" },
            { body: "Management approves or turns it down. You will see their answer on the Request desk.", title: "Management reviews it" },
            {
              body: `Once approved, you move on the last day of your current bill${effectiveDate ? `, ${formatDate(effectiveDate)}` : ""}, before the next bill is made.`,
              title: "You move at the end of the bill",
            },
            { body: "Your next bill is for the new room, at its rent.", title: "The new rent starts next bill" },
          ]}
          title="How a room change works"
        />
      ) : null}
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </View>
  );
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function localISODate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Where the tenant is now (user, 2026-11-11), built like the owner's record
 * cards: the room on a gradient with a bed in colour, then a ruled row of its
 * floor, sharing and rent. No side bar, no tag.
 */
function CurrentRoomCard({ room }: { room: TenantRoomSummary }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        ...cardShadow(colors.shadow),
      }}
    >
      {/* The room on a blue gradient (user, 2026-11-11), the facts on white under it. */}
      <LinearGradient
        colors={["#3E63DD", "#5B4BD6"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          alignItems: "center",
          borderTopLeftRadius: radii.card - 1,
          borderTopRightRadius: radii.card - 1,
          flexDirection: "row",
          gap: spacing.md,
          padding: spacing.md,
        }}
      >
        <View style={{ alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 999, height: 48, justifyContent: "center", width: 48 }}>
          <BedColorIcon size={34} />
        </View>
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <Text style={{ color: "rgba(255, 255, 255, 0.8)", fontFamily: fonts.sansSemiBold, fontSize: 12 }}>Current room</Text>
          <Text style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 22 }}>Room {room.roomNumber}</Text>
        </View>
      </LinearGradient>
      <View style={{ flexDirection: "row", padding: spacing.md }}>
        <RoomFact label="Floor" value={formatFloor(room.floor)} />
        <RoomFact divided label="Sharing" value={sharingLabel(room.capacity)} />
        <RoomFact divided label="Rent" value={`${formatRupees(room.baseRentPaise)}/mo`} />
      </View>
    </View>
  );
}

/** One ruled column: a small label over its value. */
function RoomFact({ divided, label, value }: { divided?: boolean; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ borderLeftColor: colors.border, borderLeftWidth: divided ? 1 : 0, flex: 1, gap: 2, minWidth: 0, paddingLeft: divided ? spacing.sm : 0 }}>
      <Text style={[type.caption, { color: colors.muted, fontSize: 10.5 }]}>{label}</Text>
      <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

function sharingLabel(capacity: number) {
  return capacity <= 1 ? "Single" : `${capacity} sharing`;
}

function formatRupees(paise: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(paise / 100);
}

/** Why the picked room cannot be asked for: a pale red pill (user, 2026-11-11). */
function RoomErrorPill({ message }: { message?: string }) {
  const { colors, fonts } = useTheme();
  if (!message) return null;
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: colors.dangerSoft, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 }}>
      <Text style={{ color: colors.danger, fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>{message}</Text>
    </View>
  );
}

/** The rooms on the chosen floor, two to a row. A second tap on a room unpicks it. */
function RoomGrid({
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
  if (rooms.length === 0) {
    return <Text style={[type.description, { color: colors.muted }]}>No rooms on this floor.</Text>;
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {rooms.map((room) => {
        const active = selectedRoomId === room.id;
        const current = room.id === currentRoomId;
        const available = roomActionState(room, currentRoomId).kind === "success";
        // Picked: green for a room that can be asked for, amber for one that cannot.
        const pickTone = available ? colors.jade : colors.warning;
        return (
          <AnimatedPressable
            accessibilityLabel={`Room ${room.roomNumber}, ${current ? "your current room" : `${room.availableVacancies} of ${room.capacity} free`}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={room.id}
            onPress={() => onSelect(room)}
            style={{
              backgroundColor: current ? colors.surfaceSunken : colors.surface,
              borderColor: active ? pickTone : colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: active ? 2 : 1,
              flexBasis: "47%",
              flexGrow: 1,
              maxWidth: "50%",
              minHeight: 84,
              opacity: !current && !available && !active ? 0.6 : 1,
              padding: spacing.md,
              ...(current ? {} : cardShadow(colors.shadow)),
            }}
          >
            <View style={{ alignItems: "center", flex: 1, flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21 }}>{room.roomNumber}</Text>
                <Text style={{ color: current ? colors.muted : available ? colors.jade : colors.muted, fontFamily: fonts.sansBold, fontSize: 12 }}>
                  {current ? "Your room" : available ? `${room.availableVacancies} of ${room.capacity} free` : room.status === "MAINTENANCE" ? "Maintenance" : "Full"}
                </Text>
              </View>
              {active ? (
                <View style={{ alignItems: "center", backgroundColor: pickTone, borderRadius: 999, height: 26, justifyContent: "center", width: 26 }}>
                  {available ? (
                    <Check color="#FFFFFF" size={15} strokeWidth={2.8} />
                  ) : (
                    <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 16, lineHeight: 19 }}>!</Text>
                  )}
                </View>
              ) : (
                <BedDouble color={current ? colors.kicker : colors.inkSoft} size={22} strokeWidth={1.8} />
              )}
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/**
 * Moving day (user, 2026-11-11): a calendar page with the day, what the day is,
 * and once a room is picked, the move and the rent it changes to.
 */
function EffectiveDateCard({
  cycleEndDate,
  from,
  loading,
  room,
}: {
  cycleEndDate: string | null;
  from: TenantRoomSummary;
  loading: boolean;
  room: TenantRoomSummary | null;
}) {
  const { colors, fonts, type } = useTheme();
  const date = cycleEndDate ? new Date(`${cycleEndDate}T12:00:00+05:30`) : null;
  const part = (options: Intl.DateTimeFormatOptions) => (date ? new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "Asia/Kolkata" }).format(date) : "");
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {/* A tear-off calendar page: the month on a red band, the day under it. */}
        <View style={{ borderColor: colors.borderStrong, borderRadius: radii.card, borderWidth: 1, overflow: "hidden", width: 56 }}>
          <View style={{ alignItems: "center", backgroundColor: "#E5484D", paddingVertical: 2 }}>
            <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.6 }}>
              {date ? part({ month: "short" }).toUpperCase() : "BILL"}
            </Text>
          </View>
          <View style={{ alignItems: "center", backgroundColor: colors.surface, paddingBottom: 4, paddingTop: 2 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, lineHeight: 26 }}>{date ? part({ day: "numeric" }) : "--"}</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.sansSemiBold, fontSize: 10.5 }}>{date ? part({ weekday: "short" }) : "End"}</Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
            {loading ? "Working it out" : date ? part({ day: "numeric", month: "long", year: "numeric" }) : "End of your current bill"}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>The last day of your current bill. If approved, you move on this day.</Text>
        </View>
      </View>
      {room ? (
        <>
          <View style={{ backgroundColor: colors.border, height: 1 }} />
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <MoveEnd label="From" rent={from.baseRentPaise} room={from.roomNumber} />
            <ArrowRight color={colors.muted} size={18} strokeWidth={2.2} />
            <MoveEnd label="To" rent={room.baseRentPaise} room={room.roomNumber} strong />
          </View>
        </>
      ) : null}
    </View>
  );
}

function MoveEnd({ label, rent, room, strong }: { label: string; rent: number; room: string; strong?: boolean }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
      <Text style={[type.caption, { color: colors.muted, fontSize: 10.5 }]}>{label}</Text>
      <Text style={{ color: strong ? colors.primary : colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>Room {room}</Text>
      <Text style={[type.caption, { color: colors.inkSoft }]}>{formatRupees(rent)}/mo</Text>
    </View>
  );
}

function roomActionState(room: TenantRoomSummary, currentRoomId?: string) {
  if (room.id === currentRoomId) return { kind: "error" as const, message: CURRENT_ROOM_ERROR };
  if (!room.active) return { kind: "error" as const, message: "This room is not active." };
  if (room.status === "MAINTENANCE") return { kind: "error" as const, message: "This room is under maintenance." };
  if (room.availableVacancies <= 0) return { kind: "error" as const, message: "This room has no vacancy right now." };
  return { kind: "success" as const, message: "This room can be requested for transfer review." };
}

function compareRooms(left: TenantRoomSummary, right: TenantRoomSummary) {
  return compareFloors(floorKey(left.floor), floorKey(right.floor)) || left.roomNumber.localeCompare(right.roomNumber, undefined, { numeric: true });
}

/** "" is the unassigned floor, as on the owner's Rooms screen. */
function floorKey(floor: string | null) {
  return floor?.trim() ?? "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
