import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, ClipboardList } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useListMyPropertyBoardItemsQuery } from "@/store/services/notice-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function PropertyBoardScreen() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const boardQuery = useListMyPropertyBoardItemsQuery();
  const boardItems = boardQuery.data ?? [];
  const groupedItems = groupByCategory(boardItems);

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="Property board"
        title="Always-on,"
        italicTail="info."
        subtitle="Rules, timings, contacts and property details published by your property team."
        trailing={<BackButton onPress={() => router.back()} />}
      />

      {boardQuery.isFetching ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
            Loading property board
          </Text>
        </Card>
      ) : boardItems.length > 0 ? (
        groupedItems.map(([categoryName, items]) => (
          <Section eyebrow="Board category" key={categoryName} title={categoryName}>
            {items.map((item) => (
              <Card key={item.id} tone="sunken">
                <View style={{ gap: spacing.xs }}>
                  <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]} selectable>
                    {item.title}
                  </Text>
                  <Text style={[type.body, { color: colors.muted }]} selectable>
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
          eyebrow="Property board"
          title="No board items yet"
          description="Stable property information will appear here after it is published."
        />
      )}
    </ScreenScrollView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel="Go back"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
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
