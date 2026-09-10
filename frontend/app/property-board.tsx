import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
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
        contentContainerStyle={{ paddingBottom: 0 }}
        onRefresh={async () => {
          await boardQuery.refetch();
        }}
      >
        <PropertyBoardHero />

        {boardQuery.isFetching && !boardQuery.data ? (
          <PropertyBoardScreenSkeleton />
        ) : boardQuery.isError ? (
          <Card tone="sunken">
            <View style={{ alignItems: "center", gap: spacing.md }}>
              <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]}>
                Could not load the property board
              </Text>
              <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
                Check your connection and try again.
              </Text>
              <AnimatedPressable
                accessibilityLabel="Try loading the property board again"
                accessibilityRole="button"
                onPress={() => {
                  void boardQuery.refetch();
                }}
                style={{
                  alignItems: "center",
                  borderColor: colors.borderStrong,
                  borderRadius: 12,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: spacing.sm,
                  minHeight: 46,
                  paddingHorizontal: spacing.lg,
                }}
              >
                <RefreshCw color={colors.primary} size={18} strokeWidth={2.2} />
                <Text style={[type.action, { color: colors.primary }]}>Try again</Text>
              </AnimatedPressable>
            </View>
          </Card>
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

      <PropertyBoardItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </>
  );
}
