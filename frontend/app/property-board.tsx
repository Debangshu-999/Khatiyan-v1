import { ActivityIndicator, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ClipboardList } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { useListMyPropertyBoardItemsQuery } from "@/store/services/notice-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function PropertyBoardScreen() {
  const { colors, type } = useTheme();
  const router = useGuardedRouter();
  const boardQuery = useListMyPropertyBoardItemsQuery();
  const boardItems = boardQuery.data ?? [];
  const groupedItems = groupByCategory(boardItems);

  return (
    <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Property"
        onBack={() => router.back()}
        title="Always-on,"
        italicTail="info."
        subtitle="Rules, timings, contacts and property details published by your property team."
      />

      {boardQuery.isFetching ? (
        <SkeletonCard />
      ) : boardItems.length > 0 ? (
        groupedItems.map(([categoryName, items]) => (
          <Section key={categoryName} title={categoryName}>
            {items.map((item) => (
              <Card key={item.id} tone="sunken">
                <View style={{ gap: spacing.xs }}>
                  <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]}>
                    {item.title}
                  </Text>
                  <Text style={[type.body, { color: colors.muted }]}>
                    {item.body}
                  </Text>
                </View>
              </Card>
            ))}
          </Section>
        ))
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="No board items yet"
          description="Stable property information will appear here after it is published."
        />
      )}
    </ScreenScrollView>
  );
}


function groupByCategory<T extends { categoryName: string; displayOrder: number }>(items: T[]) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const categoryItems = grouped.get(item.categoryName) ?? [];
    categoryItems.push(item);
    grouped.set(item.categoryName, categoryItems);
  }

  return [...grouped.entries()].map(([categoryName, categoryItems]) => [
    categoryName,
    categoryItems.sort((left, right) => left.displayOrder - right.displayOrder),
  ] as const);
}
