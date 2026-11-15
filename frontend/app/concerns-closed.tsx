import { useMemo, useState } from "react";
import { View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { filterByConcernCode } from "@/features/concerns/concern-search";
import { useTheme } from "@/theme/use-theme";
import { SkeletonCard } from "@/components/skeleton";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { splitTenantConcerns, useListMyConcernHistoryQuery, useListMyCurrentConcernsQuery } from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { ConcernCard, sortLatest } from "./concerns";

/** A little more room between a concern empty state's picture and its words (user, 2026-11-14). */
const CONCERN_EMPTY_GAP = spacing.lg + spacing.xs;

const CONCERN_EMPTY_ILLUSTRATION = require("../assets/empty-states/concern-empty_state.png");

/** The tenant's closed concerns, a screen of their own (user, 2026-11-11), each card with its shadow. */
export default function ClosedConcernsScreen() {
  const { colors } = useTheme();
  const router = useGuardedRouter();
  // A search by concern ID that sticks to the top (user, 2026-11-14).
  const [search, setSearch] = useState("");
  const currentQuery = useListMyCurrentConcernsQuery();
  const historyQuery = useListMyConcernHistoryQuery({ page: 0, size: 200 });
  const closed = useMemo(
    () => [...splitTenantConcerns(currentQuery.data, historyQuery.data).closed].sort(sortLatest),
    [currentQuery.data, historyQuery.data],
  );
  const failed = loadFailure(historyQuery);
  if (failed) {
    return <LoadFailedScreen failure={failed} />;
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} stickyHeaderIndices={[1]} surface={colors.background}>
      <ScreenHeader italicTail="concerns." subtitle="Concerns that have been closed." title="Closed" />
      {/* On a phone a sticky child's style moves to a wrapper: the row needs its own View. */}
      <View style={{ backgroundColor: colors.background, marginHorizontal: -spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
        <View>
          <SearchField autoCapitalize="characters" onChangeText={setSearch} placeholder="Search by concern ID" value={search} />
        </View>
      </View>
      {historyQuery.isFetching && !historyQuery.data ? (
        <SkeletonCard />
      ) : filterByConcernCode(closed, search).length === 0 ? (
        <EmptyState artworkTextGap={CONCERN_EMPTY_GAP}
          artwork={CONCERN_EMPTY_ILLUSTRATION}
          description={search.trim() ? "Try another concern ID." : "Concerns move here once they are closed."}
          title={search.trim() ? "No matching concerns" : "No history yet"}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {filterByConcernCode(closed, search).map((concern) => (
            <ConcernCard
              concern={concern}
              key={concern.id}
              onPress={() => router.push({ pathname: "/concern-detail", params: { concernId: concern.id } })}
            />
          ))}
        </View>
      )}
    </ScreenScrollView>
  );
}
