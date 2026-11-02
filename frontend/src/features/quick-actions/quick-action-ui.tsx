import { Image, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { AnimatedPressable } from "@/components/animated-pressable";
import { FitText } from "@/components/fit-text";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { QUICK_ACTION_CATEGORIES, searchQuickActions, type QuickAction } from "./catalogue";
import { quickActionColors } from "./action-colors";

const EMPTY_SEARCH_ARTWORK = require("../../../assets/empty-states/discovery-empty-search.png");

export function QuickActionRow({ action, detail, onPress }: { action: QuickAction; detail?: string; onPress: () => void }) {
  const { colors, fonts, isDark } = useTheme();
  const palette = quickActionColors(action, isDark);
  const Icon = action.icon;
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={detail ? `${action.label}, ${detail}` : action.label} onPress={onPress}
    style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 58, paddingVertical: spacing.sm }}>
    <View style={{ alignItems: "center", justifyContent: "center", backgroundColor: palette.fill, borderColor: palette.border, borderWidth: 1, borderRadius: 10, height: 38, width: 38 }}>
      <Icon color={palette.ink} size={22} strokeWidth={1.8} />
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{action.label}</FitText>
      {detail ? <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{detail}</Text> : null}
    </View>
    <ChevronRight color={colors.kicker} size={17} />
  </AnimatedPressable>;
}

/** Full-width Home suggestions; the count stays at the trailing edge, not over the icon. */
export function QuickActionSuggestionRow({ action, count, detail, onPress }: {
  action: QuickAction; count?: number; detail?: string; onPress: () => void;
}) {
  const { fonts, isDark } = useTheme();
  const palette = quickActionColors(action, isDark);
  const Icon = action.icon;
  const label = detail ? `${action.label}, ${detail}` : count != null && count > 0 ? `${action.label}, ${count} waiting` : action.label;
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ alignSelf: "stretch", alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 48,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 10,
      backgroundColor: palette.fill, borderColor: palette.border, borderWidth: 1 }}>
    <Icon color={palette.ink} size={22} strokeWidth={1.9} />
    <FitText numberOfLines={2} minimumFontScale={0.9} style={{ flex: 1, minWidth: 0, color: palette.ink,
      fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 20 }}>{action.label}</FitText>
    {count != null && count > 0 ? <View style={{ alignItems: "center", justifyContent: "center", minWidth: 18,
      minHeight: 18, paddingHorizontal: 4, borderRadius: 999, backgroundColor: palette.ink }}>
      <Text style={{ color: palette.fill, fontFamily: fonts.sansBold, fontSize: 10, lineHeight: 14 }}>{count > 99 ? "99+" : count}</Text>
    </View> : null}
  </AnimatedPressable>;
}

/** Icon-and-label tiles for the square category grid. */
export function QuickActionTile({ action, count, detail, square = false, onPress }: {
  action: QuickAction; count?: number; detail?: string; square?: boolean; onPress: () => void;
}) {
  const { fonts, isDark } = useTheme();
  const palette = quickActionColors(action, isDark);
  const Icon = action.icon;
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={detail ? `${action.label}, ${detail}` : action.label}
    onPress={onPress}
    style={{ flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", flexDirection: "column",
      aspectRatio: square ? 1 : undefined, minHeight: 64, gap: square ? spacing.xs : 4, paddingHorizontal: 4, paddingVertical: 4,
      borderRadius: 10, backgroundColor: palette.fill, borderColor: palette.border, borderWidth: 1 }}>
    <Icon color={palette.ink} size={square ? 27 : 23} strokeWidth={1.9} />
    <FitText minimumFontScale={0.9} numberOfLines={2} style={{ color: palette.ink, fontFamily: fonts.sansBold,
      fontSize: square ? 13 : 12, lineHeight: square ? 17 : 14, textAlign: "center", alignSelf: "stretch", flexShrink: 1 }}>{action.label}</FitText>
    {count != null && count > 0 ? <View style={{ position: "absolute", right: 4, top: 3, backgroundColor: palette.ink, borderRadius: 8, minWidth: 15, paddingHorizontal: 3, alignItems: "center" }}>
      <Text style={{ color: palette.fill, fontFamily: fonts.sansBold, fontSize: 9, lineHeight: 14 }}>{count > 99 ? "99+" : count}</Text>
    </View> : null}
  </AnimatedPressable>;
}

/** Equal square tiles, including the last partial row; they never stretch to fill missing columns. */
export function QuickActionGrid({ actions, onSelect }: { actions: QuickAction[]; onSelect: (action: QuickAction) => void }) {
  const columns = 3;
  return <View style={{ gap: spacing.sm }}>
    {Array.from({ length: Math.ceil(actions.length / columns) }, (_, row) => (
      <View key={row} style={{ flexDirection: "row", gap: spacing.sm }}>
        {Array.from({ length: columns }, (_, column) => {
          const action = actions[row * columns + column];
          return action ? <QuickActionTile key={action.id} action={action} square onPress={() => onSelect(action)} />
            : <View key={`empty-${column}`} pointerEvents="none" style={{ flex: 1, minWidth: 0 }} />;
        })}
      </View>
    ))}
  </View>;
}

/** A bounded attached results box: long searches scroll here, not past the Home card. */
export function QuickActionSearchResults({ actions, query, onSelect }: { actions: QuickAction[]; query: string; onSelect: (action: QuickAction) => void }) {
  const { colors, fonts } = useTheme();
  const results = searchQuickActions(actions, query);
  return <View accessibilityLabel="Quick action search results" style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 14, overflow: "hidden", paddingBottom: spacing.sm }}>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={{ maxHeight: 310 }} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
      {!results.matches.length ? (
        // What was asked, then where to go instead: the similar actions below (user, 2026-10-29).
        // No line under the title, as every empty state in the app.
        <View style={{ alignItems: "center", gap: spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.lg }}>
          <Image accessible={false} accessibilityIgnoresInvertColors resizeMethod="resize" resizeMode="contain"
            source={EMPTY_SEARCH_ARTWORK} style={{ height: 96, width: 96 }} />
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, textAlign: "center" }}>
            Nothing called “{query.trim()}”
          </Text>
        </View>
      ) : results.matches.map((action) => <QuickActionRow action={action} key={action.id} onPress={() => onSelect(action)}
        detail={QUICK_ACTION_CATEGORIES.find((category) => category.id === action.category)?.label} />)}
      {results.related.length ? <>
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.xs, paddingTop: spacing.sm }}>
          {/* Under "Nothing called" when nothing was near: other actions, not similar ones (user, 2026-10-29). */}
          <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 0.3 }}>{results.other ? "Other quick actions" : "Similar actions"}</Text>
        </View>
        {results.related.map((action) => <QuickActionRow action={action} key={action.id} onPress={() => onSelect(action)}
          detail={QUICK_ACTION_CATEGORIES.find((category) => category.id === action.category)?.label} />)}
      </> : null}
    </ScrollView>
  </View>;
}
