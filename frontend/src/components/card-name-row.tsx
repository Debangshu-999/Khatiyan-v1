import { Children, isValidElement, type ReactNode } from "react";
import { View, type TextStyle, type ViewStyle } from "react-native";

import { spacing } from "@/theme/spacing";

/**
 * The name a row below its status chip, on every card that had them side by side
 * (user, 2026-11-01). The user may ask for this back: false restores the old row
 * on all of them. See docs/card-name-row-change.md.
 */
export const NAME_UNDER_STATUS = true;

/** Smaller text on those same cards (user, 2026-11-01). False restores the old sizes. */
export const CARD_TEXT_SMALLER = true;

/** A card's font size. Names and other large text drop by 2, the rest by 1, and nothing goes below 10. */
export function cardText(size: number) {
  if (!CARD_TEXT_SMALLER) return size;
  return size >= 17 ? size - 2 : Math.max(10, size - 1);
}

/** A theme text style at the card's size. */
export function smallerCardText<T extends TextStyle>(style: T): T {
  return typeof style.fontSize === "number" ? { ...style, fontSize: cardText(style.fontSize) } : style;
}

/**
 * The chip's row, tucked into the card's corner and overlapping the row below, so
 * no band of empty space opens above the name (user, 2026-11-01). The name still
 * starts below the chip, so a long one has the card's full width.
 */
export const CARD_STATUS_ROW: ViewStyle = {
  flexDirection: "row",
  justifyContent: "flex-end",
  marginBottom: -spacing.sm,
  marginRight: -spacing.xs,
  marginTop: -spacing.xs,
};

/** Marks the chip inside a {@link CardNameRow}. It draws nothing of its own. */
export function CardStatus({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/**
 * The card's identity and, as a {@link CardStatus} child, its status. `rowStyle`
 * is the row they used to share: with the flag off they share it again, exactly
 * as before. An empty CardStatus takes no row.
 */
export function CardNameRow({ children, rowStyle }: { children: ReactNode; rowStyle: ViewStyle }) {
  if (!NAME_UNDER_STATUS) {
    return <View style={rowStyle}>{children}</View>;
  }
  const items = Children.toArray(children);
  const isStatus = (item: ReactNode) => isValidElement(item) && item.type === CardStatus;
  const status = items.find(isStatus);
  const hasStatus = isValidElement<{ children?: ReactNode }>(status) && Boolean(status.props.children);
  return (
    <View>
      {hasStatus ? <View style={CARD_STATUS_ROW}>{status}</View> : null}
      <View style={rowStyle}>{items.filter((item) => !isStatus(item))}</View>
    </View>
  );
}
