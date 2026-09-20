import { Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import type { ListingSort } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { DiscoveryButton } from "./discovery-button";

/**
 * Which orders a list offers.
 *
 * <p>Normal search can be put nearest first. AI search cannot, and does not
 * need to: when a sentence names a landmark its results are already ordered by
 * distance from THAT, and offering "nearest" would quietly mean something else
 * — nearest to the device — on the same screen.
 */
export type ListingSortContext = "search" | "ai";

const LABELS: Record<ListingSort, string> = {
  DEPOSIT_HIGH: "Deposit high to low",
  DEPOSIT_LOW: "Deposit low to high",
  DISTANCE: "Nearest first",
  RELEVANCE: "Best match",
  RENT_HIGH: "Rent high to low",
  RENT_LOW: "Rent low to high",
};

/** What the pill beside a results header says once an order is chosen. */
const SHORT_LABELS: Record<ListingSort, string> = {
  DEPOSIT_HIGH: "Deposit",
  DEPOSIT_LOW: "Deposit",
  DISTANCE: "Distance",
  RELEVANCE: "Sort",
  RENT_HIGH: "Rent",
  RENT_LOW: "Rent",
};

/** Orders that run low to high. Nearest first is shortest distance first. */
const ASCENDING = new Set<ListingSort>(["DEPOSIT_LOW", "DISTANCE", "RENT_LOW"]);

/**
 * The button beside a results header.
 *
 * <p>Small, grey and borderless: the count beside it is the heading, and this
 * is a control for it, so it should take as little of that line as it can. It
 * names the order in force whenever that is not the default, so a re-ordered
 * list never looks like the natural one.
 */
export function ListingSortButton({ onPress, sort }: { onPress: () => void; sort: ListingSort }) {
  const { colors, fonts } = useTheme();
  const active = sort !== "RELEVANCE";

  return (
    <AnimatedPressable
      accessibilityLabel={active ? `Sorted by ${LABELS[sort]}. Change sort` : "Sort listings"}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderRadius: 999,
        flexDirection: "row",
        flexShrink: 0,
        gap: 4,
        paddingHorizontal: spacing.xs + 2,
        paddingVertical: 4,
      }}
    >
      {active ? (
        <>
          <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 11 }}>{SHORT_LABELS[sort]}</Text>
          {/* Down is low to high, up is high to low. The arrow says the
              direction so the pill can stay one word. */}
          {ASCENDING.has(sort) ? (
            <ArrowDown color={colors.primary} size={12} strokeWidth={2.6} />
          ) : (
            <ArrowUp color={colors.primary} size={12} strokeWidth={2.6} />
          )}
        </>
      ) : (
        <>
          <ArrowUpDown color={colors.inkSoft} size={12} strokeWidth={2.4} />
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 11 }}>Sort</Text>
        </>
      )}
    </AnimatedPressable>
  );
}

/**
 * Choosing an order.
 *
 * <p>One tap applies and closes. Unlike filters there is nothing to combine, so
 * an Apply button would only be a second tap for the same decision.
 */
export function ListingSortModal({
  context,
  onChange,
  onClose,
  sort,
  visible,
}: {
  context: ListingSortContext;
  onChange: (sort: ListingSort) => void;
  onClose: () => void;
  sort: ListingSort;
  visible: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();

  // Tapping the order already in force undoes it. The AI sheet has no "Best
  // match" option to go back to — its default order is fixed and not offered —
  // so this is the way back there, and it works the same in both sheets.
  function choose(next: ListingSort) {
    onChange(next === sort ? "RELEVANCE" : next);
    onClose();
  }

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        {/* Tapping the dim closes it, as every sheet here does. */}
        <AnimatedPressable accessibilityLabel="Close sort" onPress={onClose} style={{ flex: 1 }} />
        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: "hidden",
            paddingBottom: spacing.lg + insets.bottom,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              backgroundColor: colors.borderStrong,
              borderRadius: 999,
              height: 5,
              marginTop: spacing.sm,
              width: 42,
            }}
          />
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              paddingBottom: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.45 }}>
              Sort listings
            </Text>
            <Text style={[type.caption, { color: colors.muted, fontSize: 13 }]}>
              {context === "ai"
                ? "Closest to what you asked for comes first by default."
                : "Best matches come first by default."}
            </Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="Close sort"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={{
                alignItems: "center",
                // Level with the title rather than centred on title and
                // description together, which sat it low beside the heading.
                alignSelf: "flex-start",
                backgroundColor: colors.neutralSoft,
                borderRadius: 999,
                height: 34,
                justifyContent: "center",
                width: 34,
              }}
            >
              <X color={colors.muted} size={17} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

          <View style={{ gap: spacing.md, paddingHorizontal: spacing.md }}>
            {context === "search" ? (
              <SortGroup options={["RELEVANCE", "DISTANCE"]} onChoose={choose} sort={sort} title="Order" />
            ) : null}
            <SortGroup options={["RENT_LOW", "RENT_HIGH"]} onChoose={choose} sort={sort} title="Rent" />
            <SortGroup options={["DEPOSIT_LOW", "DEPOSIT_HIGH"]} onChoose={choose} sort={sort} title="Deposit" />

            {/* Last, full width. Dimmed while there is nothing to clear. */}
            <DiscoveryButton
              disabled={sort === "RELEVANCE"}
              label="Clear all filters"
              onPress={() => {
                onChange("RELEVANCE");
                onClose();
              }}
              style={{ marginTop: spacing.xs }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SortGroup({
  onChoose,
  options,
  sort,
  title,
}: {
  onChoose: (sort: ListingSort) => void;
  options: ListingSort[];
  sort: ListingSort;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.eyebrow, { color: colors.kicker, paddingHorizontal: spacing.xs }]}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {options.map((option) => {
          const selected = option === sort;
          return (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => onChoose(option)}
              style={{
                alignItems: "center",
                backgroundColor: selected ? colors.inkSoft : colors.surface,
                borderColor: selected ? colors.inkSoft : colors.border,
                borderRadius: 12,
                borderWidth: 1,
                flexBasis: "46%",
                flexDirection: "row",
                flexGrow: 1,
                gap: 6,
                justifyContent: "center",
                minHeight: 48,
                paddingHorizontal: spacing.sm,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: selected ? colors.surface : colors.ink,
                  flexShrink: 1,
                  fontFamily: fonts.sansBold,
                  fontSize: 12.5,
                }}
              >
                {LABELS[option]}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * AI results, re-ordered on the device.
 *
 * <p>Safe here because an AI search arrives whole — every ranked listing is
 * already in hand. A missing rent always goes last, whichever way rent runs,
 * because "on request" is neither the cheapest nor the dearest.
 */
export function sortListings<T extends { property: { startingRoomRentPaise: number | null; standardDepositPaise: number } }>(
  items: T[],
  sort: ListingSort,
): T[] {
  if (sort === "RELEVANCE" || sort === "DISTANCE") {
    return items;
  }
  const byRent = (direction: 1 | -1) => (a: T, b: T) => {
    const left = a.property.startingRoomRentPaise;
    const right = b.property.startingRoomRentPaise;
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return (left - right) * direction;
  };
  const byDeposit = (direction: 1 | -1) => (a: T, b: T) =>
    (a.property.standardDepositPaise - b.property.standardDepositPaise) * direction;

  const order =
    sort === "RENT_LOW" ? byRent(1)
      : sort === "RENT_HIGH" ? byRent(-1)
        : sort === "DEPOSIT_LOW" ? byDeposit(1)
          : byDeposit(-1);
  // A copy, and a stable sort: equal listings keep the order they were ranked in.
  return [...items].sort(order);
}
