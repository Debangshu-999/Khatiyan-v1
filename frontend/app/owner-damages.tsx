import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { LoadFailed } from "@/components/load-failed";
import { DamagesIcon } from "@/features/property/property-control-icons";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
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
  const { colors } = useTheme();
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
  const openQuery = useGetDamageRecordPagesInfiniteQuery({ history: false, propertyId }, { skip: !propertyId || tab !== "open" });
  const historyQuery = useGetDamageRecordPagesInfiniteQuery({ history: true, propertyId }, { skip: !propertyId || tab !== "history" });
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
  const loadMore = useCallback(() => {
    if (!query.hasNextPage || query.isFetching || query.isError || !pages) return;
    if (viewportHeight.current > 0 && contentHeight.current - scrollOffset.current - viewportHeight.current <= 240) void query.fetchNextPage();
  }, [query.hasNextPage, query.isFetching, query.isError, query.fetchNextPage, pages]);
  // Also fill a tall viewport when its first page is too short to scroll.
  useEffect(() => { loadMore(); }, [loadMore]);

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView safeAreaEdges={["top"]}
        onLayout={(event) => { viewportHeight.current = event.nativeEvent.layout.height; loadMore(); }}
        onContentSizeChange={(_, height) => { contentHeight.current = height; loadMore(); }}
        onScroll={({ nativeEvent }) => { scrollOffset.current = nativeEvent.contentOffset.y; loadMore(); }}
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
            artworkNode={<DamagesIcon size={72} />}
            title={tab === "open" ? "No open damages" : "No repairs yet"}
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
  const below = ORDER.slice(0, ORDER.indexOf(record.damageLevel));
  const [level, setLevel] = useState<DamageLevel>(below[below.length - 1] ?? "NA");
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const levelWords = policiesQuery.data?.damageLevels ?? [];
  const busy = repairState.isLoading || replaceState.isLoading;
  const label = outcome === "repair" ? "Mark repaired" : "Mark replaced";

  async function submit() {
    setTried(true);
    if (photos.length === 0) return;
    const payload = { level: outcome === "repair" ? level : "NA" as DamageLevel, note: note.trim() || null, photoUrls: photos };
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
        {outcome === "repair" ? (
          <DamageLevelDropdown label="Level now" levels={levelWords} onChange={setLevel} options={below} value={level} />
        ) : (
          <Text style={[type.description, { color: colors.muted }]}>A replacement is new, so its level goes to NA.</Text>
        )}
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
        <NoticeBar message="They replace the item's photos for the next onboarding." selectable={false} title="These photos carry over" tone="info" />
        {record.splitNumber ? (
          <Text style={[type.description, { color: colors.muted }]}>There is one {record.itemName}, so this moves every split of {record.code} to History.</Text>
        ) : null}
      </View>
      {serverError ? <AlertModal message={serverError} onClose={() => setServerError(null)} /> : null}
    </SheetShell>
  );
}
