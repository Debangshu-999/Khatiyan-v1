import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CheckCircle2, Clock3, Landmark } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { humanizeToken } from "@/features/owner/owner-ui";
import { OwnerDepositListSkeleton } from "@/components/skeletons/owner";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ChoiceButton, formatMoneyPaise, shortId } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import type { DepositAccount, DepositAccountStatus } from "@/store/services/billing-api";
import { useListPropertyDepositsQuery } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { CountTabPills } from "@/components/filter-bubbles";
import { BillingStatusBadge } from "@/features/owner/bill-views";
import { DepositHistoryArtwork } from "@/features/billing/deposit-account-ui";

const PAGE_SIZE = 10;

/** How close to the bottom counts as "reached the end", in px. */
const LOAD_MORE_THRESHOLD_PX = 240;
type StatusFilter = "ALL" | DepositAccountStatus;
const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "To settle", value: "PENDING_SETTLEMENT" },
  { label: "Settled", value: "SETTLED" },
];

export default function OwnerDepositHistoryScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const [searchText, setSearchText] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(0);

  // Debounce the search box so each keystroke does not fire a request.
  useEffect(() => {
    const handle = setTimeout(() => {
      setCommittedQuery(searchText.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchText]);

  const depositsQuery = useListPropertyDepositsQuery(
    {
      page,
      propertyId,
      query: committedQuery,
      size: PAGE_SIZE,
      status: statusFilter === "ALL" ? undefined : statusFilter,
    },
    { skip: !propertyId },
  );
  const pageData = depositsQuery.data;

  /**
   * Every page seen so far, appended.
   *
   * <p>
   * The query returns one page keyed on its number, so reading `data` alone
   * shows page three and nothing before it. Accumulating here is what turns
   * that into a list you can keep scrolling.
   *
   * <p>
   * Page 0 REPLACES rather than appends: it is what a new search or a changed
   * filter produces, and appending there would leave the previous filter's
   * accounts sitting above the new ones.
   */
  const [loaded, setLoaded] = useState<DepositAccount[]>([]);

  useEffect(() => {
    if (!pageData) {
      return;
    }
    setLoaded((current) => {
      if (pageData.page === 0) {
        return pageData.items;
      }
      // Deduped by id: a refetch can re-deliver a page already held, and the
      // same account twice in a list is worse than a page arriving late.
      const seen = new Set(current.map((account) => account.id));
      return [...current, ...pageData.items.filter((account) => !seen.has(account.id))];
    });
  }, [pageData]);

  const items = loaded;
  const loadingMore = depositsQuery.isFetching && page > 0;

  /** Pulls the next page in as the reader nears the end of this one. */
  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!pageData?.hasNext || depositsQuery.isFetching) {
      return;
    }
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height - contentOffset.y - layoutMeasurement.height <= LOAD_MORE_THRESHOLD_PX) {
      setPage((current) => current + 1);
    }
  }

  function changeStatus(next: StatusFilter) {
    setStatusFilter(next);
    setPage(0);
  }

  return (
    <ScreenScrollView onScroll={handleScroll} scrollEventThrottle={16}>
      <ScreenHeader
        title="Deposit"
        italicTail="history."
        subtitle={property ? `Past and present deposit accounts for ${property.name}.` : "Past and present deposit accounts."}
      />

      {!property ? (
        <EmptyState
          artworkNode={<DepositHistoryArtwork size={124} />}

          title="Choose a property first"
          description="Open the workspace tab on the home screen and select a property to view its deposit history."
        />
      ) : (
        <>
          <SearchField onChangeText={setSearchText} placeholder="Search by tenant name or tenancy ID" value={searchText} />

          {/* The notice board's filter strip. Four hand-rolled ChoiceButtons in
              a fixed row clipped their labels on a narrow phone — "To settle"
              in a quarter of the width — and looked like a different control
              from the filters on every other list screen.

              No counts: the list is paginated per status on the server, so this
              screen genuinely cannot know how many the other three tabs hold.
              CountTabPills renders the label alone when a count is absent. */}
          <CountTabPills onChange={changeStatus} options={STATUS_FILTERS} value={statusFilter} />

          {depositsQuery.isFetching && items.length === 0 ? (
            <OwnerDepositListSkeleton rows={3} />
          ) : items.length === 0 ? (
            <EmptyState
              artworkNode={<DepositHistoryArtwork size={124} />}

              title="No matching deposit accounts"
              description={committedQuery || statusFilter !== "ALL" ? "Try a different search or filter." : "Deposit accounts appear here as tenancies open and settle."}
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {items.map((account) => (
                <HistoryRow
                  account={account}
                  key={account.id}
                  // navigate, not push. These two screens open each other, so
                  // pushing built a stack of alternating copies — manager,
                  // history, manager, history — and the back button then
                  // retraced every hop instead of leaving. navigate reuses the
                  // manager already below this screen and updates its params.
                  onPress={() => router.navigate({ params: { tenancyId: account.tenancyId }, pathname: "/owner-deposit-manager" })}
                />
              ))}
            </View>
          )}

          {/* A foot either way: still loading, or genuinely the end. Without
              it the last row just stops, and there is no telling a finished
              list from one that failed to extend. */}
          {items.length > 0 ? (
            loadingMore ? (
              <ActivityIndicator color={colors.muted} />
            ) : pageData?.hasNext ? null : (
              <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
                {items.length === 1 ? "1 deposit account" : items.length + " deposit accounts"}
              </Text>
            )
          ) : null}

          {depositsQuery.isError ? (
            <Text style={[type.caption, { color: colors.danger }]}>
              Could not load deposit history. Pull to retry.
            </Text>
          ) : null}
        </>
      )}
    </ScreenScrollView>
  );
}

/** A deposit's status in the billing chip's vocabulary. */
function depositStatusBadge(status: DepositAccountStatus, colors: ReturnType<typeof useTheme>["colors"]) {
  if (status === "SETTLED") {
    return { background: colors.neutralSoft, color: colors.muted, icon: CheckCircle2, label: "Settled" };
  }
  if (status === "PENDING_SETTLEMENT") {
    return { background: colors.warningSoft, color: colors.warningText, icon: Clock3, label: "To settle" };
  }
  return { background: colors.successSoft, color: colors.successText, icon: Landmark, label: "Active" };
}

function HistoryRow({ account, onPress }: { account: DepositAccount; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
          {account.tenantName ?? `Tenancy ${shortId(account.tenancyId)}`}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
          {account.tenancyReferenceCode ?? shortId(account.id)}
        </Text>
        {/* Its own line, labelled and bold. Trailing the reference code after a
            middot, the balance read as part of the identifier — the one number
            on the row that anybody is scanning for, formatted like metadata. */}
        <Text numberOfLines={1} style={[type.caption, { color: colors.ink, fontFamily: fonts.sansBold }]}>
          Curr. Balance - {formatMoneyPaise(account.currentBalancePaise)}
        </Text>
      </View>
      {/* The billing chip — soft tint, glyph, sentence case — not the app's
          caps-on-tint pill. A deposit's status is the same kind of thing as a
          bill's: settled, waiting, or live money on a row about money. */}
      <BillingStatusBadge {...depositStatusBadge(account.status, colors)} />
    </AnimatedPressable>
  );
}
