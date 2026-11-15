import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FILTER_CHIP_RADIUS } from "@/components/filter-bubbles";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SectionHeading } from "@/components/section-heading";
import { useHardwareBack } from "@/components/use-hardware-back";
import { useSoftShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type FilterOption<T extends string> = { count?: number; danger?: boolean; label: string; value: T };

/**
 * A queue with its filter (user, 2026-09-30). The count line runs across the
 * top with a filter bubble at its far right, and the bubble's list floats over
 * the cards below rather than pushing them down. "All" comes first and is the
 * default.
 *
 * <p>The list is drawn inside this wrapper, which also holds the cards, so it
 * stays within its parent's bounds: Android drops touches on anything drawn
 * outside them. The wrapper grows while the list is open, in case the queue
 * is shorter than the list.
 */
export function FilteredQueue<T extends string>({
  blink = false,
  children,
  count,
  heading,
  headingNode,
  hideHeader = false,
  onChange,
  options,
  value,
}: {
  blink?: boolean;
  /**
   * Leaves out the count and the filter pill, for a queue with nothing in it under
   * any filter (Manage Visits' Upcoming and Missed, user 2026-11-14): its empty state
   * says so, and a filter over nothing has nothing to narrow.
   */
  hideHeader?: boolean;
  children: ReactNode;
  count?: number;
  heading: string;
  /** Drawn in place of the plain count line, for a screen that wants its own (My enquiries). */
  headingNode?: ReactNode;
  onChange: (value: T) => void;
  options: FilterOption<T>[];
  value: T;
}) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [menuHeight, setMenuHeight] = useState(0);
  const chosen = options.find((option) => option.value === value) ?? options[0];
  const menuTop = headerHeight + spacing.xs;

  // The device back closes the list first, like any other open overlay.
  const closeOnBack = useCallback(() => {
    setOpen(false);
    return true;
  }, []);
  useHardwareBack(closeOnBack, open);

  return (
    <View style={{ gap: spacing.md, minHeight: open ? menuTop + menuHeight + spacing.sm : undefined }}>
      {hideHeader ? null : (
        <View
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
          style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            {headingNode ?? <TabHeading count={count} text={heading} />}
          </View>
          <FilterBubble blink={blink} label={chosen.label} onPress={() => setOpen((current) => !current)} open={open} />
        </View>
      )}
      {children}
      {open ? (
        <>
          {/* Clear, so a tap anywhere on the queue closes the list instead of
              opening the card under it. A sibling of the list, never its parent. */}
          <Pressable accessibilityLabel="Close filter" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
          <View
            onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              elevation: 12,
              padding: spacing.xs,
              position: "absolute",
              right: 0,
              ...softShadow(colors.shadow, 6, 14, 0.16),
              top: menuTop,
              width: 220,
              zIndex: 20,
            }}
          >
            {options.map((option) => (
              <PickerOptionRow
                key={option.value}
                label={option.label}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                selected={option.value === value}
                trailing={
                  option.count == null ? undefined : (
                    <Text
                      style={{
                        color: option.danger && option.count > 0 ? colors.danger : colors.muted,
                        fontFamily: fonts.sansBold,
                        fontSize: 12,
                      }}
                    >
                      {option.count}
                    </Text>
                  )
                }
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * A section whose heading band carries a choice at its right, such as how the
 * cards under it are sorted (user, 2026-10-04). The same bubble and the same
 * list as {@link FilteredQueue}: the list opens straight under the bubble,
 * inside this wrapper, floating over the cards rather than pushing them down.
 *
 * <p>A row may carry an action of its own at its right, such as Change on the
 * Manage tab's Custom row. And the bubble may be replaced for a while by
 * something else, as it is by the tick and cross while cards are being
 * arranged: the list cannot be opened then.
 */
export function SectionWithDropdown<T extends string>({
  beforeFilter,
  children,
  header,
  icon,
  onChange,
  options,
  purpose,
  replacement,
  title,
  value,
}: {
  /** An optional compact control beside the existing filter, without changing its UI. */
  beforeFilter?: ReactNode;
  children: ReactNode;
  /**
   * Draws the controls into something else instead of a subheading: the screen's
   * own header, say, with the controls beside its title (user, 2026-11-14: Manage).
   */
  header?: (controls: ReactNode) => ReactNode;
  /** A mark before the chosen label, saying what the list is for. */
  icon?: ComponentType<LucideProps>;
  onChange: (value: T) => void;
  options: (FilterOption<T> & { action?: { label: string; onPress: () => void } })[];
  /** What the choice is, for a screen reader: "Sort", say. */
  purpose: string;
  /** Drawn in place of the bubble. */
  replacement?: ReactNode;
  title: string;
  value: T;
}) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [menuHeight, setMenuHeight] = useState(0);
  const chosen = options.find((option) => option.value === value) ?? options[0];
  const menuTop = headerHeight + spacing.xs;

  const closeOnBack = useCallback(() => {
    setOpen(false);
    return true;
  }, []);
  useHardwareBack(closeOnBack, open);

  // Kept the same element until something in it changes: a screen header that
  // carries these (Manage's, which lifts itself into the fixed bar) re-publishes
  // on every new element, and a fresh one each render looped without end.
  const filterControl = useMemo(
    () =>
      replacement ?? (
        <FilterBubble
          blink={false}
          icon={icon}
          label={chosen.label}
          onPress={() => setOpen((current) => !current)}
          open={open}
          purpose={purpose}
        />
      ),
    [chosen.label, icon, open, purpose, replacement],
  );

  const controls = useMemo(
    () =>
      beforeFilter ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          {beforeFilter}
          {filterControl}
        </View>
      ) : (
        filterControl
      ),
    [beforeFilter, filterControl],
  );

  return (
    <View style={{ gap: spacing.md, minHeight: open ? menuTop + menuHeight + spacing.sm : undefined }}>
      <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
        {header ? header(controls) : <SectionHeading title={title} trailing={controls} />}
      </View>
      {children}
      {open && !replacement ? (
        <>
          {/* Clear, so a tap anywhere closes the list instead of opening the
              card under it. A sibling of the list, never its parent. */}
          <Pressable accessibilityLabel={`Close ${purpose.toLowerCase()}`} onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
          <View
            onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              elevation: 12,
              padding: spacing.xs,
              position: "absolute",
              right: 0,
              ...softShadow(colors.shadow, 6, 14, 0.16),
              top: menuTop,
              width: 200,
              zIndex: 20,
            }}
          >
            {options.map((option) => (
              <PickerOptionRow
                key={option.value}
                label={option.label}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                selected={option.value === value}
                trailing={
                  option.action ? (
                    <AnimatedPressable
                      accessibilityLabel={`${option.action.label} ${option.label}`}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => {
                        setOpen(false);
                        option.action?.onPress();
                      }}
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.borderStrong,
                        borderRadius: 999,
                        borderWidth: 1,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12 }}>
                        {option.action.label}
                      </Text>
                    </AnimatedPressable>
                  ) : option.count == null ? undefined : (
                    <Text
                      style={{
                        color: option.danger && option.count > 0 ? colors.danger : colors.muted,
                        fontFamily: fonts.sansBold,
                        fontSize: 12,
                      }}
                    >
                      {option.count}
                    </Text>
                  )
                }
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * A search box with the filter bubble beside it (user, 2026-11-03). The same bubble
 * and the same list as {@link FilteredQueue}: the list floats over the cards below,
 * inside this wrapper, which grows while it is open so Android delivers its touches.
 */
export function FilteredSearch<T extends string>({
  bubbleLabel,
  children,
  onChange,
  options,
  purpose,
  search,
  value,
}: {
  /** What the closed pill says, shorter than the option itself (2026-11-11: My bills). */
  bubbleLabel?: (option: FilterOption<T>) => string;
  children: ReactNode;
  onChange: (value: T) => void;
  options: FilterOption<T>[];
  /** What the choice is, for a screen reader. */
  purpose: string;
  search: ReactNode;
  value: T;
}) {
  const softShadow = useSoftShadow();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [menuHeight, setMenuHeight] = useState(0);
  const chosen = options.find((option) => option.value === value) ?? options[0];
  const menuTop = headerHeight + spacing.xs;

  const closeOnBack = useCallback(() => {
    setOpen(false);
    return true;
  }, []);
  useHardwareBack(closeOnBack, open);

  return (
    <View style={{ gap: spacing.md, minHeight: open ? menuTop + menuHeight + spacing.sm : undefined }}>
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>{search}</View>
        <FilterBubble blink={false} label={bubbleLabel ? bubbleLabel(chosen) : chosen.label} onPress={() => setOpen((current) => !current)} open={open} pill purpose={purpose} />
      </View>
      {children}
      {open ? (
        <>
          {/* Clear, so a tap anywhere closes the list instead of opening the
              card under it. A sibling of the list, never its parent. */}
          <Pressable accessibilityLabel={`Close ${purpose.toLowerCase()}`} onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
          <View
            onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              elevation: 12,
              padding: spacing.xs,
              position: "absolute",
              right: 0,
              ...softShadow(colors.shadow, 6, 14, 0.16),
              top: menuTop,
              width: 200,
              zIndex: 20,
            }}
          >
            {options.map((option) => (
              <PickerOptionRow
                key={option.value}
                label={option.label}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                selected={option.value === value}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * The bubble that opens a queue's filter. It blinks a red ring while escalated
 * concerns are waiting, as the Escalated chip it replaced did.
 */
/**
 * A choice on a pill beside a search bar (user, 2026-11-13): just enough of it,
 * then … ("Room change" reads "Room…"), so the search keeps its width.
 */
export function pillChoice(label: string) {
  const words = label.trim().split(/\s+/);
  return words.length > 1 ? `${words[0]}…` : label;
}

/** The widest a pill's choice gets before it ends in …, whatever the words. */
export const PILL_CHOICE_MAX_WIDTH = 56;

function FilterBubble({
  blink,
  icon: Icon,
  label,
  onPress,
  open,
  pill = false,
  purpose = "Filter",
}: {
  blink: boolean;
  icon?: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  open: boolean;
  /** Beside a search bar: the request desk's round grey pill, the bar's own shape (user, 2026-11-13). */
  pill?: boolean;
  purpose?: string;
}) {
  const { colors, fonts } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!blink) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.15, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, pulse]);

  return (
    <AnimatedPressable
      accessibilityLabel={`${purpose}: ${label}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={{
        alignItems: "center",
        // White with the search bar's edge, no grey fill (user, 2026-11-14).
        backgroundColor: colors.surface,
        borderColor: `${colors.ink}40`,
        borderRadius: pill ? 999 : FILTER_CHIP_RADIUS,
        borderWidth: 1,
        flexDirection: "row",
        gap: pill ? 4 : 6,
        ...(pill ? { height: 36 } : { paddingVertical: 6 }),
        paddingLeft: spacing.md,
        paddingRight: spacing.sm,
      }}
    >
      {blink ? (
        <Animated.View
          pointerEvents="none"
          style={{
            borderColor: colors.danger,
            borderRadius: 999,
            borderWidth: 1.5,
            bottom: -1,
            left: -1,
            opacity: pulse,
            position: "absolute",
            right: -1,
            top: -1,
          }}
        />
      ) : null}
      {Icon ? <Icon color={colors.ink} size={14} strokeWidth={2.3} /> : null}
      {/* Just enough of the choice, then … (user, 2026-11-13). */}
      <Text ellipsizeMode="tail" numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: pill ? 12.5 : 13, maxWidth: pill ? PILL_CHOICE_MAX_WIDTH : 84 }}>{pill ? pillChoice(label) : label}</Text>
      {open ? (
        <ChevronUp color={colors.inkSoft} size={16} strokeWidth={2.4} />
      ) : (
        <ChevronDown color={colors.inkSoft} size={16} strokeWidth={2.4} />
      )}
    </AnimatedPressable>
  );
}

function TabHeading({ count, text }: { count?: number; text: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.caption, { color: colors.muted, fontWeight: "800", letterSpacing: 0.3 }]}>
      {count == null ? text : `${text} · ${count}`}
    </Text>
  );
}
