import { useState, type ReactNode } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { Search, SlidersHorizontal, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { cardShadow, softShadow } from "@/theme/shadows";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The search bar's height: thin and compact (user, 2026-11-13). */
export const SEARCH_BAR_HEIGHT = 38;
export const SEARCH_BAR_HEIGHT_COMPACT = 34;

/**
 * Every search bar's frame, app wide (user, 2026-11-13): a pill with a thin
 * edge floating on a soft shadow, the search glyph bare inside on the left.
 * Hand-built bars (Home quick actions, Nearby, pickers) take it too.
 */
export function searchBarFrame(colors: { ink: string; primary: string; shadow: string; surface: string }, { compact = false, focused = false }: { compact?: boolean; focused?: boolean } = {}): ViewStyle {
  return {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: focused ? colors.primary : `${colors.ink}40`,
    borderRadius: 999,
    borderWidth: focused ? 1.5 : 1,
    flexDirection: "row",
    gap: 6,
    minHeight: compact ? SEARCH_BAR_HEIGHT_COMPACT : SEARCH_BAR_HEIGHT,
    paddingHorizontal: compact ? 10 : 12,
    ...cardShadow(colors.shadow),
  };
}

/**
 * The filter button by a search bar (user, 2026-11-13): round like the bar.
 * Beside it, the bar's own height, edge and shadow. Inside it (`inside`), a
 * smaller grey disc. Solid blue while a filter is on, with the count on a red dot.
 */
export function SearchFilterButton({ accessibilityLabel, active, count = 0, inside = false, onPress }: {
  accessibilityLabel: string;
  active: boolean;
  count?: number;
  inside?: boolean;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  const size = inside ? SEARCH_BAR_HEIGHT - 10 : SEARCH_BAR_HEIGHT;
  return (
    <AnimatedPressable
      accessibilityLabel={count > 0 ? `${accessibilityLabel}, ${count} on` : accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={inside ? 8 : 4}
      onPress={onPress}
      style={{
        alignItems: "center",
        // Never a grey disc, inside the bar or beside it: white with the bar's edge (user, 2026-11-14).
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : `${colors.ink}40`,
        borderRadius: 999,
        borderWidth: 1,
        height: size,
        justifyContent: "center",
        width: size,
        ...(inside ? {} : cardShadow(colors.shadow)),
      }}
    >
      <SlidersHorizontal color={active ? colors.onPrimary : colors.ink} size={inside ? 15 : 16} strokeWidth={2.3} />
      {count > 0 ? (
        <View style={{ alignItems: "center", backgroundColor: colors.danger, borderColor: colors.surface, borderRadius: 999, borderWidth: 1.5, height: 16, justifyContent: "center", minWidth: 16, paddingHorizontal: 3, position: "absolute", right: -4, top: -4 }}>
          <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 9.5, lineHeight: 12 }}>{count}</Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

/**
 * Reusable search box for history/data screens: leading search icon, clear
 * button, themed focus border.
 */
export function SearchField({
  animatePlaceholder = true,
  autoCapitalize = "none",
  autoFocus = false,
  clearButtonVariant = "plain",
  compact = false,
  onChangeText,
  placeholder,
  trailing,
  value,
}: {
  // Marquee a long placeholder that overflows the box instead of ellipsising it.
  animatePlaceholder?: boolean;
  /**
   * "characters" for screens searched by reference code — the request queues
   * look up TEX-2026-000042, and a lower-case keyboard there means shifting
   * for every letter of something that is never lower case.
   */
  autoCapitalize?: "none" | "characters";
  /** Opens with the keyboard up: a search the person came here to type (2026-10-29, Quick actions from Home). */
  autoFocus?: boolean;
  /** A grey circular clear button where requested; other search fields keep their plain cross. */
  clearButtonVariant?: "plain" | "circle";
  /** A shorter field for Home's compact quick-actions card; full screen searches keep their height. */
  compact?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  /**
   * A control on the right of the box, behind a hairline rule.
   *
   * <p>Inside the field rather than beside it: a filter button set next to the
   * box is a second object competing with it, when what it does is narrow the
   * same search. Sharing one border says they are one control.
   */
  trailing?: ReactNode;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={searchBarFrame(colors, { compact, focused })}>
      <Search color={focused ? colors.primary : colors.kicker} size={compact ? 15 : 16} strokeWidth={2.2} />
      <AppTextInput
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        marqueePlaceholder={animatePlaceholder}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        // No padding of its own around the words: the bar is the box (user, 2026-11-13).
        style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: compact ? 13 : 14, includeFontPadding: false, minHeight: (compact ? SEARCH_BAR_HEIGHT_COMPACT : SEARCH_BAR_HEIGHT) - 2, paddingVertical: 0 }}
        value={value}
      />
      {value.length > 0 ? (
        <AnimatedPressable accessibilityLabel="Clear search" onPress={() => onChangeText("")} hitSlop={clearButtonVariant === "circle" ? 10 : undefined}
          style={clearButtonVariant === "circle"
            ? { alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 999, backgroundColor: colors.neutralSoft }
            : { padding: 2 }}>
          <X color={colors.muted} size={clearButtonVariant === "circle" ? 15 : 17} strokeWidth={2.3} />
        </AnimatedPressable>
      ) : null}
      {trailing ? (
        <>
          {/* Inset top and bottom rather than a full-height edge, so the rule
              reads as a separator inside one control instead of the seam
              between two. */}
          <View style={{ alignSelf: "stretch", backgroundColor: colors.border, marginVertical: 8, width: 1 }} />
          {trailing}
        </>
      ) : null}
    </View>
  );
}
