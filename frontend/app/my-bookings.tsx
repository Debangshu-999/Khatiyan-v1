import { useState } from "react";
import { Text, View } from "react-native";
import { CalendarDays, Clock3, IndianRupee, MessageCircle } from "lucide-react-native";

import { BookingPropertyIcon } from "@/components/booking-vector-icons";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { SelectionTabs } from "@/components/selection-tabs";
import { SplitButton } from "@/components/split-button";
import { MyBookingsSkeleton } from "@/components/skeletons/booking/tenant";
import { bookingDateLabel, bookingExpiresInLabel } from "@/features/booking/booking-ui";
import { filterTenantBookings, TENANT_BOOKING_TABS, tenantBookingCount, type TenantBookingTab } from "@/features/booking/tenant-booking-list";
import { BookingInfoBand, TenantBookingStatus } from "@/features/booking/tenant-booking-parts";
import { useOpenBookingChat } from "@/features/booking/use-open-booking-chat";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { BookingsIcon } from "@/features/property/property-control-icons";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useGetMyBookingsQuery, type BookingRequestListItem } from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

export default function MyBookingsScreen() {
  const router = useGuardedRouter();
  const openChat = useOpenBookingChat("booker");
  const { colors, fonts } = useTheme();
  const [tab, setTab] = useState<TenantBookingTab>("ACTIVE");
  const [search, setSearch] = useState("");
  const query = useGetMyBookingsQuery(undefined, { refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const data = query.currentData;
  const items = filterTenantBookings(data ?? [], tab, search);
  const emptyTitle = search.trim() ? "No matching bookings" : tab === "ACTIVE" ? (data?.length ? "No active requests" : "No bookings yet") : tab === "CONFIRMED" ? "No confirmed bookings" : "No booking history yet";
  const emptyDescription = search.trim() ? "Try a different property name or booking ID." : tab === "ACTIVE" ? "After attending a property visit, open My visits or My enquiries and choose Book a stay." : tab === "CONFIRMED" ? "Your confirmed stays will appear here once the booking is confirmed." : "Cancelled, expired and moved-in bookings will appear here.";

  return <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} onRefresh={() => void query.refetch()}>
    <ScreenHeader title="My" italicTail="bookings." subtitle="Track your requests and confirmed stays." />
    <SelectionTabs<TenantBookingTab> active={tab} bleed={spacing.lg} distributed options={TENANT_BOOKING_TABS} onChange={setTab} />
    <SearchField value={search} onChangeText={setSearch} placeholder="Search property or booking ID" />
    {!data && !query.isError ? <MyBookingsSkeleton /> : null}
    {query.isError ? <><NoticeBar title="Could not load bookings" message={errorMessage(query.error)} tone="danger" /><View style={{ flexDirection: "row" }}><ActionButton label="Try again" onPress={() => void query.refetch()} /></View></> : null}
    {data ? <View style={{ alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 8 }}>
      <Text style={{ color: colors.primaryDeep, fontFamily: fonts.sansSemiBold, fontSize: 13 }}>{tenantBookingCount(items.length, tab)}</Text>
    </View> : null}
    {data && !query.isError && !items.length ? <EmptyState artworkNode={<BookingsIcon size={64} />} title={emptyTitle} description={emptyDescription} action={search.trim() ? <View style={{ flexDirection: "row" }}><ActionButton label="Clear search" variant="secondary" onPress={() => setSearch("")} /></View> : tab === "ACTIVE" ? <View style={{ maxWidth: 320, width: "100%" }}><SplitButton left={{ label: "My visits", onPress: () => router.push("/my-visits") }} right={{ label: "My enquiries", onPress: () => router.push("/my-enquiries") }} /></View> : undefined} /> : null}
    {items.map((item) => <TenantBookingListCard key={item.id} item={item} onChat={() => void openChat({ referenceCode: item.referenceCode, requestId: item.id, title: item.propertyName })} onOpen={() => router.push({ pathname: "/my-booking-detail", params: { requestId: item.id } })} />)}
  </ScreenScrollView>;
}

function TenantBookingListCard({ item, onChat, onOpen }: { item: BookingRequestListItem; onChat: () => void; onOpen: () => void }) {
  const { colors, fonts, type } = useTheme();
  const active = ["AWAITING_HANDLER", "AWAITING_TENANT", "AWAITING_TOKEN"].includes(item.status);
  const label = item.status === "AWAITING_TENANT" ? "View offer" : active ? "View request" : "View booking";
  const rentLabel = item.status === "AWAITING_HANDLER" || item.status === "AWAITING_TENANT" ? (item.currentOfferBy === "TENANT" ? "Your offer" : "Property offer") : "Monthly rent";
  return <Card style={{ gap: spacing.sm, padding: spacing.md }}>
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, marginBottom: 4 }}>
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, height: 44, justifyContent: "center", width: 44 }}><BookingPropertyIcon color={colors.primary} size={30} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ alignItems: "flex-start", columnGap: spacing.sm, flexDirection: "row", flexWrap: "wrap", rowGap: 6 }}>
          <View style={{ flexBasis: 150, flexGrow: 1, minWidth: 0, gap: 4 }}>
            <Text style={[type.display, { color: colors.ink, fontSize: 18 }]}>{item.propertyName}</Text>
            <FitText selectable numberOfLines={1} minimumFontScale={0.8} style={[type.description, { color: colors.muted }]}>{item.referenceCode}</FitText>
          </View>
          <TenantBookingStatus status={item.status} />
        </View>
      </View>
    </View>
    <BookingInfoBand icon={CalendarDays}><Text style={[type.body, { color: colors.ink }]}>Move-in: {bookingDateLabel(item.moveInDate)}</Text></BookingInfoBand>
    <BookingInfoBand icon={IndianRupee}>
      <Text style={[type.description, { color: colors.muted }]}>{rentLabel}</Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 17 }}>{formatMoneyPaise(item.currentRentPaise)} / month</Text>
    </BookingInfoBand>
    {item.status === "AWAITING_HANDLER" || item.status === "AWAITING_TENANT" ? <BookingInfoBand icon={Clock3}><Text style={[type.description, { color: colors.muted }]}>{bookingExpiresInLabel(item.expiresAt)}</Text></BookingInfoBand> : null}
    {/* Chat with the property beside it, at every stage of the booking (user, 2026-10-27). */}
    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
      {item.canChat ? <ActionButton icon={MessageCircle} label="Chat" onPress={onChat} variant="secondary" /> : null}
      <ActionButton label={label} onPress={onOpen} />
    </View>
  </Card>;
}
