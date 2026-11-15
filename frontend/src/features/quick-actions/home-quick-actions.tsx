import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { ArrowRight, ChevronDown, Search, Zap } from "lucide-react-native";
import { LoadFailedCard } from "@/components/load-failed";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { FitText } from "@/components/fit-text";
import { Skeleton } from "@/components/skeleton";
import { buildActionItems } from "@/features/owner/action-center";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import type { OwnerDashboard } from "@/store/services/dashboard-api";
import { radii, spacing } from "@/theme/spacing";
import { SEARCH_BAR_HEIGHT, searchBarFrame } from "@/components/search-field";
import { useTheme } from "@/theme/use-theme";
import { suggestedQuickActions } from "./catalogue";
import { QuickActionSuggestionRow } from "./quick-action-ui";
import { useQuickActions } from "./use-quick-actions";

const COLLAPSED_SUGGESTION_COUNT = 3;

/**
 * Home shows three suggested rows below Pinned Services, with the remaining
 * suggestions behind Show more. The search and arrow open the full catalogue.
 */
export function HomeQuickActions({ dashboard }: { dashboard?: OwnerDashboard }) {
  const { colors, fonts } = useTheme();
  const router = useGuardedRouter();
  const model = useQuickActions();
  const [expanded, setExpanded] = useState(false);
  // Warm the destination before a tap, without delaying the press handler.
  useEffect(() => { router.prefetch("/owner-quick-actions"); }, [router]);
  const suggestions = suggestedQuickActions(model.actions,
    dashboard && dashboard.property?.propertyId === model.property?.id ? buildActionItems(dashboard) : [], model.recent);
  const visibleSuggestions = expanded ? suggestions : suggestions.slice(0, COLLAPSED_SUGGESTION_COUNT);
  const hiddenCount = Math.max(0, suggestions.length - COLLAPSED_SUGGESTION_COUNT);
  if (!model.loading && !model.error && !model.actions.length) return null;
  return <Card style={{ backgroundColor: colors.surface, borderColor: colors.border, gap: spacing.md, paddingBottom: spacing.sm }}>
    <AnimatedPressable accessibilityRole="button" accessibilityLabel="Open quick actions"
      onPress={() => router.push("/owner-quick-actions")} style={{ gap: spacing.md }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 28 }}>
      <Zap color="#111111" fill="#FFD54F" size={24} strokeWidth={1.6} />
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, lineHeight: 24,
        includeFontPadding: false, textAlignVertical: "center", flex: 1, minWidth: 0 }}>Quick actions</Text>
    </View>
    {/* Looks like a search field, opens the full list to search it (user, 2026-10-29). */}
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs }}>
      <View style={[searchBarFrame(colors), { flex: 1, minWidth: 0 }]}>
        <Search color={colors.muted} size={16} strokeWidth={2.2} />
        <FitText numberOfLines={1} minimumFontScale={0.85} style={{ color: colors.muted, flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 13.5 }}>What would you like to do?</FitText>
      </View>
      <View
        style={{ alignItems: "center", justifyContent: "center", width: SEARCH_BAR_HEIGHT, height: SEARCH_BAR_HEIGHT, borderRadius: 999, backgroundColor: colors.neutralSoft }}>
        <ArrowRight color={colors.ink} size={20} strokeWidth={2} />
      </View>
    </View>
    </AnimatedPressable>
    {model.loading ? <View style={{ gap: spacing.sm }}>
      {Array.from({ length: COLLAPSED_SUGGESTION_COUNT }, (_, index) => <Skeleton key={index} height={48} />)}
    </View>
      : model.error ? <LoadFailedCard onReload={model.retry} />
      : <>
        <View style={{ gap: spacing.sm }}>
          {visibleSuggestions.map(({ action, count, detail, route }) => <QuickActionSuggestionRow action={action} count={count} detail={detail} key={action.id} onPress={() => model.launch(action, route)} />)}
        </View>
        {hiddenCount > 0 ? <AnimatedPressable accessibilityRole="button" accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? "Show fewer suggested actions" : `Show ${hiddenCount} more suggested actions`}
          onPress={() => setExpanded((value) => !value)} hitSlop={4}
          style={{ alignSelf: "center", alignItems: "center", flexDirection: "row", gap: spacing.xs, minHeight: 36, paddingHorizontal: spacing.sm }}>
          <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>{expanded ? "Show less" : `Show ${hiddenCount} more`}</Text>
          <ChevronDown color={colors.primary} size={16} style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }} />
        </AnimatedPressable> : null}
      </>}
  </Card>;
}
