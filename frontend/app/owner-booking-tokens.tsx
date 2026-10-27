import { useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { LockKeyhole } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonList } from "@/components/skeletons/primitives";
import type { BookingListLoadMore } from "@/features/booking/booking-request-list";
import { BookingTokenList } from "@/features/booking/booking-token-list";
import { useBookingProperty } from "@/features/booking/use-booking-property";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppDispatch } from "@/store/hooks";
import { bookingApi } from "@/store/services/booking-api";
import { useTheme } from "@/theme/use-theme";

/**
 * Every token the property has received, and what became of each.
 *
 * <p>Reached from the Token record card on the Bookings screen (user,
 * 2026-10-11). It is laid out as Booking history is: the list is the whole
 * page, found by a token's or a booking's code and narrowed by what the token
 * is now. A refund owed is marked as sent from its own row.
 */
export default function OwnerBookingTokensScreen() {
  const params = useLocalSearchParams<{ status?: string }>();
  const initialStatus = params.status === "DECISION_PENDING" ? "DECISION_PENDING" : "ALL";
  const scope = useBookingProperty();
  const router = useGuardedRouter();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const loadMore = useRef<(() => void) | null>(null) as BookingListLoadMore;
  const property = scope.property && scope.canView && !scope.error ? scope.property : null;

  return <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} refreshable={Boolean(property)} onRefresh={() => { dispatch(bookingApi.util.invalidateTags(["Booking"])); }} onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
      // Endless list: within 240 of the end, ask the list for its next page. It answers only when there is one.
      if (contentSize.height - contentOffset.y - layoutMeasurement.height <= 240) loadMore.current?.();
    }} scrollEventThrottle={16}>
    <ScreenHeader title="Token" italicTail="record." subtitle={scope.property ? `Booking tokens received at ${scope.property.name}.` : "Booking tokens received."} />
    {property ? <BookingTokenList key={`${property.id}:${initialStatus}`} propertyId={property.id} initialStatus={initialStatus} loadMoreRef={loadMore} onOpenBooking={(token) => router.push({ pathname: "/owner-booking-detail", params: { propertyId: property.id, requestId: token.requestId } })} />
      : scope.loading ? <SkeletonList rows={3} body={2} action />
      : scope.error ? <>
        <NoticeBar tone="danger" title="Could not load tokens" message={errorMessage(scope.error)} />
        <View style={{ flexDirection: "row" }}><ActionButton label="Try again" onPress={scope.retry} /></View>
      </>
      : <EmptyState icon={LockKeyhole} title={scope.property ? "Bookings access needed" : "Select an active property"} description={scope.property ? "The owner can give you access from Booking settings." : "Choose the property on Home, then open Bookings."} />}
  </ScreenScrollView>;
}
