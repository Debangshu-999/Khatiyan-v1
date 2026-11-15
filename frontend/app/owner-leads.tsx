import { useEffect, useRef, useState } from "react";
import { EmptyLeads } from "@/components/empty-art";
import { ActivityIndicator, Text, View } from "react-native";
import { ChevronRight, Hourglass } from "lucide-react-native";

import { LoadFailed } from "@/components/load-failed";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { HighlightPanel, highlightPalette } from "@/components/highlight-card";
import { ListEnd } from "@/components/list-end";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField, SearchFilterButton } from "@/components/search-field";
import { SectionHeading } from "@/components/section-heading";
import { SkeletonList } from "@/components/skeletons/primitives";
import { useDebouncedValue } from "@/features/discovery/use-debounced-value";
import { LeadCard } from "@/features/lead/lead-card";
import { PIPELINE_TABS, countOf } from "@/features/lead/lead-display";
import {
  LeadFilterSheet,
  NO_LEAD_FILTERS,
  activeFilterCount,
  showsEnded,
  type LeadFilters,
} from "@/features/lead/lead-filter-sheet";
import { useLeadsProperty } from "@/features/lead/use-leads-property";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { PropertyLeadsIcon } from "@/features/property/property-control-icons";
import { useAccumulatedPages } from "@/hooks/use-accumulated-pages";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppDispatch } from "@/store/hooks";
import {
  leadApi,
  useGetPropertyLeadCountsQuery,
  useGetPropertyLeadsQuery,
  type LeadCounts,
  type LeadKind,
  type LeadRepeatFlag,
} from "@/store/services/lead-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { EnquiryCardSheet } from "./owner-enquiries";
import { FitText } from "@/components/fit-text";

type LoadMore = { current: (() => void) | null };

/**
 * The Leads workspace (user's design, 2026-10-17), reached from the Property
 * Leads card on Home.
 *
 * <p>The pipeline's four stages as tabs with their counts, a search by name or
 * reference, a filter, and one card per lead. A banner says how many leads are
 * going cold and opens just those. Ended leads are reached from the filter.
 * Nothing is edited here: View details reads a lead, and Follow up answers its
 * enquiry with the same sheets the Enquiries screen uses.
 */
export default function OwnerLeadsScreen() {
  const scope = useLeadsProperty();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const loadMore = useRef<(() => void) | null>(null) as LoadMore;
  const property = scope.property;

  return <ScreenScrollView
    surface={colors.background}
    safeAreaEdges={["top", "bottom"]}
    refreshable={Boolean(property)}
    onRefresh={() => { dispatch(leadApi.util.invalidateTags(["Lead"])); }}
    onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
      // Endless list: within 240 of the end, ask for the next page. The list answers only when there is one.
      if (contentSize.height - contentOffset.y - layoutMeasurement.height <= 240) loadMore.current?.();
    }}
    scrollEventThrottle={16}
  >
    <ScreenHeader title="Leads" italicTail="workspace." subtitle={property ? `Visits, bookings and move-ins for ${property.name}.` : "Visits, bookings and move-ins."} />
    {property ? <LeadsWorkspace key={property.id} propertyId={property.id} loadMoreRef={loadMore} />
      : scope.loading ? <SkeletonList rows={3} body={2} action />
      : scope.error ? <LoadFailed error={scope.error} onReload={scope.retry} />
      : <EmptyState artworkNode={<EmptyLeads size={120} />} title="Select an active property" description="Choose the property on Home, then open Property Leads." />}
  </ScreenScrollView>;
}

function LeadsWorkspace({ propertyId, loadMoreRef }: { propertyId: string; loadMoreRef: LoadMore }) {
  const { colors, fonts } = useTheme();
  const router = useGuardedRouter();
  const [tab, setTab] = useState<LeadKind>("EARLY_LEAD");
  const [filters, setFilters] = useState<LeadFilters>(NO_LEAD_FILTERS);
  const [filtering, setFiltering] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [page, setPage] = useState(0);
  const [followingUp, setFollowingUp] = useState<string | null>(null);
  const [pendingChat, setPendingChat] = useState<{ threadId: string; title: string } | null>(null);
  const search = useDebouncedValue(searchDraft.trim(), 350);

  // A chat opens once the sheet over this screen has gone: pushed from inside a modal it lands behind it.
  useEffect(() => {
    if (!pendingChat || followingUp) return;
    setPendingChat(null);
    router.push({ params: { threadId: pendingChat.threadId, title: pendingChat.title }, pathname: "/chat/[threadId]" });
  }, [followingUp, pendingChat, router]);

  const counts = useGetPropertyLeadCountsQuery(propertyId, { refetchOnFocus: true, refetchOnMountOrArgChange: true });
  const ended = showsEnded(filters);
  // A filter looks across every stage, and no tab is filled while one is on (user, 2026-10-17): a filled
  // tab over a filtered list read as that tab's own leads. The ended filters ask for the ended kinds instead.
  const filtered = activeFilterCount(filters) > 0;
  const kinds: LeadKind[] = ended
    ? [...(filters.dead ? ["DEAD" as const] : []), ...(filters.lost ? ["LOST_ENQUIRY" as const] : [])]
    : filtered
      ? PIPELINE_TABS.map((option) => option.kind)
      : [tab];
  const repeat: LeadRepeatFlag[] = [
    ...(filters.duplicates ? ["DUPLICATE" as const] : []),
    ...(filters.potentialSpam ? ["POTENTIAL_SPAM" as const] : []),
  ];
  const list = useGetPropertyLeadsQuery(
    { propertyId, kinds, goingCold: filters.goingCold, mine: filters.mine, resumed: filters.resumed, repeat, search, page },
    { refetchOnFocus: true, refetchOnMountOrArgChange: true },
  );
  const pages = useAccumulatedPages(`${propertyId}:${kinds.join(",")}:${JSON.stringify(filters)}:${search}`, list.currentData);
  const data = pages ?? (list.isFetching ? list.data : undefined);
  const loadingAgain = list.isFetching && !pages;
  const more = Boolean(pages?.hasNext) && !list.isFetching && !list.isError;
  loadMoreRef.current = more ? () => setPage(pages!.page + 1) : null;
  const narrowed = search.length > 0 || activeFilterCount(filters) > 0;
  const cold = counts.currentData?.goingCold ?? 0;

  function chooseTab(kind: LeadKind) {
    setTab(kind);
    // A tab is one stage again: the filters give way to it.
    setFilters(NO_LEAD_FILTERS);
    setPage(0);
  }

  return <View style={{ gap: spacing.md }}>
    {cold > 0 && !filters.goingCold ? <ColdBanner count={cold} onPress={() => { setFilters((current) => ({ ...current, goingCold: true })); setPage(0); }} /> : null}

    <HighlightPanel variant="leads">
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: highlightPalette.leads.ink, fontFamily: fonts.display, fontSize: 20 }}>Pipeline</Text>
          <Text style={{ color: highlightPalette.leads.muted, fontFamily: fonts.sansMedium, fontSize: 12 }}>From first interest to move-in</Text>
        </View>
        <PropertyLeadsIcon size={38} />
      </View>
      <PipelineTabs active={filtered ? null : tab} counts={counts.currentData} onChange={chooseTab} />
    </HighlightPanel>

    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <SearchField autoCapitalize="none" placeholder="Search name or reference" value={searchDraft} onChangeText={(value) => { setSearchDraft(value); setPage(0); }} />
      </View>
      {/* The app's round filter button by a search bar (user, 2026-11-15), not a square box. */}
      <SearchFilterButton accessibilityLabel="Filter" active={activeFilterCount(filters) > 0} count={activeFilterCount(filters)} onPress={() => setFiltering(true)} />
    </View>

    {!data && !list.isError ? <SkeletonList rows={3} body={2} action /> : null}
    {list.isError && !data ? <LoadFailed error={list.error} onReload={() => void list.refetch()} /> : null}
    {data && data.totalElements === 0 ? <EmptyState
      artworkNode={<EmptyLeads size={120} />}
      title={narrowed ? "No matching leads" : EMPTY_TITLE[tab]}
      description={narrowed ? "Try another search or filter." : EMPTY_DESCRIPTION[tab]}
    /> : null}
    {data && data.items.length > 0 ? <View style={{ gap: spacing.md, opacity: loadingAgain ? 0.6 : 1 }}>
      {data.items.map((lead) => <LeadCard
        key={lead.id}
        lead={lead}
        // A filter mixes the stages, so each card says its own. On a tab, the tab says it.
        showKind={filtered}
        onFollowUp={() => setFollowingUp(lead.followUpEnquiryId)}
        onOpen={() => router.push({ pathname: "/owner-lead-detail", params: { leadId: lead.id } })}
      />)}
      {pages ? (pages.hasNext || (list.isFetching && page > pages.page) ? <ActivityIndicator color={colors.muted} style={{ padding: spacing.sm }} /> : <ListEnd />) : null}
    </View> : null}

    {filtering ? <LeadFilterSheet
      counts={counts.currentData}
      filters={filters}
      onApply={(next) => { setFilters(next); setPage(0); setFiltering(false); }}
      onClose={() => setFiltering(false)}
    /> : null}
    {followingUp ? <EnquiryCardSheet
      enquiryId={followingUp}
      onClose={() => setFollowingUp(null)}
      onOpenChat={(chat) => { setFollowingUp(null); setPendingChat(chat); }}
      propertyId={propertyId}
      respondFirst
    /> : null}
  </View>;
}

const EMPTY_TITLE: Record<LeadKind, string> = {
  ENQUIRY: "No enquiries",
  EARLY_LEAD: "No early leads",
  ADVANCED_LEAD: "No strong leads",
  BOOKED: "No booked leads",
  CONVERTED: "Nobody has moved in yet",
  DEAD: "No dead leads",
  LOST_ENQUIRY: "No lost enquiries",
};

// The dormant screen says how a lead arrives, in one line (user, 2026-09-30).
const EMPTY_DESCRIPTION: Record<LeadKind, string> = {
  ENQUIRY: "Enquiries live on the Enquiries screen.",
  EARLY_LEAD: "An enquiry becomes an early lead once a visit is scheduled.",
  ADVANCED_LEAD: "An early lead becomes a strong lead once they visit.",
  BOOKED: "A strong lead is booked once their booking is confirmed.",
  CONVERTED: "A booked lead moves here once their stay starts.",
  DEAD: "Leads that ended without a move-in appear here.",
  LOST_ENQUIRY: "Enquiries that ended before any visit appear here.",
};

/** How many leads are going cold. Opens just those. */
function ColdBanner({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();
  return <AnimatedPressable accessibilityRole="button" onPress={onPress}>
    <View style={{ alignItems: "center", backgroundColor: colors.warningSoft, borderColor: colors.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 }}>
      <Hourglass color={colors.warningText} size={22} strokeWidth={2} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{count === 1 ? "1 lead going cold" : `${count} leads going cold`}</Text>
        <Text style={[type.description, { color: colors.muted }]}>Something runs out soon on them</Text>
      </View>
      <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} />
    </View>
  </AnimatedPressable>;
}

/**
 * The four stages with their counts, in one bordered row (user's design).
 * None is selected while the ended leads are shown.
 */
function PipelineTabs({ active, counts, onChange }: { active: LeadKind | null; counts: LeadCounts | undefined; onChange: (kind: LeadKind) => void }) {
  const { colors, fonts } = useTheme();
  // White with a firm edge, so the row stands off the card's own tint (user, 2026-11-15): the light
  // border on a see-through row blended into the background.
  return <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, flexDirection: "row", overflow: "hidden" }}>
    {PIPELINE_TABS.map((option, index) => {
      const on = option.kind === active;
      const count = countOf(counts, option.kind);
      return <AnimatedPressable
        key={option.kind}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(option.kind)}
        style={{ alignItems: "center", backgroundColor: on ? colors.primary : "transparent", borderLeftColor: colors.border, borderLeftWidth: index === 0 || on ? 0 : 1, flex: 1, gap: 2, paddingVertical: spacing.sm }}
      >
        {/* Solid blue when chosen: the pale tint was barely visible on the card's own (user, 2026-11-07). */}
        <FitText numberOfLines={1} style={{ color: on ? colors.onPrimary : colors.muted, fontFamily: fonts.sansSemiBold, fontSize: 13 }}>{option.label}</FitText>
        <Text style={{ color: on ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 17 }}>{count ?? "–"}</Text>
      </AnimatedPressable>;
    })}
  </View>;
}

