import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { CalendarCheck, Clock3, IndianRupee, RotateCcw, Undo2 } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { BookingTokenAmountIcon } from "@/components/booking-vector-icons";
import { EmptyState } from "@/components/empty-state";
import { FilteredQueue } from "@/components/filtered-queue";
import { ListEnd } from "@/components/list-end";
import { SearchField } from "@/components/search-field";
import { SkeletonList } from "@/components/skeletons/primitives";
import { useToast } from "@/components/toast";
import { METHOD_LABEL } from "@/features/billing/payment-methods";
import type { BookingListLoadMore } from "@/features/booking/booking-request-list";
import { OwnerBookingStatus, OwnerTokenStatus } from "@/features/booking/owner-booking-status";
import { BookingInfoBand } from "@/features/booking/tenant-booking-parts";
import { BOOKING_TOKEN_STATUS, bookingDateLabel } from "@/features/booking/booking-ui";
import { useDebouncedValue } from "@/features/discovery/use-debounced-value";
import { InitialsAvatar } from "@/features/enquiry/enquiry-tags";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, ConfirmDialog, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAccumulatedPages } from "@/hooks/use-accumulated-pages";
import {
  RECEIVED_TOKEN_STATUSES,
  useGetPropertyBookingTokensQuery,
  useKeepBookingTokenMutation,
  useRefundBookingTokenMutation,
  type BookingTokenLedgerItem,
  type BookingTokenStatus,
} from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

/**
 * Every token a property has received, as one searchable, filterable, endless
 * list (user, 2026-10-11: "a screen with all tokens collected, with booking
 * id, booking status, token status, and a mark refund button for tokens with
 * refund status, a filter for token status and a search for token id").
 *
 * <p>Made as the list of booking requests is: the search and the status are
 * sent to the server, so the count is of what was asked for, and the next page
 * is read when the host screen's scroll nears the end.
 *
 * <p>One thing is done from here: a guest who did not arrive leaves their token
 * "Action pending", and the handler refunds it (recorded as refundable) or
 * keeps it (kept), with a button each (user, 2026-10-28). Refunds
 * are not followed after that. Whether the reader may decide is the server's to
 * say, a row at a time.
 */
export function BookingTokenList({ propertyId, loadMoreRef, onOpenBooking, initialStatus = "ALL" }: {
  propertyId: string;
  initialStatus?: "ALL" | BookingTokenStatus;
  loadMoreRef?: BookingListLoadMore;
  onOpenBooking: (token: BookingTokenLedgerItem) => void;
}) {
  const { colors, fonts } = useTheme();
  const [status, setStatus] = useState<"ALL" | BookingTokenStatus>(initialStatus);
  const [searchDraft, setSearchDraft] = useState("");
  const [page, setPage] = useState(0);
  const toast = useToast();
  const [deciding, setDeciding] = useState<{ requestId: string; refund: boolean } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [refundToken] = useRefundBookingTokenMutation();
  const [keepToken] = useKeepBookingTokenMutation();
  const busy = useRef(false);
  // Typed freely, asked for once the typing pauses.
  const search = useDebouncedValue(searchDraft.trim(), 350);
  const list = useGetPropertyBookingTokensQuery(
    { propertyId, page, status: status === "ALL" ? null : status, q: search },
    { refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  // One token per booking, so the booking's id is the row's own.
  const fetched = useMemo(() => {
    const tokens = list.currentData?.tokens;
    return tokens ? { ...tokens, items: tokens.items.map((token) => ({ ...token, id: token.requestId })) } : undefined;
  }, [list.currentData]);
  // Pages already read stay on screen while the next one loads. A new search or filter starts again.
  const pages = useAccumulatedPages(`${propertyId}:${status}:${search}`, fetched);
  const waiting = list.isFetching && !pages;
  const more = Boolean(pages?.hasNext) && !list.isFetching && !list.isError;
  if (loadMoreRef) loadMoreRef.current = more ? () => setPage(pages!.page + 1) : null;
  const narrowed = search.length > 0 || status !== "ALL";
  // The row being decided, as the list has it now, so a stale version is sent as it was read.
  const beingDecided = deciding ? pages?.items.find((token) => token.requestId === deciding.requestId) ?? null : null;
  async function confirmDecision() {
    if (!deciding || !beingDecided || busy.current) return;
    const { refund } = deciding;
    setDeciding(null);
    busy.current = true;
    try {
      const step = { propertyId, requestId: beingDecided.requestId, version: beingDecided.version };
      await (refund ? refundToken(step) : keepToken(step)).unwrap();
      toast.success(refund ? "Token marked refundable." : "Token marked kept.");
    } catch (caught) { setRefusal(errorMessage(caught)); }
    finally { busy.current = false; }
  }

  return <View style={{ gap: spacing.md }}>
    <FilteredQueue
      heading={status === "ALL" ? "All tokens" : BOOKING_TOKEN_STATUS[status].label}
      headingNode={<SearchField autoCapitalize="characters" placeholder="Search token ID or booking ID" value={searchDraft} onChangeText={(value) => { setSearchDraft(value); setPage(0); }} />}
      value={status}
      onChange={(value) => { setStatus(value); setPage(0); }}
      options={[{ value: "ALL", label: "All" }, ...RECEIVED_TOKEN_STATUSES.map((value) => ({ value, label: BOOKING_TOKEN_STATUS[value].label }))]}
    >
      {!pages && !list.isError ? <SkeletonList rows={3} body={2} action /> : null}
      {list.isError && !pages ? <>
        <NoticeBar title="Could not load tokens" message={errorMessage(list.error)} tone="danger" />
        <View style={{ flexDirection: "row" }}><ActionButton label="Try again" icon={RotateCcw} onPress={() => void list.refetch()} variant="secondary" /></View>
      </> : null}
      {pages && pages.totalElements === 0 ? <EmptyState
        artworkNode={<BookingTokenAmountIcon color={colors.primary} size={64} />}
        title={narrowed ? "No matching tokens" : "No tokens collected yet"}
        description={narrowed ? "Try another search or filter." : "A token appears here once you record it as received."}
      /> : null}
      {pages && pages.items.length > 0 ? <View style={{ gap: spacing.md, opacity: waiting ? 0.6 : 1 }}>
        {pages.items.map((token) => <BookingTokenCard key={token.requestId} token={token} onOpenBooking={() => onOpenBooking(token)} onDecide={(refund) => setDeciding({ requestId: token.requestId, refund })} />)}
        {/* The foot every endless list in the app has: a spinner while more is coming, then the tick that says it is all there. */}
        {pages.hasNext || (list.isFetching && page > pages.page) ? <ActivityIndicator color={colors.muted} style={{ padding: spacing.sm }} /> : <ListEnd />}
        {list.isError ? <View style={{ flexDirection: "row" }}><ActionButton label="Try again" icon={RotateCcw} onPress={() => void list.refetch()} variant="secondary" /></View> : null}
      </View> : null}
    </FilteredQueue>
    {deciding && beingDecided ? <ConfirmDialog
      confirmLabel={deciding.refund ? "Refund token" : "Keep token"}
      destructive={!deciding.refund}
      message={deciding.refund
        ? <>{beingDecided.tenantName}'s token of <Text style={{ fontFamily: fonts.sansBold }}>{formatMoneyPaise(beingDecided.amountPaise)}</Text> will be recorded as refundable. Refund it to them directly. Khatiyan does not handle refunds.</>
        : <>{beingDecided.tenantName}'s token of <Text style={{ fontFamily: fonts.sansBold }}>{formatMoneyPaise(beingDecided.amountPaise)}</Text> will be recorded as kept and counted as your income.</>}
      onCancel={() => setDeciding(null)}
      onConfirm={() => void confirmDecision()}
      title={deciding.refund ? "Refund this token?" : "Keep this token?"}
    /> : null}
    {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
  </View>;
}

/**
 * What became of the money, in a line: refundable since when, or waiting on the
 * handler after a no-show. Nothing for a token still held or settled otherwise.
 */
export function tokenRefundLine(token: BookingTokenLedgerItem): string | null {
  if (token.status === "REFUND_DUE") return token.refundDueSince ? `Refundable since ${bookingDateLabel(token.refundDueSince)}. The property refunds it directly.` : "Refundable. The property refunds it directly.";
  if (token.status === "DECISION_PENDING") return "The guest did not arrive. Refund the token or keep it.";
  return null;
}

/**
 * One token in the property's list, made as a booking's card is: whose it is
 * and its own code, then soft bands for the money and for the booking it
 * belongs to, then its buttons.
 *
 * <p>The token's status sits at the far end of the name's row, drawn as the
 * booking's own chip is, a mark and a word (user, 2026-10-11). The booking's
 * status sits with the booking's code, so the two are never read as one.
 */
export function BookingTokenCard({ token, onDecide, onOpenBooking }: { token: BookingTokenLedgerItem; onDecide: (refund: boolean) => void; onOpenBooking: () => void }) {
  const { colors, fonts, type } = useTheme();
  const refund = tokenRefundLine(token);
  return <Card style={{ gap: spacing.sm, padding: spacing.md }}>
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginBottom: 4 }}>
      <InitialsAvatar name={token.tenantName} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <FitText numberOfLines={1} minimumFontScale={0.8} style={[type.display, { color: colors.ink, fontSize: 18 }]}>{cardName(token.tenantName)}</FitText>
        {/* The code alone, as a booking's card shows its own (user, 2026-10-11: "remove Token id from before the id"). */}
        <FitText selectable numberOfLines={1} minimumFontScale={0.8} style={[type.description, { color: colors.muted }]}>{token.receiptCode}</FitText>
      </View>
      <OwnerTokenStatus status={token.status} />
    </View>
    {/* Amount, date and mode as the tenancy cards show their facts (user, 2026-10-27): a small label
        over each value, three columns with a thin rule between them. */}
    <View style={{ alignItems: "stretch", flexDirection: "row" }}>
      <TokenFact flex={1} label="Amount" value={formatMoneyPaise(token.amountPaise)} />
      <TokenFactDivider />
      <TokenFact flex={1.2} label="Received on" value={bookingDateLabel(token.receivedAt)} />
      <TokenFactDivider />
      <TokenFact flex={1} label="Mode" value={METHOD_LABEL[token.receivedMethod]} />
    </View>
    <BookingInfoBand icon={CalendarCheck}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[type.description, { color: colors.muted, fontFamily: fonts.sansMedium }]}>Booking ID</Text>
          <FitText selectable numberOfLines={1} minimumFontScale={0.8} style={[type.body, { color: colors.ink, fontFamily: fonts.sansMedium }]}>{token.bookingReferenceCode}</FitText>
        </View>
        <OwnerBookingStatus short status={token.bookingStatus} />
      </View>
    </BookingInfoBand>
    {refund ? <BookingInfoBand icon={token.status === "DECISION_PENDING" ? Clock3 : Undo2} tone={token.status === "DECISION_PENDING" ? "warning" : "neutral"}>
      <Text style={[type.description, { color: token.status === "DECISION_PENDING" ? colors.warningText : colors.muted, fontFamily: fonts.sansMedium }]}>{refund}</Text>
    </BookingInfoBand> : null}
    {/* A no-show's token: the handler's two choices side by side (user, 2026-10-28). */}
    {token.canDecide ? <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
      <ActionButton label="Keep token" onPress={() => onDecide(false)} variant="neutral" />
      <ActionButton label="Refund token" onPress={() => onDecide(true)} />
    </View> : null}
    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: token.canDecide ? 0 : 4 }}>
      <ActionButton label="View booking" onPress={onOpenBooking} variant="secondary" />
    </View>
  </Card>;
}

/** One fact on a token card, drawn as a tenancy card's (`TenancyMetric`): label over a bold value. */
function TokenFact({ flex, label, value }: { flex: number; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flex, gap: 3, minWidth: 0, paddingHorizontal: spacing.xs }}>
      <FitText numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 10 }]}>{label}</FitText>
      <FitText numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 16 }}>{value}</FitText>
    </View>
  );
}

function TokenFactDivider() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, marginHorizontal: spacing.xxs, width: 1 }} />;
}

