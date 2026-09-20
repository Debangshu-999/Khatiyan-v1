import { createContext, useContext, type ReactNode } from "react";
import { Image, StyleSheet, Text, View, type ImageProps, type TextProps, type DimensionValue } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { Skeleton } from "./primitives";

/**
 * Whether the subtree is standing in for content that has not arrived.
 *
 * <p>Read by the Ghost* components below. Nothing else should consult it: a
 * component that branches on this is a component with two layouts, which is the
 * drift this exists to end.
 */
const SkeletonContext = createContext(false);

export function useIsSkeleton() {
  return useContext(SkeletonContext);
}

/**
 * Renders a real component as its own loading placeholder.
 *
 * <p>
 * <b>The ghost IS the component.</b> Hand-drawn skeletons were a second,
 * parallel layout that nobody updated when the real card changed — which is
 * why the app's placeholders were smaller than the screens they stood for and
 * showed a different structure. Here the card renders normally, with sample
 * data, and every leaf inside it draws as a pulsing bar at exactly the size the
 * text would have been. When the card is redesigned its skeleton is redesigned
 * with it, because there is only one card.
 *
 * <p>
 * Inert and invisible to assistive tech: it is scenery, and a screen reader
 * announcing sample values as if they were the tenant's would be worse than
 * silence.
 */
export function SkeletonBoundary({ children }: { children: ReactNode }) {
  return (
    <SkeletonContext.Provider value>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
        {children}
      </View>
    </SkeletonContext.Provider>
  );
}

/**
 * Text that becomes a bar while loading.
 *
 * <p>
 * The bar takes its height from the style's own {@code fontSize} and sits in a
 * box of the style's {@code lineHeight}, so the line occupies the same vertical
 * space either way. That is the whole trick — a placeholder that reserves a
 * different height is what makes a list lurch when the data lands.
 */
export function GhostText({
  children,
  ghostWidth,
  style,
  ...rest
}: TextProps & {
  /** How wide the bar is. Vary it between lines so a card does not look ruled. */
  ghostWidth?: DimensionValue;
}) {
  const isSkeleton = useIsSkeleton();

  if (!isSkeleton) {
    return (
      <Text style={style} {...rest}>
        {children}
      </Text>
    );
  }

  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = typeof flat.fontSize === "number" ? flat.fontSize : 14;
  const lineHeight = typeof flat.lineHeight === "number" ? flat.lineHeight : Math.round(fontSize * 1.35);
  // Cap height rather than the full em box: a bar as tall as the line reads as
  // a filled block, not as a line of text waiting to appear.
  const bar = Math.max(8, Math.round(fontSize * 0.72));

  // The text's own flex carries over. Text that fills a row (flex: 1 beside an
  // icon) would otherwise ghost as a box with no width, and a percentage bar
  // inside a zero-width box draws nothing.
  return (
    <View style={{ flex: flat.flex, height: lineHeight, justifyContent: "center" }}>
      <Skeleton height={bar} radius={Math.round(bar / 2)} width={ghostWidth ?? "68%"} />
    </View>
  );
}

/** An image that becomes a block of its own dimensions while loading. */
export function GhostImage({ style, ...rest }: ImageProps) {
  const isSkeleton = useIsSkeleton();

  if (!isSkeleton) {
    return <Image style={style} {...rest} />;
  }

  const flat = StyleSheet.flatten(style) ?? {};
  const height = typeof flat.height === "number" ? flat.height : 40;
  const width = typeof flat.width === "number" ? flat.width : height;
  const radius = typeof flat.borderRadius === "number" ? flat.borderRadius : 10;

  return <Skeleton height={height} radius={radius} width={width} />;
}

/**
 * A lucide icon that becomes a rounded block at its own size.
 *
 * <p>Takes the component rather than rendering children, so a call site reads
 * {@code <GhostIcon icon={ReceiptText} size={28} />} — the same shape as every
 * other icon prop in the app.
 */
export function GhostIcon({
  color,
  icon: Icon,
  size = 24,
  strokeWidth,
}: {
  color: string;
  icon: React.ComponentType<LucideProps>;
  size?: number;
  strokeWidth?: number;
}) {
  const isSkeleton = useIsSkeleton();

  if (!isSkeleton) {
    return <Icon color={color} size={size} strokeWidth={strokeWidth} />;
  }

  return <Skeleton height={size} radius={Math.round(size / 3)} width={size} />;
}

/**
 * A pill — a status badge, a chip — as a rounded bar of its own height.
 *
 * <p>Wraps rather than replaces, because badges are composed differently in
 * different places and their only stable properties are "rounded" and "short".
 */
export function GhostPill({ children, height = 22, width = 64 }: { children: ReactNode; height?: number; width?: number }) {
  const isSkeleton = useIsSkeleton();

  if (!isSkeleton) {
    return <>{children}</>;
  }

  return <Skeleton height={height} radius={999} width={width} />;
}
