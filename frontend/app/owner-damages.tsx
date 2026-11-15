import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyDamage } from "@/components/empty-art";
import { ActivityIndicator, Text, View } from "react-native";
import { ChevronDown, Plus } from "lucide-react-native";
import { LoadFailed } from "@/components/load-failed";
import { DamagesIcon } from "@/features/property/property-control-icons";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { InPageDropdown, useInPageDropdown } from "@/components/anchored-dropdown";
import { PILL_CHOICE_MAX_WIDTH, pillChoice } from "@/components/filtered-queue";
import { SearchField } from "@/components/search-field";
import { DAMAGE_LEVEL_OPTIONS, type DamageLevelFilter } from "@/features/damage/tenant-damage-records";
import { useDebouncedValue } from "@/features/discovery/use-debounced-value";
import { ListEnd } from "@/components/list-end";
import { NotchedInput } from "@/components/notched-input";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SelectionTabs } from "@/components/selection-tabs";
import { SheetShell } from "@/components/sheet-shell";
import { StatusPill } from "@/components/status-pill";
import { OwnerDamagesScreenSkeleton } from "@/components/skeletons/owner";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { useQuickActionIntent } from "@/features/quick-actions/quick-action-intent";
import { DamageRecordCard, DamageRepairHistoryCard } from "@/features/damage/damage-record-card";
import { DamageRecordDetailSheet } from "@/features/damage/damage-record-detail-sheet";
import { RecordDamageSheet } from "@/features/damage/record-damage-sheet";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { DamageLevelDropdown } from "@/features/tenancy/damage-level";
import { MultiImageField } from "@/features/uploads/multi-image-field";
import { useAppSelector } from "@/store/hooks";
import {
  useGetDamageRecordPagesInfiniteQuery,
  useRepairDamageRecordMutation,
  useReplaceDamageRecordMutation,
  type DamageRecord,
} from "@/store/services/damage-api";
import { useGetPropertyExitPoliciesQuery, type DamageLevel } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Tab = "open" | "history";
const ORDER: DamageLevel[] = ["NA", "D1", "D2", "D3"];

/**
 * Damages and their repairs, one screen (user, 2026-10-29, merging the Item
 * catalogue's records with the Repairs screen). Open: every damage not yet
 * fixed, recorded here, charged, edited or deleted from its card, and marked
 * repaired (a lower level) or replaced (NA) with photos of the fix. History:
 * what was repaired or replaced. A fix's photos replace the item's, so the next
 * onboarding never shows the damage. The charge is untouched by a fix.
 */
export default function OwnerDamagesScreen() {
  const { colors, fonts } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties, loading: accountsLoading } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";
  const { canManage } = usePropertyPermissions(propertyId);
  const manage = Boolean(property) && canManage("TENANCY_RULES");
  const [tab, setTab] = useState<Tab>("open");
  const [recording, setRecording] = useState(false);
  const [viewing, setViewing] = useState<DamageRecord | null>(null);
  const [editing, setEditing] = useState<DamageRecord | null>(null);
  const [fixing, setFixing] = useState<{ record: DamageRecord; outcome: "repair" | "replace" } | null>(null);
  // Record damage from Quick actions opens the sheet; Mark repaired lands on the open list (user, 2026-10-29).
  useQuickActionIntent({ "record-damage": () => setRecording(true), "repair-item": () => setTab("open") }, manage);

  // Separate infinite caches retain each tab's pages. Tag invalidation refetches all
  // cached pages after a repair, edit, deletion or charge, not just the final page.
  // The tenant screen's sticky search by damage ID or item, with a level dropdown (user, 2026-11-14),
  // searched on the server so a match on a later page is found too.
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<DamageLevelFilter>("ALL");
  const searched = useDebouncedValue(search.trim(), 300);
  const levelArg = level === "ALL" ? null : level;
  // Drawn in the screen, not a modal window: the modal's list landed over the pill on a phone.
  const levelMenu = useInPageDropdown();
  const chosenLevel = DAMAGE_LEVEL_OPTIONS.find((option) => option.value === level) ?? DAMAGE_LEVEL_OPTIONS[0];
  const filtering = Boolean(searched) || level !== "ALL";
  const openQuery = useGetDamageRecordPagesInfiniteQuery({ history: false, level: levelArg, propertyId, search: searched }, { skip: !propertyId || tab !== "open" });
  const historyQuery = useGetDamageRecordPagesInfiniteQuery({ history: true, level: levelArg, propertyId, search: searched }, { skip: !propertyId || tab !== "history" });
  const open = useMemo(() => [...new Map(openQuery.currentData?.pages.flatMap((page) => page.records.items).map((record) => [record.id, record]) ?? []).values()], [openQuery.currentData]);
  const history = useMemo(() => [...new Map(historyQuery.currentData?.pages.flatMap((page) => page.records.items).map((record) => [record.id, record]) ?? []).values()], [historyQuery.currentData]);
  const list = tab === "open" ? open : history;
  const query = tab === "open" ? openQuery : historyQuery;
  const pages = query.currentData?.pages;
  const counts = pages?.[pages.length - 1];
  const openCount = counts?.openCount ?? 0;
  const historyCount = counts?.historyCount ?? 0;
  const notCharged = counts?.notChargedCount ?? 0;
  const loading = accountsLoading || Boolean(propertyId && !pages && !query.isError);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const scrollOffset = useRef(0);
  // Where the search row rests, and whether the list has scrolled it into its pinned place.
  const searchRestY = useRef(0);
  const [searchPinned, setSearchPinned] = useState(false);
  const loadMore = useCallback(() => {
    if (!query.hasNextPage || query.isFetching || query.isError || !pages) return;
    if (viewportHeight.current > 0 && contentHeight.current - scrollOffset.current - viewportHeight.current <= 240) void query.fetchNextPage();
  }, [query.hasNextPage, query.isFetching, query.isError, query.fetchNextPage, pages]);
  // Also fill a tall viewport when its first page is too short to scroll.
  useEffect(() => { loadMore(); }, [loadMore]);

  return (
    <View collapsable={false} ref={levelMenu.host} style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView safeAreaEdges={["top"]} stickyHeaderIndices={loading ? [] : [2]}
        onLayout={(event) => { viewportHeight.current = event.nativeEvent.layout.height; loadMore(); }}
        onContentSizeChange={(_, height) => { contentHeight.current = height; loadMore(); }}
        onScroll={({ nativeEvent }) => {
          scrollOffset.current = nativeEvent.contentOffset.y;
          const pinned = searchRestY.current > 0 && nativeEvent.contentOffset.y >= searchRestY.current;
          if (pinned !== searchPinned) {
            setSearchPinned(pinned);
            if (pinned) levelMenu.close();
          }
          loadMore();
        }}
        scrollEventThrottle={16}
      >
        {loading ? <OwnerDamagesScreenSkeleton history={tab === "history"} /> : <>
        <ScreenHeader
          italicTail=" and repairs."
          subtitle={property ? `Damage to the rooms at ${property.name}, and what was fixed.` : "Select a property from Home first."}
          title="Damages"
        />
        <SelectionTabs<Tab>
          active={tab}
          bleed={spacing.lg}
          compact
          distributed
          gap={0}
          horizontalPadding={spacing.sm}
          onChange={setTab}
          options={[
            { badge: openCount, label: "Damage list", value: "open" },
            { badge: historyCount, label: "Repair history", value: "history" },
          ]}
        />

        {/* Sticks under the header. On a phone a sticky child's style moves to a wrapper: the row needs its own View. */}
        {/* Pinned, the search gets more room under it (user, 2026-11-14): a strip of the
            page's colour hangs below it while the list scrolls beneath, and goes at the top,
            so nothing in the layout moves. */}
        <View
          onLayout={(event) => { searchRestY.current = event.nativeEvent.layout.y; }}
          style={{ backgroundColor: colors.background, marginHorizontal: -spacing.lg, paddingBottom: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}
        >
          {searchPinned ? (
            <View pointerEvents="none" style={{ backgroundColor: colors.background, bottom: -spacing.sm, height: spacing.sm, left: 0, position: "absolute", right: 0 }} />
          ) : null}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SearchField onChangeText={setSearch} placeholder="Search by damage ID or item" value={search} />
            </View>
            <View collapsable={false} ref={levelMenu.ref}>
              <AnimatedPressable
                accessibilityLabel={`Damage level: ${chosenLevel.label}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: Boolean(levelMenu.trigger) }}
                // Pinned after a scroll it is a plain pill: no chevron, nothing to open (user, 2026-11-14).
                disabled={searchPinned}
                onPress={searchPinned ? undefined : levelMenu.open}
                style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: `${colors.ink}40`, borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 4, height: 36, paddingLeft: spacing.md, paddingRight: spacing.sm }}
              >
                <Text ellipsizeMode="tail" numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 12.5, maxWidth: PILL_CHOICE_MAX_WIDTH }}>
                  {pillChoice(chosenLevel.short)}
                </Text>
                {searchPinned ? null : <ChevronDown color={colors.ink} size={15} strokeWidth={2.4} />}
              </AnimatedPressable>
            </View>
          </View>
        </View>

        {/* With records, Record sits above them. Without, it sits under the empty state (user, 2026-10-29). */}
        {tab === "open" && openCount > 0 ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ alignItems: "center", flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              <StatusPill label={`${openCount} open`} textStyle={{ fontSize: 12, letterSpacing: 0, textTransform: "none" }} tone="neutral" />
              {notCharged > 0 ? <StatusPill label={`${notCharged} not charged`} textStyle={{ fontSize: 12, letterSpacing: 0, textTransform: "none" }} tone="warning" /> : null}
            </View>
            {manage ? <RecordButton onPress={() => setRecording(true)} /> : null}
          </View>
        ) : null}

        {query.isError && !pages ? (
          <LoadFailed error={query.error} onReload={() => void query.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            action={tab === "open" && manage ? (
              <View style={{ flexDirection: "row" }}>
                <RecordButton onPress={() => setRecording(true)} />
              </View>
            ) : undefined}
            artworkNode={<EmptyDamage size={120} />}
            description={filtering ? "Try another search or damage level." : undefined}
            title={filtering ? "No matching records" : tab === "open" ? "No open damages" : "No repairs yet"}
          />
        ) : tab === "open" ? (
          <View style={{ gap: spacing.md }}>
            {open.map((record) => (
              <DamageRecordCard key={record.id} onPress={() => setViewing(record)} record={record}>
                {manage ? (
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    {/* Every level has both: a D1 repaired goes back to NA (user, 2026-10-31). */}
                    <ActionButton label="Mark repaired" onPress={() => setFixing({ outcome: "repair", record })} variant="secondary" />
                    <ActionButton label="Mark replaced" onPress={() => setFixing({ outcome: "replace", record })} variant="secondary" />
                  </View>
                ) : null}
              </DamageRecordCard>
            ))}
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {history.map((record) => (
              <DamageRepairHistoryCard key={record.id} record={record} />
            ))}
          </View>
        )}
        {query.isError ? <View style={{ flexDirection: "row" }}>
          <ActionButton label="Try again" onPress={() => void query.refetch()} variant="secondary" />
        </View> : list.length > 0 ? (
          query.hasNextPage || query.isFetchingNextPage
            ? <ActivityIndicator accessibilityLabel="Loading more damage records" color={colors.muted} style={{ padding: spacing.sm }} />
            : <ListEnd />
        ) : null}
        </>}
      </ScreenScrollView>

      {levelMenu.trigger && !searchPinned ? (
        <InPageDropdown onClose={levelMenu.close} trigger={levelMenu.trigger} width={180}>
          {DAMAGE_LEVEL_OPTIONS.map((option) => (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === level }}
              key={option.value}
              onPress={() => {
                setLevel(option.value);
                levelMenu.close();
              }}
              style={{ backgroundColor: option.value === level ? colors.surfaceSunken : colors.surface, padding: spacing.md }}
            >
              <Text style={{ color: colors.ink, fontFamily: option.value === level ? fonts.sansBold : fonts.sansMedium, fontSize: 14 }}>
                {option.label}
              </Text>
            </AnimatedPressable>
          ))}
        </InPageDropdown>
      ) : null}

      {recording ? <RecordDamageSheet onClose={() => setRecording(false)} propertyId={propertyId} /> : null}
      {editing ? <RecordDamageSheet onClose={() => setEditing(null)} propertyId={propertyId} record={editing} /> : null}
      {viewing ? (
        <DamageRecordDetailSheet
          canManage={manage}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          propertyId={propertyId}
          record={viewing}
        />
      ) : null}
      {fixing ? (
        <FixSheet onClose={() => setFixing(null)} outcome={fixing.outcome} propertyId={propertyId} record={fixing.record} />
      ) : null}
    </View>
  );
}

function RecordButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Record a damage"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={{ alignItems: "center", borderColor: colors.primary, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 }}
    >
      <Plus color={colors.primary} size={14} strokeWidth={2.4} />
      <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>Record</Text>
    </AnimatedPressable>
  );
}

/** Mark repaired (a level below the damage) or replaced (NA), with photos of it and a note. */
function FixSheet({
  onClose,
  outcome,
  propertyId,
  record,
}: {
  onClose: () => void;
  outcome: "repair" | "replace";
  propertyId: string;
  record: DamageRecord;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const policiesQuery = useGetPropertyExitPoliciesQuery(propertyId);
  const [repair, repairState] = useRepairDamageRecordMutation();
  const [replace, replaceState] = useReplaceDamageRecordMutation();
  // A fix is recorded with its photos, no level asked (user, 2026-11-07: levels are only price tiers).
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = repairState.isLoading || replaceState.isLoading;
  const label = outcome === "repair" ? "Mark repaired" : "Mark replaced";

  async function submit() {
    setTried(true);
    if (photos.length === 0) return;
    const payload = { level: null, note: note.trim() || null, photoUrls: photos };
    try {
      if (outcome === "repair") {
        await repair({ payload, propertyId, recordId: record.id, version: record.version }).unwrap();
      } else {
        await replace({ payload, propertyId, recordId: record.id, version: record.version }).unwrap();
      }
      toast.success(`${record.itemName} ${outcome === "repair" ? "marked repaired" : "marked replaced"}.`);
      onClose();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  return (
    <SheetShell
      contentMaxSize="tall"
      footer={(
        <View style={{ flexDirection: "row" }}>
          <ActionButton disabled={busy} label={busy ? "Saving…" : label} onPress={() => void submit()} />
        </View>
      )}
      footerSpacing={spacing.xs}
      onClose={onClose}
      size="content"
      title={`${label}: ${record.itemName}`}
    >
      <View style={{ gap: spacing.md }}>
        <Text style={[type.description, { color: colors.muted }]}>
          {outcome === "repair" ? "Records the fix and moves this damage to History." : "Records the new one and moves this damage to History."}
        </Text>
        <View style={{ gap: spacing.xs }}>
          <MultiImageField
            label={`Photos of the ${outcome === "repair" ? "fix" : "new one"} (${photos.length}/3) *`}
            max={3}
            onChange={setPhotos}
            target="MOVE_IN_PHOTO"
            urls={photos}
          />
          {tried && photos.length === 0 ? <Text style={[type.caption, { color: colors.danger }]}>Add at least one photo</Text> : null}
        </View>
        <NotchedInput label="Note" maxLength={300} onChangeText={setNote} placeholder={outcome === "repair" ? "Grille straightened" : "New unit fitted"} value={note} />
        {record.splitNumber ? (
          <Text style={[type.description, { color: colors.muted }]}>There is one {record.itemName}, so this moves every split of {record.code} to History.</Text>
        ) : null}
      </View>
      {serverError ? <AlertModal message={serverError} onClose={() => setServerError(null)} /> : null}
    </SheetShell>
  );
}
