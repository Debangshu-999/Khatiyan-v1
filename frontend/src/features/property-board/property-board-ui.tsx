import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Modal, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronRight, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import type { PropertyBoardItem } from "@/store/services/notice-api";
import { DIALOG_MAX_WIDTH, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export const PROPERTY_BOARD_ARTWORK = require("../../../assets/workspace/property-board.jpg");

function PropertyBoardCategoryIcon({ color, size = 22 }: { color: string; size?: number }) {
  return <MaterialCommunityIcons color={color} name="clipboard-text" size={size} />;
}

export type PropertyBoardGroup = {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  items: PropertyBoardItem[];
};

/**
 * The tenant API returns categories in the order they should be presented and
 * items in their owner-defined order within each category. A Map preserves the
 * first occurrence of each category while avoiding category-name collisions.
 */
export function groupPropertyBoardItems(items: PropertyBoardItem[]): PropertyBoardGroup[] {
  const groups = new Map<string, PropertyBoardGroup>();

  for (const item of items) {
    const existing = groups.get(item.categoryId);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(item.categoryId, {
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      categorySlug: item.categorySlug,
      items: [item],
    });
  }

  return [...groups.values()];
}

/**
 * Home shows one representative item from each of the most recently maintained
 * categories. It never fills the remaining slots with duplicate categories.
 */
export function selectPropertyBoardPreviewItems(
  items: PropertyBoardItem[],
  limit = 3,
): PropertyBoardItem[] {
  return groupPropertyBoardItems(items)
    .slice(0, limit)
    .map((group) => group.items[0])
    .filter((item): item is PropertyBoardItem => item !== undefined);
}

export function PropertyBoardHero() {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xxs }}>
        <Text style={[type.brand, { color: colors.ink, fontSize: 27, lineHeight: 32 }]}>
          Property{" "}
          <Text
            style={[
              type.brandItalic,
              { color: colors.accent, fontSize: 27, lineHeight: 32 },
            ]}
          >
            Board
          </Text>
        </Text>
        <Text style={[type.body, { color: colors.muted, fontSize: 13, lineHeight: 18 }]}>
          Rules, timings and important house information.
        </Text>
      </View>

      <View
        style={{
          aspectRatio: 1.62,
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 18,
          borderWidth: 1,
          elevation: 2,
          overflow: "hidden",
          shadowColor: colors.shadow,
          shadowOffset: { height: 4, width: 0 },
          shadowOpacity: 0.65,
          shadowRadius: 10,
        }}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={PROPERTY_BOARD_ARTWORK}
          style={{ height: "100%", width: "100%" }}
        />
      </View>
    </View>
  );
}

export function PropertyBoardCategoryCard({
  group,
  onSelectItem,
}: {
  group: PropertyBoardGroup;
  onSelectItem: (item: PropertyBoardItem) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const itemCount = group.items.length;

  return (
    <Card style={{ gap: spacing.sm, padding: spacing.md }}>
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          <PropertyBoardCategoryIcon color={colors.inkSoft} size={22} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.displaySoft,
              fontSize: 18,
              letterSpacing: -0.25,
              lineHeight: 22,
            }}
          >
            {group.categoryName}
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontSize: 11.5, lineHeight: 15 }]}>
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </Text>
        </View>
      </View>

      <View
        style={{
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 12,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {group.items.map((item, index) => (
          <AnimatedPressable
            accessibilityHint="Opens the full board item"
            accessibilityLabel={group.categoryName + ": " + item.title}
            accessibilityRole="button"
            key={item.id}
            onPress={() => onSelectItem(item)}
            style={{
              alignItems: "center",
              borderColor: colors.border,
              borderTopWidth: index === 0 ? 0 : 1,
              flexDirection: "row",
              gap: spacing.sm,
              minHeight: 60,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text
                numberOfLines={2}
                style={{
                  color: colors.ink,
                  fontFamily: fonts.displaySoft,
                  fontSize: 14,
                  lineHeight: 18,
                }}
              >
                {item.title}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  color: colors.muted,
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                {item.body}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={15} strokeWidth={2} />
          </AnimatedPressable>
        ))}
      </View>
    </Card>
  );
}

export function PropertyBoardHomeCard({
  items,
  onOpenBoard,
  onOpenItem,
}: {
  items: PropertyBoardItem[];
  onOpenBoard: () => void;
  onOpenItem: (item: PropertyBoardItem) => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card style={{ borderRadius: 18, gap: spacing.md, overflow: "hidden", padding: spacing.md }}>
      <AnimatedPressable
        accessibilityHint="Opens the full property board"
        accessibilityLabel="Open property board"
        accessibilityRole="button"
        onPress={onOpenBoard}
        style={{
          gap: spacing.md,
        }}
      >
        <View
          style={{
            aspectRatio: 1.62,
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 16,
            borderWidth: 1,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={PROPERTY_BOARD_ARTWORK}
            style={{ height: "100%", width: "100%" }}
          />
        </View>
        <View>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              numberOfLines={1}
              style={[type.display, { color: colors.ink, flex: 1, fontSize: 22, lineHeight: 27 }]}
            >
              Property Board
            </Text>
            <ChevronRight color={colors.primary} size={18} strokeWidth={2.2} />
          </View>
        </View>
      </AnimatedPressable>

      {items.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {items.map((item) => (
            <AnimatedPressable
              accessibilityHint="Opens this item on the full property board"
              accessibilityLabel={item.categoryName + ": " + item.title}
              accessibilityRole="button"
              key={item.id}
              onPress={() => onOpenItem(item)}
              style={{
                alignItems: "center",
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                borderCurve: "continuous",
                borderRadius: 14,
                borderWidth: 1,
                flexDirection: "row",
                gap: spacing.sm,
                minHeight: 62,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.displaySoft,
                    fontSize: 14.5,
                    lineHeight: 19,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.muted,
                    fontFamily: fonts.sans,
                    fontSize: 12.5,
                    lineHeight: 17,
                  }}
                >
                  {item.body}
                </Text>
              </View>
              <ChevronRight color={colors.primary} size={16} strokeWidth={2.2} />
            </AnimatedPressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function PropertyBoardItemModal({
  item,
  onClose,
}: {
  item: PropertyBoardItem | null;
  onClose: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!item) {
      entrance.setValue(0);
      return;
    }

    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();

    return () => animation.stop();
  }, [entrance, item]);

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={() => {}}
      statusBarTranslucent
      transparent
      visible={item !== null}
    >
      <View
        accessibilityViewIsModal
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        {item ? (
          <Animated.View
            style={[
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderStrong,
                borderCurve: "continuous",
                borderRadius: 22,
                borderWidth: 1,
                elevation: 8,
                gap: spacing.sm,
                maxHeight: "82%",
                maxWidth: DIALOG_MAX_WIDTH,
                padding: spacing.lg,
                shadowColor: "#000000",
                shadowOffset: { height: 10, width: 0 },
                shadowOpacity: 0.22,
                shadowRadius: 22,
                width: "100%",
              },
              {
                opacity: entrance,
                transform: [
                  {
                    scale: entrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.97, 1],
                    }),
                  },
                  {
                    translateY: entrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 46,
                  justifyContent: "center",
                  width: 46,
                }}
              >
                <PropertyBoardCategoryIcon color={colors.inkSoft} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: fonts.sansMedium,
                    fontSize: 14,
                    lineHeight: 20,
                  }}
                >
                  {item.categoryName}
                </Text>
              </View>
              <AnimatedPressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={onClose}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 40,
                  justifyContent: "center",
                  width: 40,
                }}
              >
                <X color={colors.inkSoft} size={20} strokeWidth={2} />
              </AnimatedPressable>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }}
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.displaySoft,
                  fontSize: 22,
                  letterSpacing: -0.35,
                  lineHeight: 27,
                }}
              >
                {item.title}
              </Text>
              <Text
                style={{
                  color: colors.inkSoft,
                  fontFamily: fonts.sans,
                  fontSize: 14.5,
                  lineHeight: 22,
                }}
              >
                {item.body}
              </Text>
            </ScrollView>

            <AnimatedPressable
              accessibilityLabel="Got it"
              accessibilityRole="button"
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderCurve: "continuous",
                borderRadius: 14,
                minHeight: 48,
                justifyContent: "center",
                paddingHorizontal: spacing.lg,
              }}
            >
              <Text style={[type.action, { color: colors.onPrimary, fontSize: 14 }]}>
                Got it
              </Text>
            </AnimatedPressable>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
