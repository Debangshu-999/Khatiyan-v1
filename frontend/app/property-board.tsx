import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { LoadFailed } from "@/components/load-failed";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { PropertyBoardScreenSkeleton } from "@/components/skeletons/property-board";
import {
  groupPropertyBoardItems,
  PROPERTY_BOARD_ARTWORK,
  PropertyBoardCategoryCard,
  PropertyBoardHero,
  PropertyBoardItemModal,
} from "@/features/property-board/property-board-ui";
import {
  type PropertyBoardItem,
  useListMyPropertyBoardItemsQuery,
} from "@/store/services/notice-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function PropertyBoardScreen() {
  const { colors, type } = useTheme();
  const { itemId } = useLocalSearchParams<{ itemId?: string | string[] }>();
  const boardQuery = useListMyPropertyBoardItemsQuery();
  const boardItems = boardQuery.data ?? [];
  const groupedItems = groupPropertyBoardItems(boardItems);
  const [selectedItem, setSelectedItem] = useState<PropertyBoardItem | null>(null);
  const handledItemId = useRef<string | null>(null);
  const requestedItemId = Array.isArray(itemId) ? itemId[0] : itemId;

  useEffect(() => {
    if (!requestedItemId || !boardQuery.data || handledItemId.current === requestedItemId) {
      return;
    }

    const requestedItem = boardQuery.data.find((item) => item.id === requestedItemId);
    if (!requestedItem) {
      return;
    }

    const modalDelay = setTimeout(() => {
      handledItemId.current = requestedItemId;
      setSelectedItem(requestedItem);
    }, 500);

    return () => clearTimeout(modalDelay);
  }, [boardQuery.data, requestedItemId]);

  return (
    <>
      <ScreenScrollView
        // Room under the last category card, clear of the device's nav bar (user, 2026-11-15).
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        onRefresh={async () => {
          await boardQuery.refetch();
        }}
      >
        <ScreenHeader italicTail="board." title="Property" />
        <PropertyBoardHero />

        {boardQuery.isFetching && !boardQuery.data ? (
          <PropertyBoardScreenSkeleton />
        ) : boardQuery.isError ? (
          <LoadFailed error={boardQuery.error} onReload={() => void boardQuery.refetch()} />
        ) : groupedItems.length > 0 ? (
          groupedItems.map((group) => (
            <PropertyBoardCategoryCard
              group={group}
              key={group.categoryId}
              onSelectItem={setSelectedItem}
            />
          ))
        ) : (
          <EmptyState
            artwork={PROPERTY_BOARD_ARTWORK}
            title="No board items yet"
            description="Rules, timings and property information will appear here after your property team publishes them."
          />
        )}
      </ScreenScrollView>

      {/* Just the item: no icon, no category over its title (user, 2026-11-13). */}
      <PropertyBoardItemModal item={selectedItem} onClose={() => setSelectedItem(null)} plain />
    </>
  );
}
