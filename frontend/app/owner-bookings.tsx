import { useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CalendarPlus, LockKeyhole, type LucideProps } from "lucide-react-native";

import { AddRecordCard } from "@/components/add-record-card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { PaymentSetupIcon } from "@/components/billing-vector-icons";
import { BookingConfirmedListIcon, BookingHistoryIcon, BookingTokenAmountIcon } from "@/components/booking-vector-icons";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { BookingWorkspaceSkeleton } from "@/components/skeletons/booking/workspace";
import { BookingRequestList, type BookingListLoadMore } from "@/features/booking/booking-request-list";
import { BOOKING_ATTENTION, bookingAttention, type BookingAttentionFilter } from "@/features/booking/booking-attention";
import { useBookingProperty } from "@/features/booking/use-booking-property";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppDispatch } from "@/store/hooks";
import { bookingApi, useGetBookingSettingsQuery } from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerBookingsScreen() {
  const params = useLocalSearchParams<{ attention?: string | string[] }>();
  const attention = bookingAttention(params.attention);
  const scope = useBookingProperty();
  const { colors } = useTheme();
  if (scope.property && scope.canView && !scope.error) return <BookingWorkspace key={`${scope.property.id}:${attention ?? "ALL"}`} propertyId={scope.property.id} propertyName={scope.property.name} owner={scope.owner} attention={attention} />;
  return <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} refreshable={false}>
    <ScreenHeader title="Manage" italicTail="bookings." subtitle="Booking requests for your selected property." />
    {scope.loading ? <BookingWorkspaceSkeleton /> : scope.error ? <>
      <NoticeBar tone="danger" title="Could not load bookings" message={errorMessage(scope.error)} />
      <View style={{ flexDirection: "row" }}><ActionButton label="Try again" onPress={scope.retry} /></View>
    </> : <EmptyState icon={LockKeyhole} title={scope.property ? "Bookings access needed" : "Select an active property"} description={scope.property ? "The owner can give you access from Booking settings." : "Choose the property on Home, then open Bookings."} />}
  </ScreenScrollView>;
}

/**
 * Four doors, then the requests themselves.
 *
 * <p>The doors are half cards, two to a row and all the same width, each a
 * drawing and a name: Payment setup beside Token record, then Booking history
 * beside Confirmed bookings (user, 2026-10-11). Each of the last three opens
 * a list of its own. Under them, one section holds the working list. Neither the history
 * nor the confirmed bookings is a tab beside that list (user, 2026-10-10 and
 * 2026-10-11).
 *
 * <p>The four count tiles that stood on top (awaiting handler, awaiting
 * tenant, token due, confirmed) are gone (user, 2026-10-11). The list's own
 * filter carries those counts.
 */
function BookingWorkspace({ propertyId, propertyName, owner, attention }: { propertyId: string; propertyName: string; owner: boolean; attention?: BookingAttentionFilter }) {
  const router = useGuardedRouter();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const loadMore = useRef<(() => void) | null>(null) as BookingListLoadMore;
  // Owner only on the server too. A property that has not been set up takes no requests at all.
  const settings = useGetBookingSettingsQuery(propertyId, { skip: !owner });
  // Nothing on this screen can be used until the owner saves their booking
  // settings: the property takes no requests at all before that.
  const notSetUp = owner && settings.currentData?.configured === false;

  return <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} onRefresh={() => { dispatch(bookingApi.util.invalidateTags(["Booking"])); }} onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
      // Endless list: within 240 of the end, ask the list for its next page. It answers only when there is one.
      if (contentSize.height - contentOffset.y - layoutMeasurement.height <= 240) loadMore.current?.();
    }} scrollEventThrottle={16}>
    {/* The Enquiries screen's own gear, the same shape and size, for the same kind of door (user, 2026-10-10). */}
    <ScreenHeader title="Manage" italicTail="bookings." subtitle={`Booking requests for ${propertyName}.`} trailing={owner ? (
      <AnimatedPressable accessibilityLabel="Booking settings" accessibilityRole="button" hitSlop={10} onPress={() => router.push("/owner-booking-settings")} style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}>
        <Ionicons color={colors.ink} name="settings" size={22} />
      </AnimatedPressable>
    ) : null} />
    {/* Red, not amber: this is not a caution, it is the reason nothing below works (user, 2026-10-10). */}
    {notSetUp ? <>
      <NoticeBar tone="danger" title="Bookings are not set up" message="Visitors cannot send a booking request until you save your booking settings." />
      <View style={{ flexDirection: "row" }}><ActionButton label="Set up bookings" icon={SettingsGear} onPress={() => router.push("/owner-booking-settings")} /></View>
    </> : null}
    {/* Everything under the notice is greyed and out of reach until bookings are
        set up. The wrapper is always here, so the list under it is not thrown
        away and read again the moment the settings arrive. */}
    <View pointerEvents={notSetUp ? "none" : "auto"} accessibilityElementsHidden={notSetUp} importantForAccessibility={notSetUp ? "no-hide-descendants" : "auto"} style={{ gap: spacing.lg, opacity: notSetUp ? 0.4 : 1 }}>
    <View style={{ alignItems: "stretch", flexDirection: "row", gap: spacing.sm }}>
      {owner ? <BookingPaymentSetupCard onPress={() => router.push("/owner-booking-payment-setup")} /> : null}
      <BookingTokenRecordCard onPress={() => router.push("/owner-booking-tokens")} />
    </View>
    <View style={{ alignItems: "stretch", flexDirection: "row", gap: spacing.sm }}>
      <BookingHistoryCard onPress={() => router.push("/owner-booking-history")} />
      <BookingConfirmedCard onPress={() => router.push("/owner-booking-confirmed")} />
    </View>
    {/* Someone who booked in person or by phone, saved as confirmed. Under the four cards, the
        same card as Record external visit (user, 2026-10-19). */}
    <AddRecordCard icon={CalendarPlus} label="Create external booking" onPress={() => router.push("/owner-external-booking")} />
    <Section title={attention ? BOOKING_ATTENTION[attention] : "Booking requests"}>
      <BookingRequestList propertyId={propertyId} filter="OPEN" owner={owner} attention={attention} loadMoreRef={loadMore} onOpen={(item) => router.push({ pathname: "/owner-booking-detail", params: { propertyId, requestId: item.id } })} />
    </Section>
    </View>
  </ScreenScrollView>;
}

/**
 * One of the doors under the header, two to a row. Each starts from no width
 * and grows by the same share, so a pair is the same width whatever it holds
 * (user, 2026-10-11: "should be equal width"). Left to their contents, the
 * longer one took more of the row.
 */
const DOOR_CARD = { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 } as const;

/** The same gear, shaped like a lucide icon so a button can carry it. */
function SettingsGear({ color, size }: LucideProps) {
  return <Ionicons color={color} name="settings" size={Number(size ?? 22)} />;
}

function BookingPaymentSetupCard({ onPress }: { onPress: () => void }) {
  const { colors, type } = useTheme();
  return <AnimatedPressable accessibilityLabel="Payment setup" accessibilityRole="button" onPress={onPress} style={DOOR_CARD}>
    <Card style={{ flex: 1, justifyContent: "center", minHeight: 100, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <PaymentSetupIcon size={38} />
        <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 16, lineHeight: 21 }]}>Payment setup</Text>
      </View>
    </Card>
  </AnimatedPressable>;
}

/**
 * The way to every token the property has received (user, 2026-10-11: "it
 * should open a screen with all tokens collected"). Named Token record and
 * made as Payment setup is, a drawing and a name, with no amount on it (user,
 * 2026-10-11). It used to carry the total under another name.
 */
function BookingTokenRecordCard({ onPress }: { onPress: () => void }) {
  const { colors, type } = useTheme();
  return <AnimatedPressable accessibilityLabel="Token record" accessibilityRole="button" onPress={onPress} style={DOOR_CARD}>
    <Card style={{ flex: 1, justifyContent: "center", minHeight: 100, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <BookingTokenAmountIcon color={colors.primary} size={38} />
        <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 16, lineHeight: 21 }]}>Token record</Text>
      </View>
    </Card>
  </AnimatedPressable>;
}

/**
 * The way to everything that is over: cancelled, expired, or moved in. A half
 * card made as Payment setup is, a drawing and a name (user, 2026-10-11). It
 * was a full card with a line of description and a button of its own.
 */
function BookingHistoryCard({ onPress }: { onPress: () => void }) {
  const { colors, type } = useTheme();
  return <AnimatedPressable accessibilityLabel="Booking history" accessibilityRole="button" onPress={onPress} style={DOOR_CARD}>
    <Card style={{ flex: 1, justifyContent: "center", minHeight: 100, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <BookingHistoryIcon size={38} />
        <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 16, lineHeight: 21 }]}>Booking history</Text>
      </View>
    </Card>
  </AnimatedPressable>;
}

/**
 * The way to the bookings that are confirmed and still to move in. The
 * history card's pair: the same drawing, with a tick where the clock is.
 */
function BookingConfirmedCard({ onPress }: { onPress: () => void }) {
  const { colors, type } = useTheme();
  return <AnimatedPressable accessibilityLabel="Confirmed bookings" accessibilityRole="button" onPress={onPress} style={DOOR_CARD}>
    <Card style={{ flex: 1, justifyContent: "center", minHeight: 100, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <BookingConfirmedListIcon size={38} />
        <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 16, lineHeight: 21 }]}>Confirmed bookings</Text>
      </View>
    </Card>
  </AnimatedPressable>;
}
