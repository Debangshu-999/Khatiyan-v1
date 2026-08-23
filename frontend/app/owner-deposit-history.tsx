import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Landmark } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { StatusPill } from "@/components/status-pill";
import { humanizeToken } from "@/features/owner/owner-ui";
import { SkeletonCard } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ChoiceButton, formatMoneyPaise, shortId } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import type { DepositAccount, DepositAccountStatus } from "@/store/services/billing-api";
import { useListPropertyDepositsQuery } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PAGE_SIZE = 10;
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
  const items = useMemo(() => pageData?.items ?? [], [pageData]);

  function changeStatus(next: StatusFilter) {
    setStatusFilter(next);
    setPage(0);
  }

  return (
    <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Deposit manager"
        onBack={() => router.back()}
        title="Deposit"
        italicTail="history."
        subtitle={property ? `Past and present deposit accounts for ${property.name}.` : "Past and present deposit accounts."}
      />

      {!property ? (
        <EmptyState
          icon={Landmark}
          title="Choose a property first"
          description="Open the workspace tab on the home screen and select a property to view its deposit history."
        />
      ) : (
        <>
          <SearchField onChangeText={setSearchText} placeholder="Search by tenant name or tenancy ID" value={searchText} />

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {STATUS_FILTERS.map((filter) => (
              <ChoiceButton
                active={statusFilter === filter.value}
                key={filter.value}
                label={filter.label}
                onPress={() => changeStatus(filter.value)}
              />
            ))}
          </View>

          {depositsQuery.isFetching && items.length === 0 ? (
            <SkeletonCard />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No matching deposit accounts"
              description={committedQuery || statusFilter !== "ALL" ? "Try a different search or filter." : "Deposit accounts appear here as tenancies open and settle."}
            />
          ) : (
            <View style={{ gap: spacing.sm, opacity: depositsQuery.isFetching ? 0.6 : 1 }}>
              {items.map((account) => (
                <HistoryRow
                  account={account}
                  key={account.id}
                  onPress={() => router.push({ params: { tenancyId: account.tenancyId }, pathname: "/owner-deposit-manager" })}
                />
              ))}
            </View>
          )}

          {pageData && pageData.totalElements > 0 ? (
            <PaginationBar
              hasNext={pageData.hasNext}
              hasPrevious={pageData.hasPrevious}
              onNext={() => setPage((current) => current + 1)}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              page={pageData.page}
              totalElements={pageData.totalElements}
              totalPages={pageData.totalPages}
            />
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

function HistoryRow({ account, onPress }: { account: DepositAccount; onPress: () => void }) {
  const { colors, type } = useTheme();

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
          {account.tenancyReferenceCode ?? shortId(account.id)} · {formatMoneyPaise(account.currentBalancePaise)}
        </Text>
      </View>
      {/* The account's own status, all three of them. Collapsing everything
          non-settled to "Active" made a deposit awaiting settlement read as a
          live one — the same account then said PENDING_SETTLEMENT when opened. */}
      <StatusPill
        label={humanizeToken(account.status)}
        tone={account.status === "SETTLED" ? "neutral" : account.status === "PENDING_SETTLEMENT" ? "warning" : "success"}
      />
    </AnimatedPressable>
  );
}

