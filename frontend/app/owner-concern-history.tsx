import { useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { EmptyState } from "@/components/empty-state";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { OwnerConcernQueueSkeleton } from "@/components/skeletons/owner";
import { filterByConcernCode } from "@/features/concerns/concern-search";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useListPropertyConcernHistoryQuery } from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { ConcernCard } from "./owner-concerns";

/** A little more room between a concern empty state's picture and its words (user, 2026-11-14). */
const CONCERN_EMPTY_GAP = spacing.lg + spacing.xs;

const CONCERN_EMPTY_ILLUSTRATION = require("../assets/empty-states/concern-empty_state.png");

/**
 * Every resolved and closed concern on a property, a screen of its own like the
 * tenant's closed concerns (user, 2026-11-14), with a search by concern ID that
 * sticks to the top as the list scrolls.
 */
export default function OwnerConcernHistoryScreen() {
  const { colors } = useTheme();
  const router = useGuardedRouter();
  const { propertyId = "" } = useLocalSearchParams<{ propertyId?: string }>();
  const [search, setSearch] = useState("");
  const historyQuery = useListPropertyConcernHistoryQuery({ page: 0, propertyId, size: 200 }, { skip: !propertyId });
  const past = useMemo(
    () => [...(historyQuery.data?.items ?? [])].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [historyQuery.data],
  );
  const shown = filterByConcernCode(past, search);

  const failed = loadFailure(historyQuery);
  if (failed) {
    return <LoadFailedScreen failure={failed} />;
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} stickyHeaderIndices={[1]} surface={colors.background}>
      <ScreenHeader italicTail="history." subtitle="Every resolved and closed concern on this property." title="Concern" />

      {/* On a phone a sticky child's style moves to a wrapper: the row needs its own View. */}
      <View style={{ backgroundColor: colors.background, marginHorizontal: -spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
        <View>
          <SearchField autoCapitalize="characters" onChangeText={setSearch} placeholder="Search by concern ID" value={search} />
        </View>
      </View>

      {historyQuery.isFetching && !historyQuery.data ? (
        <OwnerConcernQueueSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState artworkTextGap={CONCERN_EMPTY_GAP}
          artwork={CONCERN_EMPTY_ILLUSTRATION}
          description={search.trim() ? "Try another concern ID." : "Resolved and closed concerns appear here."}
          title={search.trim() ? "No matching concerns" : "No history yet"}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {shown.map((concern) => (
            <ConcernCard
              actionLabel="View"
              concern={concern}
              key={concern.id}
              onPress={() => router.push({ pathname: "/owner-concern-detail", params: { concernId: concern.id, mode: "history", propertyId: concern.propertyId } })}
            />
          ))}
        </View>
      )}
    </ScreenScrollView>
  );
}
