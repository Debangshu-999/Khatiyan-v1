import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ListEnd } from "@/components/list-end";
import { SelectionTabs } from "@/components/selection-tabs";
import { ServiceBalanceTransactionRow, TransactionSeparator, transactionAmount } from "@/features/billing/service-balance-transaction-row";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useListServiceBalanceEntriesQuery, type ServiceBalanceEntry } from "@/store/services/service-balance-api";
import { useTheme } from "@/theme/use-theme";
import { WalletPinGate } from "@/features/billing/wallet-pin-gate";
import { WalletTransactionSkeleton, WalletTransactionsErrorCard } from "@/features/billing/wallet-loading-ui";

type Filter = "All" | "Credited" | "Debited";

export default function ServiceBalanceTransactionsScreen() {
  return <WalletPinGate><ServiceBalanceTransactionsContent /></WalletPinGate>;
}

function ServiceBalanceTransactionsContent() {
  const { colors, fonts } = useTheme();
  const router = useGuardedRouter();
  const [filter, setFilter] = useState<Filter>("All");
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState<Record<number, ServiceBalanceEntry[]>>({});
  const query = useListServiceBalanceEntriesQuery({ page, size: 20 }, { refetchOnMountOrArgChange: true });
  const response = query.currentData;
  useEffect(() => {
    if (response) setPages((previous) => ({ ...previous, [response.number]: response.content }));
  }, [response]);
  const entries = Object.keys(pages).map(Number).sort((a, b) => a - b).flatMap((key) => pages[key]);
  const filtered = entries.filter((entry) => filter === "All" || (filter === "Credited" ? transactionAmount(entry) > 0 : transactionAmount(entry) < 0));
  const hasMore = response ? !response.last : true;
  function loadMore() {
    if (response && !response.last && !query.isFetching && pages[page]) setPage((current) => current + 1);
  }
  // A filtered page may contain no matches. Keep reading instead of showing
  // a false empty state while matching transactions remain in older pages.
  useEffect(() => {
    if (filtered.length < 6 && response && !response.last && !query.isFetching && pages[page]) setPage((current) => current + 1);
  }, [filtered.length, response, query.isFetching, pages, page]);
  async function refresh() {
    setPages({});
    if (page !== 0) setPage(0);
    else await query.refetch();
  }
  return <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.surface }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 16 }}>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 36, height: 36, borderWidth: 1, borderColor: colors.border, borderRadius: 999, alignItems: "center", justifyContent: "center" }}><ChevronLeft color={colors.ink} size={20} /></AnimatedPressable>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 18 }}>All Transactions</Text>
    </View>
    <SelectionTabs active={filter} onChange={setFilter} horizontalPadding={18} topPadding={10} options={(["All", "Credited", "Debited"] as Filter[]).map((value) => ({ value, label: value }))} />
    <FlatList data={filtered} keyExtractor={(entry) => entry.id} renderItem={({ item }) => <ServiceBalanceTransactionRow entry={item} />} ItemSeparatorComponent={TransactionSeparator} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }} onEndReached={loadMore} onEndReachedThreshold={0.5} refreshing={query.isFetching && page === 0} onRefresh={() => void refresh()} ListEmptyComponent={!query.isFetching && !hasMore && !query.isError ? <Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 30 }}>No {filter === "All" ? "transactions" : `${filter.toLowerCase()} transactions`} yet</Text> : null} ListFooterComponent={query.isError ? <WalletTransactionsErrorCard onRetry={() => void query.refetch()} /> : query.isFetching && !entries.length ? <WalletTransactionSkeleton /> : query.isFetching || hasMore ? <ActivityIndicator color={colors.muted} style={{ padding: 18 }} /> : filtered.length > 20 ? <ListEnd /> : null} />
  </SafeAreaView>;
}
