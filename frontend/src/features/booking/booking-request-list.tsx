import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { BedDouble, CalendarDays, CalendarX, Clock3, IndianRupee, MessageCircle, RotateCcw, UserRound } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FilteredQueue } from "@/components/filtered-queue";
import { ListEnd } from "@/components/list-end";
import { SearchField } from "@/components/search-field";
import { SelectionTabs } from "@/components/selection-tabs";
import { SkeletonList } from "@/components/skeletons/primitives";
import { OwnerBookingStatus } from "@/features/booking/owner-booking-status";
import type { BookingAttentionFilter } from "@/features/booking/booking-attention";
import { BookingInfoBand } from "@/features/booking/tenant-booking-parts";
import { useOpenBookingChat } from "@/features/booking/use-open-booking-chat";
import { BOOKING_STATUS, OPEN_BOOKING_STATUSES, PAST_BOOKING_STATUSES, bookingDateLabel, bookingExpiresInLabel } from "@/features/booking/booking-ui";
import { istToday } from "@/features/analytics/period";
import { useDebouncedValue } from "@/features/discovery/use-debounced-value";
import { InitialsAvatar } from "@/features/enquiry/enquiry-tags";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { BookingsIcon } from "@/features/property/property-control-icons";
import { useAccumulatedPages } from "@/hooks/use-accumulated-pages";
import {
  useGetPropertyBookingRequestsQuery,
  type BookingListFilter,
  type BookingRequestListItem,
  type BookingStatus,
} from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

type Scope = "ALL" | "MINE";

/** How the host screen asks for the next page: it calls this when its scroll nears the end. Null when there is no more. */
export type BookingListLoadMore = { current: (() => void) | null };

/**
 * A property's bookings as one searchable, filterable, endless list.
 *
 * <p>One list, used three times. With {@code filter="OPEN"} it is the working
 * queue on the Bookings screen under two tabs: All requests, which is the
 * requests nobody handles yet, and the ones the reader handles. A request
 * leaves the first for the second the moment it is assigned (user,
 * 2026-10-11: "Assignment should remove the booking from All requests"). With
 * {@code confirmedOnly} it is the Confirmed
 * bookings screen: one status, so no tabs and no status filter, only the
 * search. Confirmed was a third tab until it got a card and a screen of its
 * own (user, 2026-10-11: "Remove Confirmed from the tabs"). With
 * {@code filter="HISTORY"} it is the Booking history screen, where nothing is
 * anybody's to handle any more and the tabs are left out.
 *
 * <p>Search, status, tab and page are all sent to the server. Nothing is
 * narrowed over what has been fetched, so the count is of what was asked for.
 *
 * <p>It has no pager. The next page is read when the host screen's scroll
 * nears the end, and added under what is already there (user, 2026-10-11:
 * "the list should have an infinite scroll UI"). The list sits inside the
 * screen's own scroll view, so the screen tells it through `loadMoreRef`.
 */
export function BookingRequestList({ propertyId, filter, owner, onOpen, loadMoreRef, confirmedOnly = false, onEmptyChange, attention }: {
  propertyId: string;
  filter: BookingListFilter;
  /** Told whenever the list starts or stops showing its empty state, so the screen around it can sit still. */
  onEmptyChange?: (empty: boolean) => void;
  /** Only the confirmed bookings, as a page of their own. */
  confirmedOnly?: boolean;
  attention?: BookingAttentionFilter;
  owner: boolean;
  onOpen: (item: BookingRequestListItem) => void;
  loadMoreRef?: BookingListLoadMore;
}) {
  const { colors } = useTheme();
  const openChat = useOpenBookingChat("property");
  const [scope, setScope] = useState<Scope>("ALL");
  const [status, setStatus] = useState<"ALL" | BookingStatus>("ALL");
  const [searchDraft, setSearchDraft] = useState("");
  const [page, setPage] = useState(0);
  // Typed freely, asked for once the typing pauses.
  const search = useDebouncedValue(searchDraft.trim(), 350);
  const past = filter === "HISTORY";
  const mine = !attention && !past && !confirmedOnly && scope === "MINE";
  // The Confirmed bookings screen is one status and nothing else.
  const asked = attention ? null : confirmedOnly ? "CONFIRMED" : status === "ALL" ? null : status;
  // All requests is the pool still waiting for someone. The confirmed list and the history are everybody's.
  const waiting = !attention && !past && !confirmedOnly && scope === "ALL";
  const list = useGetPropertyBookingRequestsQuery(
    { propertyId, filter, mine, unassigned: waiting, status: asked, attention, q: search, page },
    { refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  // Pages already read stay on screen while the next one loads. A new search, tab or filter starts again.
  const pages = useAccumulatedPages(`${propertyId}:${filter}:${attention ?? (confirmedOnly ? "CONFIRMED" : scope)}:${asked ?? "ALL"}:${search}`, list.currentData);
  // While a new question loads, the last answer stays, dimmed. A list that
  // blanks to a skeleton on every keystroke cannot be read.
  const data = pages ?? (list.isFetching ? list.data : undefined);
  const loadingAgain = list.isFetching && !pages;
  const more = Boolean(pages?.hasNext) && !list.isFetching && !list.isError;
  if (loadMoreRef) loadMoreRef.current = more ? () => setPage(pages!.page + 1) : null;
  const narrowed = search.length > 0 || (!confirmedOnly && status !== "ALL");
  const empty = Boolean(data && data.totalElements === 0);
  useEffect(() => { onEmptyChange?.(empty); }, [empty, onEmptyChange]);
  const statuses = past ? PAST_BOOKING_STATUSES : OPEN_BOOKING_STATUSES;
  const base = past ? "Past bookings" : mine ? "Assigned to me" : confirmedOnly ? "Confirmed bookings" : "All requests";

  const rows = <>
    {!data && !list.isError ? <SkeletonList rows={3} body={2} action /> : null}
    {list.isError && !data ? <>
      <NoticeBar title="Could not load bookings" message={errorMessage(list.error)} tone="danger" />
      <View style={{ flexDirection: "row" }}><ActionButton label="Try again" icon={RotateCcw} onPress={() => void list.refetch()} variant="secondary" /></View>
    </> : null}
    {/* On the Bookings screen the list is one section under the cards, so its empty state stays small. On the
        history and the confirmed screens the list is the whole page, and an empty one stands in the middle of
        it (user, 2026-10-11). */}
    {empty ? <EmptyState
      compact={!past && !confirmedOnly}
      artworkNode={<BookingsIcon size={64} />}
      title={narrowed ? "No matching bookings" : attention ? "No bookings need this action" : past ? "No past bookings yet" : mine ? "Nothing is assigned to you" : confirmedOnly ? "No confirmed bookings yet" : "No requests waiting"}
      description={narrowed
        ? "Try another search or filter."
        : past
          ? "Cancelled, expired and moved-in bookings will appear here."
          : mine
            ? "A request is yours once you respond to it first, or it is assigned to you."
            : confirmedOnly
              ? "A booking appears here once its terms are agreed and its token is recorded."
              : "A new request waits here until someone responds to it. Yours are under Assigned to me."}
    /> : null}
    {data && data.items.length > 0 ? <View style={{ gap: spacing.md, opacity: loadingAgain ? 0.6 : 1 }}>
      {/* A confirmed booking is opened by its handler alone. Anyone else reads its card (user, 2026-10-11). */}
      {data.items.map((item) => <BookingCard key={item.id} item={item} showHandler={!mine} canOpen={!confirmedOnly || item.handledByReader} onChat={() => void openChat({ propertyId, requestId: item.id, title: item.tenantName, referenceCode: item.referenceCode })} onOpen={() => onOpen(item)} />)}
      {/* The foot every endless list in the app has: a spinner while more is coming, then the tick that says it is all there. */}
      {pages ? (pages.hasNext || (list.isFetching && page > pages.page) ? <ActivityIndicator color={colors.muted} style={{ padding: spacing.sm }} /> : <ListEnd />) : null}
      {list.isError && pages ? <View style={{ flexDirection: "row" }}><ActionButton label="Try again" icon={RotateCcw} onPress={() => void list.refetch()} variant="secondary" /></View> : null}
    </View> : null}
  </>;

  const searchField = <SearchField placeholder="Search by name, booking code or room" value={searchDraft} onChangeText={(value) => { setSearchDraft(value); setPage(0); }} />;

  return <View style={{ gap: spacing.md }}>
    {/* The rule under the tabs runs to both edges of the screen, past the page's own margin, as it does on
        the meal screen and on the tenant's My bookings (user, 2026-10-11). */}
    {past || confirmedOnly || attention ? null : <SelectionTabs<Scope> active={scope} bleed={spacing.lg} compact distributed onChange={(value) => { setScope(value); setPage(0); }} options={[{ label: "All requests", value: "ALL" }, { label: "Assigned to me", value: "MINE" }]} />}
    {confirmedOnly || attention ? <>
      {/* This screen is already one status, so its search needs no status filter. */}
      {searchField}
      {rows}
    </> : <FilteredQueue
      heading={status === "ALL" ? base : BOOKING_STATUS[status].label}
      headingNode={searchField}
      value={status}
      onChange={(value) => { setStatus(value); setPage(0); }}
      options={[{ value: "ALL", label: "All" }, ...statuses.map((value) => ({ value, label: BOOKING_STATUS[value].label }))]}
    >
      {rows}
    </FilteredQueue>}
  </View>;
}

/** Whose price is on the table, or that it is settled. Nothing once the booking is over. */
function rentNote(item: BookingRequestListItem) {
  if (item.status === "AWAITING_HANDLER" || item.status === "AWAITING_TENANT") {
    return item.currentOfferBy === "TENANT" ? "Tenant's offer" : "Property's offer";
  }
  return item.status === "AWAITING_TOKEN" || item.status === "TOKEN_RECEIVED" || item.status === "CONFIRMED" || item.status === "MOVED_IN" ? "Agreed rent" : null;
}

/**
 * One booking in the property's list, made as the tenant's own My bookings
 * card is (user, 2026-10-11): who and which booking, then soft bands for the
 * room and move-in, the rent and the clock, then one button.
 *
 * <p>The room's number is set a size down, and the lines in the bands (move-in,
 * whose it is, the rent note, the clock) a weight up from the plain
 * description, so they read at a glance (user, 2026-10-11).
 *
 * <p>The status sits at the far end of the name's row, in its short form
 * ("Awaiting", not "Awaiting handler"), which is what leaves the name and the
 * booking code a line each (user, 2026-10-11). The long form beside the name
 * took the width they needed and pushed them onto second lines.
 */
export function BookingCard({ item, showHandler = true, canOpen = true, onChat, onOpen }: { item: BookingRequestListItem; showHandler?: boolean; /** False for a booking the reader may only read here: the card has no button. */ canOpen?: boolean; /** Opens the chat with the person who booked, where the reader can (item.canChat). */ onChat?: () => void; onOpen: () => void }) {
  const { colors, fonts, type } = useTheme();
  const negotiating = item.status === "AWAITING_HANDLER" || item.status === "AWAITING_TENANT";
  const note = rentNote(item);
  // A confirmed booking stays CONFIRMED until someone converts it or records that they did not arrive.
  const pastDue = item.status === "CONFIRMED" && item.moveInDate < istToday();
  return <Card style={{ gap: spacing.sm, padding: spacing.md }}>
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginBottom: 4 }}>
      <InitialsAvatar name={item.tenantName} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <FitText numberOfLines={1} minimumFontScale={0.8} style={[type.display, { color: colors.ink, fontSize: 18 }]}>{cardName(item.tenantName)}</FitText>
        <FitText selectable numberOfLines={1} minimumFontScale={0.8} style={[type.description, { color: colors.muted }]}>{item.referenceCode}</FitText>
      </View>
      <OwnerBookingStatus short status={item.status} />
    </View>
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}><BookingInfoBand icon={BedDouble} iconGap={6}>
        <FitText numberOfLines={1} minimumFontScale={0.8} style={[type.body, { color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 13 }]}>Room {item.roomNumber}</FitText>
      </BookingInfoBand></View>
      <View style={{ flex: 1.5, minWidth: 0 }}><BookingInfoBand icon={CalendarDays} iconGap={6}>
        <FitText numberOfLines={1} minimumFontScale={0.8} style={[type.body, { color: colors.ink, fontFamily: fonts.sansMedium }]}>Move-in: {bookingDateLabel(item.moveInDate)}</FitText>
      </BookingInfoBand></View>
    </View>
    {/* Whose it is, where somebody has it: "you" to its own handler, the name to anyone else (user, 2026-10-11).
        With nobody, the status already says it is waiting. */}
    {showHandler && item.handlerName ? <BookingInfoBand icon={UserRound}><FitText numberOfLines={1} style={[type.description, { color: colors.muted, fontFamily: fonts.sansMedium }]}>Handled by {item.handledByReader ? "you" : item.handlerName}</FitText></BookingInfoBand> : null}
    <BookingInfoBand icon={IndianRupee}>
      {note ? <Text style={[type.description, { color: colors.muted, fontFamily: fonts.sansMedium }]}>{note}</Text> : null}
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 17 }}>{formatMoneyPaise(item.currentRentPaise)} / month</Text>
    </BookingInfoBand>
    {/* Confirmed, and its move-in day has gone by with nobody moved in (user, 2026-10-27). */}
    {pastDue ? <BookingInfoBand icon={CalendarX} tone="danger"><Text style={[type.body, { color: colors.danger, fontFamily: fonts.sansSemiBold }]}>Booking past due</Text></BookingInfoBand> : null}
    {/* The request's own clock, while it is still being answered. */}
    {negotiating ? <BookingInfoBand icon={Clock3}><Text style={[type.description, { color: colors.muted, fontFamily: fonts.sansMedium }]}>{bookingExpiresInLabel(item.expiresAt)}</Text></BookingInfoBand> : null}
    {/* Chat beside the main button, on every card of a booking made in the app, confirmed or ended
        included (user, 2026-10-27). */}
    {canOpen || (onChat && item.canChat) ? <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
      {onChat && item.canChat ? <ActionButton icon={MessageCircle} label="Chat" onPress={onChat} variant="secondary" /> : null}
      {canOpen ? <ActionButton label={item.status === "AWAITING_HANDLER" ? "Review request" : "View booking"} onPress={onOpen} variant={item.status === "AWAITING_HANDLER" ? "primary" : "secondary"} /> : null}
    </View> : null}
  </Card>;
}
