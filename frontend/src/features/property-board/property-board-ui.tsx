import { ModalTitleRule } from "@/components/modal-title-rule";
import { ModalTitle } from "@/components/modal-title";
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, X, Lock } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import type { PropertyBoardItem } from "@/store/services/notice-api";
import { softShadow as softShadowStyle, useSoftShadow } from "@/theme/shadows";
import { DIALOG_MAX_WIDTH, radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { PropertyBoardArt } from "@/features/property-board/property-board-art";
import { FitText } from "@/components/fit-text";

export const PROPERTY_BOARD_ARTWORK = require("../../../assets/images/workspace/property-board.jpg");

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
  const softShadow = useSoftShadow();
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xxs }}>
        <Text style={[type.description, { color: colors.muted }]}>
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
          ...softShadow(colors.shadow, 4, 10, 0.65),
        }}
      >
        {/* Drawn, not a picture (user, 2026-11-15). */}
        <PropertyBoardArt />
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
              <FitText
                numberOfLines={2}
                style={{
                  color: colors.ink,
                  fontFamily: fonts.displaySoft,
                  fontSize: 14,
                  lineHeight: 18,
                }}
              >
                {item.title}
              </FitText>
              <FitText
                numberOfLines={2}
                style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}
              >
                {item.body}
              </FitText>
            </View>
            <ChevronRight color={colors.muted} size={15} strokeWidth={2} />
          </AnimatedPressable>
        ))}
      </View>
    </Card>
  );
}

/** The cork, its frame and the pins (user, 2026-11-10): a notice board, not a photo of one. */
const CORK = {
  colors: ["#E7C38F", "#DDB27A", "#D3A36A"] as const,
  frame: "#A8743F",
  speck: "rgba(120, 72, 28, 0.16)",
  ink: "#3D2410",
  paper: "#FFFBF1",
  paperEdge: "#EADFC8",
  paperInk: "#2A1B0C",
  paperMuted: "#7A6550",
};
const PIN_COLORS = ["#E5484D", "#3E63DD", "#30A46C", "#F5A524"];

/** Cork specks, fixed so the board looks the same on every render. */
const CORK_SPECKS = Array.from({ length: 42 }, (_, index) => ({
  left: `${(index * 37 + 11) % 97}%` as const,
  size: 2 + (index % 3),
  top: `${(index * 53 + 7) % 95}%` as const,
}));

function Pushpin({ color }: { color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        alignSelf: "center",
        backgroundColor: color,
        borderColor: "rgba(0, 0, 0, 0.18)",
        borderRadius: 999,
        borderWidth: 1,
        height: 12,
        position: "absolute",
        top: -6,
        width: 12,
        ...softShadowStyle("rgba(0, 0, 0, 0.35)", 1, 2),
      }}
    >
      <View style={{ backgroundColor: "rgba(255, 255, 255, 0.55)", borderRadius: 999, height: 4, left: 2, position: "absolute", top: 2, width: 4 }} />
    </View>
  );
}

export function PropertyBoardHomeCard({
  fill = false,
  items,
  lockedText,
  onOpenBoard,
  onOpenItem,
}: {
  /** Grow to the carousel row's height. */
  fill?: boolean;
  items: PropertyBoardItem[];
  /** Set while the board is closed to this person: shown in place of the items. */
  lockedText?: string;
  onOpenBoard: () => void;
  onOpenItem: (item: PropertyBoardItem) => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ borderRadius: radii.card, flex: fill ? 1 : undefined, ...softShadowStyle(colors.shadow, 4, 12) }}>
      <LinearGradient
        colors={CORK.colors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          borderColor: CORK.frame,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 4,
          flex: fill ? 1 : undefined,
          gap: spacing.md,
          overflow: "hidden",
          padding: spacing.md,
        }}
      >
        {CORK_SPECKS.map((speck, index) => (
          <View
            key={index}
            pointerEvents="none"
            style={{
              backgroundColor: CORK.speck,
              borderRadius: 999,
              height: speck.size,
              left: speck.left,
              position: "absolute",
              top: speck.top,
              width: speck.size,
            }}
          />
        ))}
        <AnimatedPressable
          accessibilityHint="Opens the full property board"
          accessibilityLabel="Open property board"
          accessibilityRole="button"
          onPress={onOpenBoard}
          style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
        >
          <MaterialCommunityIcons color={CORK.ink} name="pin" size={22} />
          <FitText
            minimumFontScale={0.8}
            numberOfLines={1}
            style={[type.display, { color: CORK.ink, flex: 1, fontSize: 22, lineHeight: 27 }]}
          >
            Property Board
          </FitText>
          <View
            style={{
              alignItems: "center",
              backgroundColor: CORK.paper,
              borderRadius: 999,
              height: 32,
              justifyContent: "center",
              width: 32,
            }}
          >
            <ChevronRight color={CORK.ink} size={18} strokeWidth={2.2} />
          </View>
        </AnimatedPressable>

        {lockedText ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Lock color={CORK.ink} size={15} strokeWidth={2.2} />
            <Text style={[type.body, { color: CORK.ink }]}>{lockedText}</Text>
          </View>
        ) : items.length > 0 ? (
          // Each item a paper note pinned to the cork.
          <View style={{ gap: spacing.md, paddingTop: 2 }}>
            {items.map((item, index) => (
              <AnimatedPressable
                accessibilityHint="Opens this item on the full property board"
                accessibilityLabel={item.categoryName + ": " + item.title}
                accessibilityRole="button"
                key={item.id}
                onPress={() => onOpenItem(item)}
                style={{
                  backgroundColor: CORK.paper,
                  borderColor: CORK.paperEdge,
                  borderCurve: "continuous",
                  borderRadius: 6,
                  borderWidth: 1,
                  gap: 2,
                  minHeight: 58,
                  paddingBottom: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingTop: spacing.sm + 2,
                  ...softShadowStyle("rgba(60, 30, 5, 0.28)", 2, 5),
                }}
              >
                <Pushpin color={PIN_COLORS[index % PIN_COLORS.length]} />
                {/* One line each, cut with an ellipsis, never shrunk (user, 2026-11-10). */}
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={{ color: CORK.paperInk, fontFamily: fonts.displaySoft, fontSize: 14.5, lineHeight: 19 }}
                >
                  {item.title}
                </Text>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={{ color: CORK.paperMuted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 17 }}
                >
                  {item.body}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

/** What the modal reads: a board item, or a notice dressed as one. */
export type BoardNote = { body: string; categoryName: string; title: string };

export function PropertyBoardItemModal({
  icon,
  item,
  onClose,
  plain = false,
}: {
  /** The disc beside the category, the board's clipboard unless given. */
  icon?: React.ReactNode;
  item: BoardNote | null;
  onClose: () => void;
  /** No disc and no category line: the title sits beside the cross (user, 2026-11-13, a notice). */
  plain?: boolean;
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
      // The device back button closes it too (user, 2026-09-29).
      onRequestClose={onClose}
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
            <View style={{ alignItems: plain ? "flex-start" : "center", flexDirection: "row", gap: spacing.md }}>
              {plain ? <View style={{ flex: 1, paddingTop: 6 }}>
                <ModalTitle
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.displaySoft,
                    fontSize: 22,
                    letterSpacing: -0.35,
                    lineHeight: 27,
                  }}
                >
                  {item.title}
                </ModalTitle>
              </View> : <>
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
                {icon ?? <PropertyBoardCategoryIcon color={colors.inkSoft} size={24} />}
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
              </>}
              <AnimatedPressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                // Smaller (user, 2026-11-15), still easy to hit.
                hitSlop={8}
                onPress={onClose}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 30,
                  justifyContent: "center",
                  // Level with the title's first line in the plain (notice) layout.
                  marginTop: plain ? 4 : 0,
                  width: 30,
                }}
              >
                <X color={colors.inkSoft} size={16} strokeWidth={2.2} />
              </AnimatedPressable>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }}
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
              {plain ? null : (
              <ModalTitle
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.displaySoft,
                    fontSize: 22,
                    letterSpacing: -0.35,
                    lineHeight: 27,
                  }}
                >
                  {item.title}
                </ModalTitle>
              )}
              <ModalTitleRule />
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
