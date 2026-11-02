import { useRef } from "react";
import { LockKeyhole } from "lucide-react-native";

import { LoadFailed } from "@/components/load-failed";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonList } from "@/components/skeletons/primitives";
import { BookingRequestList, type BookingListLoadMore } from "@/features/booking/booking-request-list";
import { useBookingProperty } from "@/features/booking/use-booking-property";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppDispatch } from "@/store/hooks";
import { bookingApi } from "@/store/services/booking-api";
import { useTheme } from "@/theme/use-theme";

/**
 * The bookings that are confirmed and still to move in.
 *
 * <p>Reached from its own card on the Bookings screen, beside Booking history
 * (user, 2026-10-11). It was a tab on the working list. It is the same list,
 * asked for one status, so a confirmed booking is found the way any other is:
 * by name, code or room.
 */
export default function OwnerBookingConfirmedScreen() {
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
    <ScreenHeader title="Confirmed" italicTail="bookings." subtitle={scope.property ? `Bookings confirmed at ${scope.property.name}.` : "Bookings that are confirmed."} />
    {property ? <BookingRequestList key={property.id} propertyId={property.id} filter="OPEN" confirmedOnly owner={scope.owner} loadMoreRef={loadMore} onOpen={(item) => router.push({ pathname: "/owner-booking-detail", params: { propertyId: property.id, requestId: item.id } })} />
      : scope.loading ? <SkeletonList rows={3} body={2} action />
      : scope.error ? <LoadFailed error={scope.error} onReload={scope.retry} />
      : <EmptyState icon={LockKeyhole} title={scope.property ? "Bookings access needed" : "Select an active property"} description={scope.property ? "The owner can give you access from Booking settings." : "Choose the property on Home, then open Bookings."} />}
  </ScreenScrollView>;
}
