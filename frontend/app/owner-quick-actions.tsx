import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { History, LockKeyhole } from "lucide-react-native";
import { LoadFailed } from "@/components/load-failed";
import { EmptyState } from "@/components/empty-state";
import { FilterPillRow } from "@/components/filter-bubbles";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import { QuickActionCategorySkeleton, QuickActionsScreenSkeleton } from "@/components/skeletons/owner/modules/quick-actions";
import { QUICK_ACTION_CATEGORIES, type QuickAction, type QuickActionCategory } from "@/features/quick-actions/catalogue";
import { QuickActionGrid, QuickActionRow, QuickActionSearchResults } from "@/features/quick-actions/quick-action-ui";
import { useQuickActions } from "@/features/quick-actions/use-quick-actions";
import { useStagedCategories } from "@/features/quick-actions/use-staged-categories";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The results last chosen from search, under the results box. */
function RecentSearches({ actions, ids, onSelect }: { actions: QuickAction[]; ids: string[]; onSelect: (action: QuickAction) => void }) {
  const { colors, fonts } = useTheme();
  const picks = ids.map((id) => actions.find((action) => action.id === id)).filter((action): action is QuickAction => Boolean(action));
  return <View style={{ gap: spacing.xs }}>
    <Text accessibilityRole="header" style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 0.3 }}>Recent searches</Text>
    {picks.length ? <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: 14, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
      {picks.map((action) => <QuickActionRow action={action} key={action.id} onPress={() => onSelect(action)}
        detail={QUICK_ACTION_CATEGORIES.find((category) => category.id === action.category)?.label} />)}
    </View> : <View style={{ alignItems: "center", borderColor: colors.border, borderRadius: 14, borderStyle: "dashed", borderWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", padding: spacing.md }}>
      <History color={colors.kicker} size={18} strokeWidth={2} />
      <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13 }}>No recent searches</Text>
    </View>}
  </View>;
}

/**
 * Every quick action, by category (2026-10-29): a row of category chips to
 * narrow the list instead of one long scroll, with recently chosen search
 * results first. Opened from Home's search with the keyboard already up.
 */
export default function OwnerQuickActionsScreen() {
  const { colors } = useTheme();
  const model = useQuickActions();
  const { search } = useLocalSearchParams<{ search?: string }>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<QuickActionCategory | "ALL">("ALL");
  const present = useMemo(() => QUICK_ACTION_CATEGORIES.map((entry) => ({ ...entry,
    actions: model.actions.filter((action) => action.category === entry.id),
  })).filter((entry) => entry.actions.length > 0), [model.actions]);
  const recentSearches = model.searchPicks
    .map((id) => model.actions.find((action) => action.id === id))
    .filter((action): action is NonNullable<typeof action> => Boolean(action));
  const shown = category === "ALL" ? present : present.filter((entry) => entry.id === category);
  const visibleCategories = useStagedCategories(shown.length, !model.loading && !model.error && !query.trim());

  const listing = !model.loading && !model.error && Boolean(model.property) && model.actions.length > 0 && !query.trim();
  const showFilters = listing && !(visibleCategories === 0 && shown.length > 0);

  // The search and filters stay docked at the top and the list slides under them
  // (user, 2026-11-01). Index 1 is the docked block, after the header. The solid
  // background reaches past the screen's gutters so nothing shows either side.
  return <ScreenScrollView stickyHeaderIndices={[1]} surface={colors.background} safeAreaEdges={["top", "bottom"]} refreshable={false}>
    <ScreenHeader title="Quick" italicTail="actions." subtitle={model.property ? `Get things done at ${model.property.name}.` : "Choose a property on Home to see its actions."} />
    <View style={{ backgroundColor: colors.background, marginHorizontal: -spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
      {/* The gap needs its own View: on a phone a sticky child's style moves to an
          outer wrapper, where a gap has nothing to space. */}
      <View style={{ gap: spacing.lg }}>
        <SearchField animatePlaceholder={false} autoFocus={search === "1"} clearButtonVariant="circle" value={query} onChangeText={setQuery} placeholder="Search quick actions" />
        {/* Narrow to one category rather than scroll past twelve (user, 2026-10-29). */}
        {showFilters ? <FilterPillRow<QuickActionCategory | "ALL">
          onChange={setCategory}
          options={[{ label: "All", value: "ALL" }, ...present.map((entry) => ({ label: entry.label, value: entry.id }))]}
          value={category}
        /> : null}
      </View>
    </View>
    {model.loading ? <QuickActionsScreenSkeleton /> : model.error ? <LoadFailed onReload={model.retry} />
      : !model.property || !model.actions.length ? <EmptyState icon={LockKeyhole} title={model.property ? "No actions available" : "Select an active property"} />
      : query.trim() ? <>
        <QuickActionSearchResults actions={model.actions} query={query} onSelect={(action) => model.launchFromSearch(action)} />
        <RecentSearches actions={model.actions} ids={model.searchPicks} onSelect={(action) => model.launchFromSearch(action)} />
      </>
      : visibleCategories === 0 && shown.length > 0 ? <QuickActionsScreenSkeleton /> : <>
        {category === "ALL" && recentSearches.length ? <Section title="Recent searches">
          <QuickActionGrid actions={recentSearches} onSelect={(action) => model.launchFromSearch(action)} />
        </Section> : null}
        {shown.slice(0, visibleCategories).map((entry) => <Section key={entry.id} title={entry.label}>
          <QuickActionGrid actions={entry.actions} onSelect={(action) => model.launch(action)} />
        </Section>)}
        {visibleCategories < shown.length ? <QuickActionCategorySkeleton /> : null}
      </>}
  </ScreenScrollView>;
}
