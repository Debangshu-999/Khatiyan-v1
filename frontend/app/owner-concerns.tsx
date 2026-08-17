import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, ScrollView, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { AlertCircle, Activity, Clock3, Eye, Image as ImageIcon, X, Lock } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { TabSwitcher } from "@/components/tab-switcher";
import { SkeletonCard } from "@/components/skeleton";
import { ActionButton, BackButton, IconButton, humanizeToken, ViewOnlyChip } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  type ConcernSummary,
  useListPropertyAvailableConcernsQuery,
  useListPropertyConcernHistoryQuery,
  useListPropertyEscalatedConcernsQuery,
  useListUndertakenConcernsQuery,
} from "@/store/services/concern-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { useToast } from "@/components/toast";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PropertyTab = "available" | "escalated";
type MyTab = "review" | "progress" | "reopened" | "history";
type QueueTab = "property" | "mine";

const CONCERNS_PER_PAGE = 8;

/** Clamps the page so shrinking a list cannot strand the reader past its end. */
function pageOf(items: ConcernSummary[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / CONCERNS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  return {
    items: items.slice(safePage * CONCERNS_PER_PAGE, (safePage + 1) * CONCERNS_PER_PAGE),
    page: safePage,
    totalPages,
  };
}

function myTabHeadingText(tab: MyTab) {
  if (tab === "review") return "Concerns under review";
  if (tab === "progress") return "Concerns in progress";
  if (tab === "reopened") return "Reopened concerns";
  return "Resolved by me";
}

export default function OwnerConcernsScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const [propertyTab, setPropertyTab] = useState<PropertyTab>("available");
  const [myTab, setMyTab] = useState<MyTab>("review");
  const [queueTab, setQueueTab] = useState<QueueTab>("property");
  const [propertyHistoryOpen, setPropertyHistoryOpen] = useState(false);

  const availableQuery = useListPropertyAvailableConcernsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const escalatedQuery = useListPropertyEscalatedConcernsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  // Used only for the "resolved by me" sub-tab and the weekly metric, so fetch a
  // large page to keep those derivations complete.
  const historyQuery = useListPropertyConcernHistoryQuery(
    { page: 0, propertyId: selectedProperty?.id ?? "", size: 200 },
    { skip: !selectedProperty },
  );
  // "My concerns" is a working queue — you only get items in it by taking a
  // concern up, which is a MANAGE action. For a view-only manager it can never
  // be anything but empty, so the call is skipped rather than fetched to render
  // an emptiness that looks like a bug.
  const { canManage } = usePropertyPermissions(selectedProperty?.id);
  const canWorkConcerns = canManage("CONCERNS");
  const undertakenQuery = useListUndertakenConcernsQuery(undefined, {
    skip: !selectedProperty || !canWorkConcerns,
  });

  const propertyAvailableRaw = useMemo(
    () => (availableQuery.data ?? []).filter((concern) => !concern.reopened && concern.escalationLevel === "NONE"),
    [availableQuery.data],
  );
  const propertyEscalatedRaw = useMemo(() => {
    return (escalatedQuery.data ?? []).filter((concern) => !concern.assignedToUserId && !concern.reopened);
  }, [escalatedQuery.data]);

  const propertyAvailable = useMemo(() => sortLatest(propertyAvailableRaw), [propertyAvailableRaw]);
  const propertyEscalated = useMemo(() => sortByEscalation(propertyEscalatedRaw), [propertyEscalatedRaw]);

  const myConcerns = useMemo(() => {
    return (undertakenQuery.data ?? []).filter((concern) => concern.propertyId === selectedProperty?.id);
  }, [selectedProperty?.id, undertakenQuery.data]);

  const myReopened = useMemo(() => myConcerns.filter((concern) => concern.reopened), [myConcerns]);
  const myInReview = useMemo(() => myConcerns.filter((concern) => concern.status === "UNDER_REVIEW" && !concern.reopened), [myConcerns]);
  const myInProgress = useMemo(() => myConcerns.filter((concern) => concern.status === "IN_PROGRESS" && !concern.reopened), [myConcerns]);
  const myHistoryRaw = useMemo(() => {
    return (historyQuery.data?.items ?? []).filter((concern) => currentUserId && concern.resolvedByUserId === currentUserId);
  }, [currentUserId, historyQuery.data]);

  const propertyConcerns = propertyTab === "available" ? propertyAvailable : propertyEscalated;
  const propertyLoading = propertyTab === "available" ? availableQuery.isFetching : escalatedQuery.isFetching;
  const myRawConcerns = myTab === "review" ? myInReview : myTab === "progress" ? myInProgress : myTab === "reopened" ? myReopened : myHistoryRaw;
  const myVisibleConcerns = sortLatest(myRawConcerns);
  const myLoading = myTab === "history" ? historyQuery.isFetching : undertakenQuery.isFetching;

  // Both queue endpoints return the whole list, so the paging is client-side.
  // A busy property accumulates open concerns faster than anyone works through
  // them, and an unbounded stack is what made this screen scroll forever.
  const [propertyPage, setPropertyPage] = useState(0);
  const [myPage, setMyPage] = useState(0);

  // Switching tab has to reset the page, or moving from a long queue to a short
  // one lands on a page that no longer exists and looks empty.
  useEffect(() => setPropertyPage(0), [propertyTab]);
  useEffect(() => setMyPage(0), [myTab]);

  const propertyPaged = pageOf(propertyConcerns, propertyPage);
  const myPaged = pageOf(myVisibleConcerns, myPage);
  const resolvedThisWeek = useMemo(() => {
    const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (historyQuery.data?.items ?? []).filter((concern) => concern.status === "RESOLVED" && new Date(concern.resolvedAt ?? concern.updatedAt).getTime() >= weekStart).length;
  }, [historyQuery.data]);

  function openConcern(concern: ConcernSummary, mode: "property" | "taken" | "history") {
    router.push({
      pathname: "/owner-concern-detail",
      params: { concernId: concern.id, mode, propertyId: concern.propertyId },
    });
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        badge={!canWorkConcerns ? <ViewOnlyChip /> : null} onBack={() => router.back()}
        eyebrow="Owner concern"
        title="Concern"
        italicTail="queue."
        subtitle={selectedProperty ? `Review and resolve concerns for ${selectedProperty.name}.` : "Select a property from Home first."}
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState icon={AlertCircle} eyebrow="Property required" title="No property selected" description="Concerns are scoped to the active owner property." />
      ) : null}

      {selectedProperty ? (
        <>
          <View style={{ gap: spacing.md }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Concern overview
            </Text>
            <Card>
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <MetricTile label="Open" value={String(propertyAvailableRaw.length)} hint="Unassigned" tone={propertyAvailableRaw.length > 0 ? "primary" : "default"} />
                  <MetricTile label="In review" value={String(myInReview.length)} hint="Assigned to me" tone={myInReview.length > 0 ? "primary" : "default"} />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <MetricTile label="In progress" value={String(myInProgress.length)} hint="Being handled" />
                  <MetricTile label="Escalated" value={String(propertyEscalatedRaw.length)} hint="Needs owner" tone={propertyEscalatedRaw.length > 0 ? "danger" : "default"} />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <MetricTile label="Resolved" value={String(resolvedThisWeek)} hint="This week" />
                  <MetricTile label="Reopened" value={String(myReopened.length)} hint="Needs re-handling" tone={myReopened.length > 0 ? "primary" : "default"} />
                </View>
              </View>
            </Card>
          </View>

          {activeAccount === "owner" ? (
            <Card>
              <View style={{ gap: spacing.sm }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>Concern monitor</Text>
                <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>
                  Track active concern progress
                </Text>
                <Text style={[type.body, { color: colors.muted }]}>
                  Under review, in progress, reopened, and resolved-window concerns only.
                </Text>
                <ActionButton
                  icon={Activity}
                  label="Open monitor"
                  onPress={() => router.push({ pathname: "/owner-concern-monitor", params: { propertyId: selectedProperty.id } })}
                  variant="secondary"
                />

                {/* History sits with the monitor rather than under the queues:
                    both are ways of looking BACK at concerns, where the queues
                    below are the ones still needing work. */}
                <View style={{ backgroundColor: colors.border, height: 1, marginVertical: spacing.xs }} />

                <Text style={[type.eyebrow, { color: colors.kicker }]}>Concern history</Text>
                <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>
                  View past concerns
                </Text>
                <Text style={[type.body, { color: colors.muted }]}>
                  Resolved and closed concerns for this property, regardless of who handled them.
                </Text>
                <ActionButton
                  icon={Clock3}
                  label={`${historyQuery.data?.totalElements ?? 0} history items`}
                  onPress={() => setPropertyHistoryOpen(true)}
                  variant="secondary"
                />
              </View>
            </Card>
          ) : null}

          <Section title="Concern queues">
            <ConcernQueueTabs onChange={setQueueTab} tab={queueTab} />
            {queueTab === "property" ? (
              <View style={{ gap: spacing.md }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  <TabChip active={propertyTab === "available"} count={propertyAvailableRaw.length} label="Available" onPress={() => setPropertyTab("available")} />
                  <TabChip active={propertyTab === "escalated"} blink={propertyEscalatedRaw.length > 0} count={propertyEscalatedRaw.length} label="Escalated" onPress={() => setPropertyTab("escalated")} />
                </ScrollView>
                <TabHeading count={propertyConcerns.length} text={propertyTab === "available" ? "Available concerns" : "Escalated concerns"} />
                <QueueWindow loading={propertyLoading}>
                  {propertyConcerns.length > 0 ? (
                    propertyPaged.items.map((concern) => (
                      <ConcernCard actionLabel="Review" concern={concern} key={concern.id} onPress={() => openConcern(concern, "property")} />
                    ))
                  ) : (
                    <EmptyState icon={AlertCircle} eyebrow="Property" title="No property concerns" description="Available and escalated tenant concerns will appear here." />
                  )}
                  {propertyConcerns.length > 0 ? (
                    <PaginationBar
                      hasNext={propertyPaged.page + 1 < propertyPaged.totalPages}
                      hasPrevious={propertyPaged.page > 0}
                      onNext={() => setPropertyPage(propertyPaged.page + 1)}
                      onPrevious={() => setPropertyPage(Math.max(0, propertyPaged.page - 1))}
                      page={propertyPaged.page}
                      totalElements={propertyConcerns.length}
                      totalPages={propertyPaged.totalPages}
                    />
                  ) : null}
                </QueueWindow>
              </View>
            ) : !canWorkConcerns ? (
              // The tab still opens — hiding it would read as a bug. What it
              // shows is why it is empty, since a view-only manager can never
              // take a concern up and so can never have a personal queue.
              <EmptyState
                icon={Lock}
                eyebrow="View-only access"
                title="You cannot take up concerns"
                description="Your access to concerns is view-only, so nothing can be assigned to you here. Ask the property owner if you need to work on them."
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  <TabChip active={myTab === "review"} count={myInReview.length} label="In review" onPress={() => setMyTab("review")} />
                  <TabChip active={myTab === "progress"} count={myInProgress.length} label="In progress" onPress={() => setMyTab("progress")} />
                  <TabChip active={myTab === "reopened"} count={myReopened.length} label="Reopened" onPress={() => setMyTab("reopened")} />
                  <TabChip active={myTab === "history"} count={myHistoryRaw.length} label="History" onPress={() => setMyTab("history")} />
                </ScrollView>
                <TabHeading count={myVisibleConcerns.length} text={myTabHeadingText(myTab)} />
                <QueueWindow loading={myLoading}>
                  {myVisibleConcerns.length > 0 ? (
                    myPaged.items.map((concern) => (
                      <ConcernCard
                        actionLabel="View"
                        concern={concern}
                        key={concern.id}
                        onPress={() => openConcern(concern, myTab === "history" ? "history" : "taken")}
                      />
                    ))
                  ) : (
                    <EmptyState icon={Clock3} eyebrow="My concerns" title="No concerns in this queue" description="Concerns you take up will appear here." />
                  )}
                  {myVisibleConcerns.length > 0 ? (
                    <PaginationBar
                      hasNext={myPaged.page + 1 < myPaged.totalPages}
                      hasPrevious={myPaged.page > 0}
                      onNext={() => setMyPage(myPaged.page + 1)}
                      onPrevious={() => setMyPage(Math.max(0, myPaged.page - 1))}
                      page={myPaged.page}
                      totalElements={myVisibleConcerns.length}
                      totalPages={myPaged.totalPages}
                    />
                  ) : null}
                </QueueWindow>
              </View>
            )}
          </Section>

        </>
      ) : null}

      {propertyHistoryOpen && selectedProperty ? (
        <HistoryModal
          onClose={() => setPropertyHistoryOpen(false)}
          onOpen={(concern) => openConcern(concern, "history")}
          propertyId={selectedProperty.id}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function ConcernQueueTabs({ onChange, tab }: { onChange: (tab: QueueTab) => void; tab: QueueTab }) {
  return (
    <TabSwitcher
      active={tab}
      onChange={onChange}
      options={[
        { label: "Property", value: "property" },
        { label: "My concerns", value: "mine" },
      ]}
    />
  );
}


function TabChip({
  active,
  blink = false,
  count,
  label,
  onPress,
}: {
  active: boolean;
  blink?: boolean;
  count: number;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  // When urgent (escalated count > 0) the chip gets a softly blinking red ring
  // to draw the eye, regardless of whether the tab is currently active.
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
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primary : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
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
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, }}>
        {label}
      </Text>
      <View
        style={{
          alignItems: "center",
          backgroundColor: active ? "rgba(255,255,255,0.22)" : colors.surface,
          borderRadius: 999,
          justifyContent: "center",
          minWidth: 22,
          paddingHorizontal: 6,
          paddingVertical: 1,
        }}
      >
        <Text style={{ color: active ? colors.onPrimary : colors.muted, fontFamily: fonts.sansBold, fontSize: 11, }}>
          {count}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function TabHeading({ count, text }: { count: number; text: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.caption, { color: colors.muted, fontWeight: "800", letterSpacing: 0.3 }]}>
      {text} · {count}
    </Text>
  );
}

/**
 * The queue body. A plain stack now — it used to be a bordered, max-height
 * ScrollView, which put a scrolling page inside a scrolling page and made the
 * cards read as contents of a box rather than as the list itself.
 */
function QueueWindow({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return <View style={{ gap: spacing.md }}>{loading ? <SkeletonCard /> : children}</View>;
}


function ConcernCard({ actionLabel, concern, onPress }: { actionLabel: string; concern: ConcernSummary; onPress: () => void }) {
  const { colors, type } = useTheme();
  const photoCount = concern.photos.filter((photo) => Boolean(photo.photoUrl)).length;
  // Escalation is only surfaced while the concern is still open/unassigned; once
  // it is being worked on (under review / in progress) we show the status instead.
  const showEscalation = concern.escalationLevel !== "NONE" && concern.status === "OPEN";
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>
            {concern.referenceCode}
          </Text>
          <Text style={[type.caption, { color: showEscalation ? colors.danger : colors.muted, fontWeight: "900" }]}>
            {showEscalation ? humanizeToken(concern.escalationLevel) : humanizeToken(concern.status)}
          </Text>
        </View>
        <Text style={[type.display, { color: colors.ink, fontSize: 21, lineHeight: 26 }]} numberOfLines={1}>{concern.title}</Text>
        <Text style={[type.body, { color: colors.muted }]} numberOfLines={2}>{concern.description}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Text style={[type.caption, { color: colors.kicker }]}>{humanizeToken(concern.category)}</Text>
          <Text style={[type.caption, { color: colors.kicker }]}>Room {concern.roomNumber}</Text>
          <Text style={[type.caption, { color: colors.kicker }]}>{formatDateTime(concern.createdAt)}</Text>
          <Text style={[type.caption, { color: colors.kicker }]}>{photoCount ? `${photoCount} image${photoCount === 1 ? "" : "s"}` : "No images"}</Text>
        </View>
        {concern.statusNote ? (
          <Text style={[type.caption, { color: colors.primary }]} numberOfLines={1}>Note: {concern.statusNote}</Text>
        ) : null}
        {concern.reopened ? (
          <Text style={[type.caption, { color: colors.danger }]} numberOfLines={1}>Reopened: {concern.reopenReason ?? "No reason provided"}</Text>
        ) : null}
        <ActionButton icon={actionLabel === "View" ? Eye : Clock3} label={actionLabel} onPress={onPress} variant="secondary" />
      </View>
    </Card>
  );
}

function HistoryModal({
  onClose,
  onOpen,
  propertyId,
}: {
  onClose: () => void;
  onOpen: (concern: ConcernSummary) => void;
  propertyId: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [page, setPage] = useState(0);
  const query = useListPropertyConcernHistoryQuery({ page, propertyId, size: 20 });
  const pageData = query.data;
  const sorted = useMemo(() => sortLatest(pageData?.items ?? []), [pageData]);
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "88%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>Property history</Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23, }}>Resolved concerns</Text>
            </View>
            <IconButton accessibilityLabel="Close property history" icon={X} onPress={onClose} />
          </View>
          {query.isFetching && !pageData ? (
            <SkeletonCard />
          ) : (
            <ScrollView contentContainerStyle={{ gap: spacing.md, opacity: query.isFetching ? 0.6 : 1 }} showsVerticalScrollIndicator={false}>
              {sorted.length > 0 ? sorted.map((concern) => <ConcernCard actionLabel="View" concern={concern} key={concern.id} onPress={() => onOpen(concern)} />) : null}
              {sorted.length === 0 ? <EmptyState icon={Clock3} eyebrow="Property history" title="No history yet" description="Resolved and closed concerns will appear here." /> : null}
            </ScrollView>
          )}
          {pageData && pageData.totalElements > 0 ? (
            <PaginationBar
              hasNext={pageData.hasNext}
              hasPrevious={pageData.hasPrevious}
              onNext={() => setPage((current) => current + 1)}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              page={pageData.page}
              totalElements={pageData.totalElements}
              totalPages={pageData.totalPages}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function sortByEscalation(concerns: ConcernSummary[]) {
  const escalationRank: Record<string, number> = { CRITICAL: 4, ESCALATED: 3, ATTENTION: 2, NONE: 1 };
  return [...concerns].sort((left, right) => {
    const escalationDelta = (escalationRank[right.escalationLevel] ?? 0) - (escalationRank[left.escalationLevel] ?? 0);
    if (escalationDelta !== 0) return escalationDelta;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function sortLatest(concerns: ConcernSummary[]) {
  return [...concerns].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  return selectedPropertyId ? properties.find((property) => property.id === selectedPropertyId) ?? null : properties.length === 1 ? properties[0] : null;
}
