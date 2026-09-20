import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Activity, AlertCircle, ArrowUp, CheckCircle2, Clock3, Cog, Eye, FileText, Image as ImageIcon, Lock, RefreshCw, UserRound, X } from "lucide-react-native";

import { Image, type ImageSourcePropType } from "react-native";

import { PropertyIcon } from "@/components/property-icon";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { PaginationBar } from "@/components/pagination-bar";
import { HeaderGradient } from "@/components/header-gradient";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { TabSwitcher } from "@/components/tab-switcher";
import { OwnerConcernMetricsSkeleton, OwnerConcernQueueSkeleton } from "@/components/skeletons/owner";
import { ActionButton, IconButton, humanizeToken, ViewOnlyChip } from "@/features/owner/owner-ui";
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

const CONCERN_HEADER_ILLUSTRATION = require("../assets/workspace/concern-header.png");
const CONCERN_MONITOR_ILLUSTRATION = require("../assets/workspace/concern-monitor.png");
const CONCERN_HISTORY_ILLUSTRATION = require("../assets/workspace/concern-history.png");
const CONCERN_EMPTY_ILLUSTRATION = require("../assets/workspace/concern-empty_state.png");

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
  const propertyLoading = propertyTab === "available"
    ? availableQuery.isFetching && !availableQuery.data
    : escalatedQuery.isFetching && !escalatedQuery.data;
  const myRawConcerns = myTab === "review" ? myInReview : myTab === "progress" ? myInProgress : myTab === "reopened" ? myReopened : myHistoryRaw;
  const myVisibleConcerns = sortLatest(myRawConcerns);
  const myLoading = myTab === "history"
    ? historyQuery.isFetching && !historyQuery.data
    : undertakenQuery.isFetching && !undertakenQuery.data;
  const overviewLoading =
    (availableQuery.isFetching && !availableQuery.data) ||
    (escalatedQuery.isFetching && !escalatedQuery.data) ||
    (historyQuery.isFetching && !historyQuery.data) ||
    (canWorkConcerns && undertakenQuery.isFetching && !undertakenQuery.data);

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
    // Header artwork means the gradient — see HeaderGradient.
    <ScreenScrollView background={<HeaderGradient />} safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        badge={!canWorkConcerns ? <ViewOnlyChip /> : null}
        title="Concern"
        italicTail="queues."
        subtitle={selectedProperty ? `Concern workspace for ${selectedProperty.name}.` : "Select a property on Home first."}
        artwork={CONCERN_HEADER_ILLUSTRATION}
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState icon={PropertyIcon} title="No property selected" description="Concerns are scoped to the active owner property." />
      ) : null}

      {selectedProperty ? (
        <>
          <View style={{ gap: spacing.md }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Concern overview
            </Text>
            {/* Six tiles, two to a row, each headed by its own glyph. Three
                across squeezed a two-word label and a count into a third of the
                screen; two across gives every tile the same width and lets the
                number lead.

                No card around them. A Card holding six cards put a surface
                inside a surface, and the tiles already carry their own border
                and lift. */}
            {overviewLoading ? <OwnerConcernMetricsSkeleton /> : <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile icon={FileText} iconPlacement="side" label="Open" value={String(propertyAvailableRaw.length)} hint="Unassigned" tone={propertyAvailableRaw.length > 0 ? "primary" : "default"} />
                <MetricTile icon={Clock3} iconPlacement="side" label="In review" value={String(myInReview.length)} hint="Assigned to me" tone={myInReview.length > 0 ? "primary" : "default"} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile icon={Cog} iconPlacement="side" label="In progress" value={String(myInProgress.length)} hint="Being handled" />
                <MetricTile icon={ArrowUp} iconPlacement="side" label="Escalated" value={String(propertyEscalatedRaw.length)} hint="Needs owner" tone={propertyEscalatedRaw.length > 0 ? "danger" : "default"} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile icon={CheckCircle2} iconPlacement="side" label="Resolved" value={String(resolvedThisWeek)} hint="This week" />
                <MetricTile icon={RefreshCw} iconPlacement="side" label="Reopened" value={String(myReopened.length)} hint="Needs re-handling" tone={myReopened.length > 0 ? "primary" : "default"} />
              </View>
            </View>}
          </View>

          {/* Two cards, one under the other, not one card with a rule down the
              middle of it. They lead to different screens and read as different
              offers — sharing a surface made the second look like a footnote to
              the first. Stacked rather than side by side: at half a phone's
              width the title wraps to three lines and the artwork has nowhere
              to sit. */}
          {activeAccount === "owner" ? (
            <>
              <ConcernRouteCard
                artwork={CONCERN_MONITOR_ILLUSTRATION}
                buttonIcon={Activity}
                buttonLabel="Open monitor"
                description="Under review, in progress, reopened, and resolved-window concerns only."
                eyebrow="Concern monitor"
                onPress={() => router.push({ pathname: "/owner-concern-monitor", params: { propertyId: selectedProperty.id } })}
                title="Track active concern progress"
              />

              <ConcernRouteCard
                artwork={CONCERN_HISTORY_ILLUSTRATION}
                buttonIcon={Clock3}
                buttonLabel={historyQuery.data ? `${historyQuery.data.totalElements} history items` : "View history"}
                description="Resolved and closed concerns for this property, regardless of who handled them."
                eyebrow="Concern history"
                onPress={() => setPropertyHistoryOpen(true)}
                title="View past concerns"
              />
            </>
          ) : null}

          <Section title="Concern queues">
            <ConcernQueueTabs onChange={setQueueTab} tab={queueTab} />
            {queueTab === "property" ? (
              <View style={{ gap: spacing.md }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  <TabChip active={propertyTab === "available"} count={availableQuery.data ? propertyAvailableRaw.length : undefined} label="Available" onPress={() => setPropertyTab("available")} />
                  <TabChip active={propertyTab === "escalated"} blink={propertyEscalatedRaw.length > 0} count={escalatedQuery.data ? propertyEscalatedRaw.length : undefined} label="Escalated" onPress={() => setPropertyTab("escalated")} />
                </ScrollView>
                <TabHeading count={propertyLoading ? undefined : propertyConcerns.length} text={propertyTab === "available" ? "Available concerns" : "Escalated concerns"} />
                <QueueWindow loading={propertyLoading}>
                  {propertyConcerns.length > 0 ? (
                    propertyPaged.items.map((concern) => (
                      <ConcernCard actionLabel="Review" concern={concern} key={concern.id} onPress={() => openConcern(concern, "property")} />
                    ))
                  ) : (
                    <EmptyState artwork={CONCERN_EMPTY_ILLUSTRATION} title="No property concerns" description="Available and escalated tenant concerns will appear here." />
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

                title="You cannot take up concerns"
                description="Your access to concerns is view-only, so nothing can be assigned to you here. Ask the property owner if you need to work on them."
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  <TabChip active={myTab === "review"} count={undertakenQuery.data ? myInReview.length : undefined} label="In review" onPress={() => setMyTab("review")} />
                  <TabChip active={myTab === "progress"} count={undertakenQuery.data ? myInProgress.length : undefined} label="In progress" onPress={() => setMyTab("progress")} />
                  <TabChip active={myTab === "reopened"} count={undertakenQuery.data ? myReopened.length : undefined} label="Reopened" onPress={() => setMyTab("reopened")} />
                  <TabChip active={myTab === "history"} count={historyQuery.data ? myHistoryRaw.length : undefined} label="History" onPress={() => setMyTab("history")} />
                </ScrollView>
                <TabHeading count={myLoading ? undefined : myVisibleConcerns.length} text={myTabHeadingText(myTab)} />
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
                    <EmptyState artwork={CONCERN_EMPTY_ILLUSTRATION} title="No concerns in this queue" description="Concerns you take up will appear here." />
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
        { icon: PropertyIcon, label: "Property", value: "property" },
        { icon: UserRound, label: "My concerns", value: "mine" },
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
  count?: number;
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
      {count != null ? <View
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
      </View> : null}
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

/**
 * The queue body. A plain stack now — it used to be a bordered, max-height
 * ScrollView, which put a scrolling page inside a scrolling page and made the
 * cards read as contents of a box rather than as the list itself.
 */
function QueueWindow({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return <View style={{ gap: spacing.md }}>{loading ? <OwnerConcernQueueSkeleton /> : children}</View>;
}

/**
 * One of the two ways of looking back at concerns.
 *
 * <p>Written once and used twice. The monitor and the history were two copies
 * of the same layout inside one card, which is how they drifted into slightly
 * different type sizes and button variants.
 */
function ConcernRouteCard({
  artwork,
  buttonIcon,
  buttonLabel,
  description,
  eyebrow,
  onPress,
  title,
}: {
  artwork: ImageSourcePropType;
  buttonIcon: typeof Activity;
  buttonLabel: string;
  description: string;
  eyebrow: string;
  onPress: () => void;
  title: string;
}) {
  const { colors, type } = useTheme();

  return (
    <Card>
      {/* Artwork beside the words, not above them. Above, it pushed the title
          into the middle of the card and left the eyebrow floating at the top
          on its own. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>{eyebrow}</Text>
          <Text style={[type.display, { color: colors.ink, fontSize: 20, lineHeight: 25 }]}>{title}</Text>
        </View>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={artwork}
          style={{ height: 76, width: 76 }}
        />
      </View>

      <Text style={[type.body, { color: colors.muted }]}>{description}</Text>

      <ActionButton icon={buttonIcon} label={buttonLabel} onPress={onPress} variant="secondary" />
    </Card>
  );
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
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const query = useListPropertyConcernHistoryQuery({ page, propertyId, size: 20 });
  const pageData = query.data;
  const sorted = useMemo(() => sortLatest(pageData?.items ?? []), [pageData]);
  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
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
            // The modal now draws under the navigation bar, so the sheet has to
            // clear it itself — every other sheet gets this from SheetShell.
            paddingBottom: insets.bottom + spacing.lg,
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
            <OwnerConcernQueueSkeleton />
          ) : (
            <ScrollView contentContainerStyle={{ gap: spacing.md, opacity: query.isFetching ? 0.6 : 1 }} showsVerticalScrollIndicator={false}>
              {sorted.length > 0 ? sorted.map((concern) => <ConcernCard actionLabel="View" concern={concern} key={concern.id} onPress={() => onOpen(concern)} />) : null}
              {sorted.length === 0 ? <EmptyState artwork={CONCERN_EMPTY_ILLUSTRATION} title="No history yet" description="Resolved and closed concerns will appear here." /> : null}
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
