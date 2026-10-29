import { useState } from "react";
import { Text, View } from "react-native";
import { AlertTriangle, CircleAlert, type LucideProps } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PickerOptionRow } from "@/components/picker-option-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SelectionTabs } from "@/components/selection-tabs";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonList } from "@/components/skeletons/primitives";
import { useToast } from "@/components/toast";
import { istToday } from "@/features/analytics/period";
import { bookingDateLabel } from "@/features/booking/booking-ui";
import { BookingInfoBand } from "@/features/booking/tenant-booking-parts";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { BookingsIcon } from "@/features/property/property-control-icons";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  useCloseBookingDidNotArriveMutation,
  useGetAnotherBedOptionsQuery,
  useGetPropertyBookingRequestQuery,
  useGetPropertyBookingRequestsQuery,
  useMoveBookingBedMutation,
  type BookingBedOption,
  type BookingRequestListItem,
} from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";
import { FilledBedIcon } from "@/components/booking-vector-icons";

type Tab = "TODAY" | "MISSED";

/** "Did not arrive" opens this many days after the move-in date (the server's rule, user 2026-10-27). */
const DID_NOT_ARRIVE_AFTER_DAYS = 1;

const ROOM_TYPE: Record<string, string> = {
  SINGLE: "Single",
  DOUBLE: "Double",
  TRIPLE: "Triple",
  FOUR_SHARING: "Four sharing",
  DORMITORY: "Dormitory",
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Booking onboarding (user, 2026-10-27): the third kind under tenant
 * onboarding, beside monthly and daily. Today lists the confirmed bookings
 * due to move in today, Missed the ones whose day has gone by. Each card says
 * whether the booked bed is free. A free bed offers Onboard, an occupied one
 * offers another room first. "Did not arrive" opens the day after the
 * move-in date and settles the token as the handler decides.
 */
export default function OwnerBookingOnboardingScreen() {
  const router = useGuardedRouter();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const [tab, setTab] = useState<Tab>("TODAY");
  const [page, setPage] = useState(0);
  const [closing, setClosing] = useState<BookingRequestListItem | null>(null);
  const [moving, setMoving] = useState<BookingRequestListItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const args = { filter: "OPEN" as const, page, propertyId };
  const today = useGetPropertyBookingRequestsQuery({ ...args, attention: "MOVE_IN_TODAY", page: tab === "TODAY" ? page : 0 }, { refetchOnMountOrArgChange: true, skip: !propertyId });
  const missed = useGetPropertyBookingRequestsQuery({ ...args, attention: "MOVE_IN", page: tab === "MISSED" ? page : 0 }, { refetchOnMountOrArgChange: true, skip: !propertyId });
  const list = tab === "TODAY" ? today : missed;
  const items = list.currentData?.items ?? [];

  function didNotArrive(item: BookingRequestListItem) {
    const opensOn = addDays(item.moveInDate, DID_NOT_ARRIVE_AFTER_DAYS);
    if (istToday() < opensOn) {
      setNotice(`Give them time to arrive. This can be marked as not arrived from ${bookingDateLabel(opensOn)}.`);
      return;
    }
    setClosing(item);
  }

  return (
    <ScreenScrollView onRefresh={async () => { await Promise.all([today.refetch(), missed.refetch()]); }} safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader italicTail="onboarding." subtitle="People who booked a bed, moving in today or overdue." title="Booking" />
      <SelectionTabs<Tab>
        active={tab}
        bleed={spacing.lg}
        distributed
        onChange={(next) => { setTab(next); setPage(0); }}
        options={[
          { badge: today.currentData?.totalElements ?? 0, label: "Today", value: "TODAY" },
          { badge: missed.currentData?.totalElements ?? 0, label: "Missed", value: "MISSED" },
        ]}
      />

      {list.isLoading ? <SkeletonList rows={3} /> : null}
      {list.isError ? <NoticeBar message={errorMessage(list.error)} title="Could not load bookings" tone="danger" /> : null}
      {list.currentData && items.length === 0 ? (
        <EmptyState
          artworkNode={<BookingsIcon size={64} />}
          title={tab === "TODAY" ? "Nobody is moving in today" : "No missed move-ins"}
        />
      ) : null}

      <View style={{ gap: spacing.md }}>
        {items.map((item) => (
          <OnboardingCard
            item={item}
            key={item.id}
            onDidNotArrive={() => didNotArrive(item)}
            onMove={() => setMoving(item)}
            // The monthly wizard with the booking's terms locked (user, 2026-10-28).
            onOnboard={() => router.push({ params: { bookingId: item.id, propertyId }, pathname: "/owner-onboard-tenant" })}
            onView={() => router.push({ params: { propertyId, requestId: item.id }, pathname: "/owner-booking-detail" })}
          />
        ))}
        {list.currentData?.hasNext ? (
          <View style={{ flexDirection: "row" }}>
            <ActionButton label="Show more" onPress={() => setPage((current) => current + 1)} variant="secondary" />
          </View>
        ) : null}
      </View>

      {closing ? <DidNotArriveSheet item={closing} onClose={() => setClosing(null)} propertyId={propertyId} /> : null}
      {moving ? <MoveRoomSheet item={moving} onClose={() => setMoving(null)} propertyId={propertyId} /> : null}
      {notice ? <AlertModal message={notice} onClose={() => setNotice(null)} tone="info" /> : null}
    </ScreenScrollView>
  );
}

function OnboardingCard({
  item,
  onDidNotArrive,
  onMove,
  onOnboard,
  onView,
}: {
  item: BookingRequestListItem;
  onDidNotArrive: () => void;
  onMove: () => void;
  onOnboard: () => void;
  onView: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const free = item.bedReady !== false;
  return (
    <Card style={{ gap: spacing.sm, padding: spacing.md }}>
      {/* The name with its room at the far end of the row, and the booking code under the name (user, 2026-10-27). */}
      <View style={{ gap: 2 }}>
        <View style={{ alignItems: "baseline", flexDirection: "row", gap: spacing.sm }}>
          <FitText numberOfLines={1} style={[type.display, { color: colors.ink, flex: 1, fontSize: 18 }]}>{cardName(item.tenantName)}</FitText>
          <Text style={[type.description, { color: colors.ink, fontFamily: fonts.sansSemiBold }]}>Room {item.roomNumber}</Text>
        </View>
        <Text selectable style={[type.description, { color: colors.muted }]}>{item.referenceCode}</Text>
      </View>
      {/* A free bed on pale green, a solid bed seen from the side. An occupied one, a filled alert (user, 2026-10-28). */}
      <BookingInfoBand icon={free ? FilledBedIcon : FilledAlertIcon} tone={free ? "success" : "warning"}>
        <Text style={[type.body, { color: free ? colors.successText : colors.warningText, fontFamily: fonts.sansSemiBold }]}>
          {free ? "Bed is free" : "Bed is still occupied"}
        </Text>
        <Text style={[type.description, { color: colors.muted }]}>Move-in {bookingDateLabel(item.moveInDate)}</Text>
      </BookingInfoBand>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ActionButton label="Did not arrive" onPress={onDidNotArrive} variant="neutral" />
        {free ? (
          <ActionButton label="Onboard" onPress={onOnboard} />
        ) : (
          <ActionButton label="Change room" onPress={onMove} />
        )}
      </View>
      <View style={{ flexDirection: "row" }}>
        <ActionButton label="View booking details" onPress={onView} variant="secondary" />
      </View>
    </Card>
  );
}

/**
 * Nobody came (user, 2026-10-27): the booking is cancelled and the bed freed.
 * A token the property received waits as "Action pending", refunded or kept
 * later from its record on the Tokens screen (user, 2026-10-28). No bullet
 * points: the booking sheets' way.
 */
function DidNotArriveSheet({ item, onClose, propertyId }: { item: BookingRequestListItem; onClose: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const detail = useGetPropertyBookingRequestQuery({ propertyId, requestId: item.id }, { refetchOnMountOrArgChange: true });
  const [close, state] = useCloseBookingDidNotArriveMutation();
  const [refusal, setRefusal] = useState<string | null>(null);
  const token = detail.currentData?.token ?? null;
  const tokenHeld = token?.status === "RECEIVED";
  const ready = Boolean(detail.currentData);

  async function confirm() {
    if (!detail.currentData) return;
    try {
      await close({ propertyId, requestId: item.id, version: detail.currentData.version }).unwrap();
      toast.success(`${item.tenantName} marked as not arrived. Room ${item.roomNumber} is free again.`);
      onClose();
    } catch (error) {
      setRefusal(errorMessage(error));
    }
  }

  // Laid out as the booking's own Cancel booking sheet (user, 2026-10-27): who and which room under an
  // alert mark, what happens in plain words, where the token's decision is made, and the bed being let go on amber.
  return (
    <SheetShell onClose={() => { if (!state.isLoading) onClose(); }} title="Did not arrive?">
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xs }}>
        <CircleAlert color={colors.danger} size={36} strokeWidth={1.8} />
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{item.tenantName} · Room {item.roomNumber}</Text>
          <Text selectable style={[type.description, { color: colors.muted }]}>{item.referenceCode}</Text>
        </View>
      </View>
      <Text style={[type.body, { color: colors.ink }]}>
        {item.tenantName} was due to move in on {bookingDateLabel(item.moveInDate)}. Marking them as not arrived cancels this booking.
      </Text>
      {detail.isLoading ? <SkeletonList rows={1} /> : null}
      {tokenHeld && token ? (
        <Text style={[type.body, { color: colors.ink }]}>
          The token of <Text style={{ fontFamily: fonts.sansBold }}>{formatMoneyPaise(token.amountPaise)}</Text> will be marked pending. Refund it or keep it in the Token records screen.
        </Text>
      ) : null}
      <View style={{ alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: 10, flexDirection: "row", gap: spacing.sm, padding: spacing.sm }}>
        <AlertTriangle color={colors.warningText} size={25} strokeWidth={1.9} />
        <Text style={[type.description, { color: colors.ink, flex: 1 }]}>The reserved bed in Room {item.roomNumber} will be released.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ActionButton disabled={state.isLoading} label="Keep booking" onPress={onClose} variant="secondary" />
        <ActionButton disabled={!ready || state.isLoading} label={state.isLoading ? "Saving..." : "Mark as not arrived"} onPress={() => void confirm()} variant="dangerFilled" />
      </View>
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </SheetShell>
  );
}

function roomLabel(option: BookingBedOption) {
  const kind = ROOM_TYPE[option.roomType] ?? option.roomType;
  const air = option.conditioning === "AC" ? "AC" : "Non-AC";
  return `${kind} · ${air} · ${formatMoneyPaise(option.listedRentPaise)}`;
}

/**
 * Change room (user, 2026-10-27): the booked bed is occupied, so the
 * handler moves the booking to a free bed now. Rooms like the booked one come
 * first, with a different room type always offered under them. The agreed
 * rent stays.
 */
function MoveRoomSheet({ item, onClose, propertyId }: { item: BookingRequestListItem; onClose: () => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const options = useGetAnotherBedOptionsQuery({ propertyId, requestId: item.id }, { refetchOnMountOrArgChange: true });
  const [move, state] = useMoveBookingBedMutation();
  const [otherTypes, setOtherTypes] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const all = options.currentData ?? [];
  const similar = all.filter((option) => option.sameKind);
  const others = all.filter((option) => !option.sameKind);
  const shown = otherTypes ? others : similar;

  async function choose(option: BookingBedOption) {
    try {
      await move({ propertyId, requestId: item.id, roomId: option.roomId, version: item.version }).unwrap();
      toast.success(`${item.tenantName} moved to Room ${option.roomNumber}. Ready to onboard.`);
      onClose();
    } catch (error) {
      setRefusal(errorMessage(error));
    }
  }

  return (
    <SheetShell onClose={onClose} title="Change room">
      <Text style={[type.description, { color: colors.muted }]}>
        {otherTypes ? "Rooms of other types with a bed free today." : `Rooms like Room ${item.roomNumber} with a bed free today. The agreed rent stays.`}
      </Text>
      {options.isLoading ? <SkeletonList rows={3} /> : null}
      {options.currentData && shown.length === 0 ? (
        <NoticeBar
          message={otherTypes ? "Every room is full today." : "No room of the same type has a bed free today."}
          title={otherTypes ? "No free beds" : "None like the booked room"}
          tone="warning"
        />
      ) : null}
      <View style={{ gap: spacing.xs }}>
        {shown.map((option) => (
          <PickerOptionRow
            key={option.roomId}
            label={`Room ${option.roomNumber}`}
            onPress={() => { if (!state.isLoading) void choose(option); }}
            selected={false}
            subtitle={`${roomLabel(option)} · ${option.freeBeds} of ${option.capacity} free`}
          />
        ))}
      </View>
      {/* Under the similar rooms, always the way to another type, and back again (user, 2026-10-27). */}
      {options.currentData && !otherTypes && others.length > 0 ? (
        <View style={{ flexDirection: "row" }}>
          <ActionButton label="Select a different room type" onPress={() => setOtherTypes(true)} variant="secondary" />
        </View>
      ) : null}
      {options.currentData && otherTypes && similar.length > 0 ? (
        <View style={{ flexDirection: "row" }}>
          <ActionButton label={`Back to rooms like Room ${item.roomNumber}`} onPress={() => setOtherTypes(false)} variant="secondary" />
        </View>
      ) : null}
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </SheetShell>
  );
}

/** The app's filled alert: a solid disc with a white mark, as the band's ink (user, 2026-10-28). */
function FilledAlertIcon({ color, size = 21 }: LucideProps) {
  return <CircleAlert color="#FFFFFF" fill={color} size={Number(size) + 3} strokeWidth={2.2} />;
}
