import { useEffect, useState } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { AlertModal } from "@/components/alert-modal";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import { useToast } from "@/components/toast";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useCancelPendingTenancyMutation } from "@/store/services/compliance-api";
import { errorMessage } from "@/features/forms/server-error";
import { Image, Text, View } from "react-native";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Bell, FileSignature, History, Lock, LogOut, Minus, UserMinus, UserPlus, Users, UsersRound } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { SheetShell } from "@/components/sheet-shell";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useScreenAccessGuard } from "@/features/owner/use-screen-access-guard";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import {
  OwnerTenancyInitialSkeleton,
  OwnerTenancyListSkeleton,
  OwnerTenancySnapshotSkeleton,
} from "@/components/skeletons/owner";
import { ActiveTenancyCard, PastTenancyCard } from "@/features/owner/tenancy-list";
import { useAppSelector } from "@/store/hooks";
import { useGetOwnerDashboardQuery } from "@/store/services/dashboard-api";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import {
  type TenancySummary,
  useListActivePropertyTenanciesQuery,
  useListPastPropertyTenanciesQuery,
  useListUpcomingTenancyExitsQuery,
} from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { metricFontSize } from "@/theme/metric-size";

import { useTheme } from "@/theme/use-theme";
import { HeaderGradient } from "@/components/header-gradient";

const NO_PERSON_ILLUSTRATION = require("../assets/workspace/No-Person_512x512.png");

const TENANCY_PAGE_SIZE = 10;
const TENANCY_HEADER_ILLUSTRATION = require("../assets/workspace/tenancy-header.png");

export default function OwnerTenancyWorkspaceScreen() {
  const router = useGuardedRouter();
  const { colors } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const [historyOpen, setHistoryOpen] = useState(false);
  // "?open=upcoming-exits" arrives from the action centre, whose Upcoming exits
  // row is about the stays listed in this sheet — not the exit REQUESTS screen,
  // which is a different queue.
  // Withdrawing a stay the tenant never accepted. Held here rather than in the
  // card so one dialog serves the whole list.
  const [pendingRemoval, setPendingRemoval] = useState<TenancySummary | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancelPendingTenancy] = useCancelPendingTenancyMutation();
  const removeErrors = useFormErrors<never>();
  const toast = useToast();
  const [activePage, setActivePage] = useState(0);
  const [pastPage, setPastPage] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  // Debounce the search box so each keystroke doesn't fire a request; reset both
  // tabs to the first page whenever the committed query changes.
  useEffect(() => {
    const handle = setTimeout(() => {
      setCommittedQuery(searchDraft.trim());
      setActivePage(0);
      setPastPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchDraft]);

  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  // Tools and rules are destinations: blocked means the screen refuses to open
  // and says why. Property stays is a panel already on screen, so it explains
  // inside instead.
  const { canManage, canView } = usePropertyPermissions(selectedProperty?.id);
  const { dialog: accessDialog, guard } = useScreenAccessGuard(selectedProperty?.id);
  const upcomingExitsQuery = useListUpcomingTenancyExitsQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty || !canView("EXIT_REQUESTS"),
  });

  const dashboardQuery = useGetOwnerDashboardQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const activeTenanciesQuery = useListActivePropertyTenanciesQuery(
    // Only filter the active query while the active tab is showing, so the "Active"
    // metric stays accurate when searching from the past tab.
    { page: activePage, propertyId: selectedProperty?.id ?? "", query: committedQuery, size: TENANCY_PAGE_SIZE },
    { skip: !selectedProperty },
  );
  const pastTenanciesQuery = useListPastPropertyTenanciesQuery(
    { page: pastPage, propertyId: selectedProperty?.id ?? "", query: committedQuery, size: TENANCY_PAGE_SIZE },
    { skip: !selectedProperty || !historyOpen },
  );

  const rooms = roomsQuery.data ?? [];
  const activeTenancies = activeTenanciesQuery.data;
  const pastTenancies = pastTenanciesQuery.data;
  // The panel is the live list only; history is a modal of its own.
  const visiblePage = activeTenancies;
  const isLoading = activeTenanciesQuery.isFetching;
  const isError = activeTenanciesQuery.isError;

  // Stays whose checkout falls in the next 7 days, IST — the same window the
  // dashboard's upcomingExits counts, derived here from the list already loaded
  // rather than fetched again.
  const tenancySnapshot = dashboardQuery.data?.tenancy;

  function openActiveTenancy(tenancy: TenancySummary) {
    const roomLabel = rooms.find((room) => room.id === tenancy.roomId)?.roomNumber ?? "";
    router.push({
      pathname: "/owner-active-tenancy-detail",
      params: {
        billingStarted: tenancy.billingStarted ? "true" : "false",
        billingType: tenancy.billingType,
        dailyRatePaise: tenancy.dailyRatePaise?.toString() ?? "",
        depositAmountPaise: tenancy.depositAmountPaise?.toString() ?? "",
        plannedEndDate: tenancy.plannedEndDate ?? "",
        referenceCode: tenancy.referenceCode,
        rentAmountPaise: tenancy.rentAmountPaise?.toString() ?? "",
        roomLabel,
        startDate: tenancy.startDate,
        status: tenancy.status,
        tenantName: tenancy.tenantName?.trim() || "Unnamed tenant",
        tenantPhone: tenancy.tenantPhone ?? "",
        tenantPhoneVerified: tenancy.tenantPhoneVerified ? "true" : "false",
        tenantProfileCompleted: tenancy.tenantProfileCompleted ? "true" : "false",
        tenancyId: tenancy.id,
        // A daily guest stay has no account, so there is no user to pass on.
        // Sent as the flag rather than an absent param, because the detail
        // screen has to say "no account" rather than leave a field blank.
        guestStay: tenancy.guestStay ? "true" : "false",
        userId: tenancy.userId ?? "",
      },
    });
  }

  return (
    <>
    <ScreenScrollView
      background={<HeaderGradient />}
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
    >
      {/* Main module screen, so the standalone Back pill and no line header —
          the inline arrow belongs to nested screens, which name their parent
          in the eyebrow beside it. */}
      <ScreenHeader
        italicTail="workspace."
        titleAdjustsFontSizeToFit
        titleMinimumFontScale={0.82}
        titleNumberOfLines={1}
        titleStyle={{ fontSize: 22, letterSpacing: -0.5, lineHeight: 28 }}
        subtitle={
          selectedProperty
            ? `Tenancy workspace for ${selectedProperty.name}.`
            : "Select a property on Home first."
        }
        artwork={TENANCY_HEADER_ILLUSTRATION}
        title="Tenancy"
      />

      {propertiesQuery.isFetching && properties.length === 0 ? (
        <OwnerTenancyInitialSkeleton />
      ) : null}

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={UsersRound}

          title="No active property selected"
          description="Go to Home and choose the property whose tenancies you want to manage."
        />
      ) : null}

      {selectedProperty ? (
        <>

          {tenancySnapshot ? (
            <Section title="Tenancy snapshot">
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TenancySnapshotTile
                  delta={{ current: tenancySnapshot.activeTenants, previous: tenancySnapshot.activeTenantsPrevMonth }}
                  icon={Users}
                  // "Active" alone: in the rail the label has half a tile
                  // to share with the glyph, and "Active tenants" ellipsised to
                  // "Active ten…". The section already says these are tenancies.
                  label="Active"
                  value={String(tenancySnapshot.activeTenants)}
                />
                <TenancySnapshotTile
                  hint="Notice served"
                  icon={Bell}
                  label="On notice"
                  value={String(tenancySnapshot.onNotice)}
                />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TenancySnapshotTile
                  delta={{ current: tenancySnapshot.startedThisMonth, previous: tenancySnapshot.startedPrevMonth }}
                  icon={UserPlus}
                  label="Started"
                  value={String(tenancySnapshot.startedThisMonth)}
                />
                <TenancySnapshotTile
                  delta={{ current: tenancySnapshot.endedThisMonth, previous: tenancySnapshot.endedPrevMonth }}
                  icon={UserMinus}
                  label="Ended"
                  lowerIsBetter
                  value={String(tenancySnapshot.endedThisMonth)}
                />
              </View>
            </Section>
          ) : dashboardQuery.isFetching ? (
            // Inside the Section, so the heading stays put and only the tiles
            // under it are pending — the page does not grow a heading when the
            // data lands.
            <Section title="Tenancy snapshot">
              <OwnerTenancySnapshotSkeleton />
            </Section>
          ) : null}

          <Section title="Tenancy tools">
            <View style={{ gap: spacing.sm }}>
              <TenancyToolRow
                tools={[
                  {
                    icon: UserPlus,
                    key: "create",
                    label: "Create tenancy",
                    onPress: () => guard("TENANCY_CREATE", "Creating a tenancy", () => router.push("/owner-onboard-tenant")),
                  },
                  {
                    badge: dashboardQuery.data?.attention.pendingExitRequests ?? 0,
                    icon: LogOut,
                    key: "exit-requests",
                    label: "Exit requests",
                    onPress: () => guard("EXIT_REQUESTS", "Exit requests", () => router.push("/owner-exit-requests")),
                  },
                  {
                    badge: dashboardQuery.data?.attention.pendingRoomChangeRequests ?? 0,
                    icon: ArrowLeftRight,
                    key: "room-change",
                    label: "Room change",
                    onPress: () => guard("ROOM_CHANGES", "Room changes", () => router.push("/owner-room-change-requests")),
                  },
                ]}
              />
              <TenancyToolRow
                tools={[
                  {
                    icon: History,
                    key: "history",
                    label: "Tenancy history",
                    onPress: () => guard("TENANCIES", "Tenancy history", () => setHistoryOpen(true)),
                  },
                  {
                    badge: upcomingExitsQuery.data?.length ?? 0,
                    icon: LogOut,
                    key: "upcoming-exits",
                    label: "Upcoming exits",
                    onPress: () => guard("EXIT_REQUESTS", "Upcoming exits", () => router.push("/owner-upcoming-exits")),
                  },
                ]}
              />
            </View>
          </Section>
          {/* Moved here from the Property workspace: both are rules that govern a
              TENANCY — what a tenant must accept to move in, and what happens
              when they move out. They were only under Property because that is
              where they are configured, which is where the owner does not look
              for them. */}
          <Section title="Tenancy rules">
            <ActionCard
              borderRadius={radii.card}
              icon={FileSignature}
              title="Tenancy agreement"
              description="Choose whether monthly tenancies need an accepted agreement, and author its default terms."
              onPress={() => guard("TENANCY_RULES", "Tenancy agreement", () => router.push("/owner-tenancy-agreement"))}
            />
            <ActionCard
              borderRadius={radii.card}
              icon={FileSignature}
              title="Exit policies"
              description="Set the damage-charge schedule and move-out checklist used when a tenancy ends and its deposit is settled."
              onPress={() => guard("TENANCY_RULES", "Exit policies", () => router.push("/owner-exit-policies"))}
            />
          </Section>

          <Section title="Property stays">
            {!canView("TENANCIES") ? (
              // A panel, not a destination — so it explains rather than refusing
              // to open something the manager is already looking at.
              <EmptyState
                icon={Lock}

                title="You cannot view tenancies"
                description="The property owner has not given you access to the stay list. Ask them if you need it."
              />
            ) : (
            <View style={{ gap: spacing.md }}>
              <SearchField onChangeText={setSearchDraft} placeholder="Search by tenant name, phone or tenancy ID" value={searchDraft} />

              {isLoading && !visiblePage ? <OwnerTenancyListSkeleton /> : null}

              {isError ? (
                <EmptyState
                  icon={UsersRound}

                  title="Could not load tenancies"
                  description="Refresh the screen and try again."
                />
              ) : null}

              {!isLoading && !isError && visiblePage?.items.length === 0 ? (
                <EmptyState
                  artwork={NO_PERSON_ILLUSTRATION}
                  title={committedQuery ? "No tenancies found" : "No active tenancies"}
                  description={
                    committedQuery
                      ? "No tenancy matched that tenant name, phone or tenancy ID."
                      : "Newly onboarded tenants for this property will appear here."
                  }
                />
              ) : null}

              {visiblePage?.items.map((tenancy) => {
                const roomLabel = rooms.find((room) => room.id === tenancy.roomId)?.roomNumber ?? null;
                return (
                  <ActiveTenancyCard
                    key={tenancy.id}
                    canEndTenancy={canManage("TENANCIES")}
                    ending={false}
                    onEndTenancy={() => router.push({ pathname: "/owner-end-tenancy", params: { tenancyId: tenancy.id } })}
                    onOpen={() => openActiveTenancy(tenancy)}
                    onRemove={() => setPendingRemoval(tenancy)}
                    removing={removingId === tenancy.id}
                    roomLabel={roomLabel}
                    tenancy={tenancy}
                  />
                );
              })}

              {visiblePage && visiblePage.totalElements > 0 ? (
                <PaginationBar
                  hasNext={visiblePage.hasNext}
                  hasPrevious={visiblePage.hasPrevious}
                  onNext={() => setActivePage((page) => page + 1)}
                  onPrevious={() => setActivePage((page) => Math.max(page - 1, 0))}
                  page={visiblePage.page}
                  totalElements={visiblePage.totalElements}
                  totalPages={visiblePage.totalPages}
                />
              ) : null}
            </View>
            )}
          </Section>

        </>
      ) : null}
      {accessDialog}
      {pendingRemoval ? (
        <ConfirmDialog
          confirmLabel="Remove"
          destructive
          message={`Remove ${pendingRemoval.tenantName?.trim() || "this tenancy"}? The bed is freed and the agreement is cancelled. Nothing has been billed, so there is nothing to settle.`}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            const target = pendingRemoval;
            setPendingRemoval(null);
            setRemovingId(target.id);
            void (async () => {
              try {
                await cancelPendingTenancy({ tenancyId: target.id }).unwrap();
                toast.success(`${target.tenantName?.trim() || "Tenancy"} removed.`);
              } catch (caught) {
                removeErrors.failFromServer(
                  errorMessage(caught) || "Could not remove the tenancy. It may already have been accepted.",
                );
              } finally {
                setRemovingId(null);
              }
            })();
          }}
          title="Remove this tenancy?"
        />
      ) : null}
      {removeErrors.serverError ? (
        <AlertModal message={removeErrors.serverError} onClose={removeErrors.dismissServerError} />
      ) : null}
    </ScreenScrollView>

    {historyOpen ? (
      <SheetShell onClose={() => setHistoryOpen(false)} title="Tenancy history">
        {pastTenanciesQuery.isFetching && !pastTenancies ? <OwnerTenancyListSkeleton rows={3} /> : null}

        {!pastTenanciesQuery.isFetching && (pastTenancies?.items.length ?? 0) === 0 ? (
          <EmptyState
            artwork={NO_PERSON_ILLUSTRATION}
            title="No past tenancies"
            description="Completed and inactive tenancies appear here after a stay ends."
          />
        ) : null}

        {pastTenancies?.items.map((tenancy) => (
          <PastTenancyCard
            key={tenancy.id}
            roomLabel={rooms.find((room) => room.id === tenancy.roomId)?.roomNumber ?? null}
            tenancy={tenancy}
          />
        ))}

        {pastTenancies && pastTenancies.totalElements > 0 ? (
          <PaginationBar
            hasNext={pastTenancies.hasNext}
            hasPrevious={pastTenancies.hasPrevious}
            onNext={() => setPastPage((page) => page + 1)}
            onPrevious={() => setPastPage((page) => Math.max(page - 1, 0))}
            page={pastTenancies.page}
            totalElements={pastTenancies.totalElements}
            totalPages={pastTenancies.totalPages}
          />
        ) : null}
      </SheetShell>
    ) : null}

    </>
  );
}

function TenancySnapshotTile({
  delta,
  hint,
  icon: Icon,
  label,
  lowerIsBetter,
  value,
}: {
  delta?: { current: number; previous: number };
  /**
   * A line under the number where a tile has no month-on-month figure.
   *
   * <p>Every tile needs its third line, or the one without it sits short
   * against a neighbour that has one — content pinned to the top of a stretched
   * tile with blank beneath. On notice is the case: the snapshot carries no
   * previous-month count for it, so there is no delta to compute.
   */
  hint?: string;
  icon: typeof Users;
  label: string;
  lowerIsBetter?: boolean;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        gap: spacing.xs,
        justifyContent: "center",
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    >
      {/* The billing and concern card's rail: a 44 box holding a 30 glyph in
          ink, with the label beside it rather than above. Centred, at 148pt
          tall with a 34pt number, these tiles were twice the height of every
          other summary in the app and read as a different kind of thing. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
          <Icon color={colors.ink} size={38} strokeWidth={1.75} />
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          {/* Sentence case at caption size, as on the billing tile. Tracked-out
              caps beside a 38pt glyph read as a second graphic rather than as
              the number's label. */}
          <Text numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 13, lineHeight: 17 }]}>
            {label}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              // Shrinks with the figure's length rather than ellipsising.
              fontSize: metricFontSize(value, 23),
              fontVariant: ["tabular-nums"],
              lineHeight: metricFontSize(value, 23) + 5,
            }}
          >
            {value}
          </Text>

        </View>
      </View>

      {/* Under the whole row on the tile's full width, exactly as the dashboard
          tenancy snapshot does it. In the column beside a 38pt glyph the phrase
          had about half a tile and "39% vs last month" wrapped to two lines,
          which made one tile taller than the one next to it. */}
      {delta ? (
        <TenancyDelta
          current={delta.current}
          lowerIsBetter={lowerIsBetter}
          previous={delta.previous}
        />
      ) : hint ? (
        <Text numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 11, lineHeight: 15 }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function TenancyDelta({ current, lowerIsBetter, previous }: { current: number; lowerIsBetter?: boolean; previous: number }) {
  const { colors, fonts } = useTheme();
  const percent = previous === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - previous) / previous) * 100);
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  const good = lowerIsBetter ? direction === "down" : direction === "up";
  const color = direction === "flat" ? colors.muted : good ? colors.successText : colors.danger;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 3 }}>
      <Icon color={color} size={13} strokeWidth={2.5} style={{ marginTop: 1 }} />
      {/* flexShrink so the phrase wraps inside the column instead of pushing
          past the tile's edge — the rail leaves it about half a tile's width. */}
      <Text style={{ color, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 15 }}>
        {Math.abs(percent)}% vs last month
      </Text>
    </View>
  );
}

type TenancyToolItem = {
  badge?: number;
  icon: typeof UserPlus;
  key: string;
  label: string;
  onPress: () => void;
};

function TenancyToolRow({ tools }: { tools: TenancyToolItem[] }) {
  const { colors } = useTheme();

  return (
    <Card style={{ flexDirection: "row", gap: 0, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm }}>
      {tools.map((tool, index) => (
        <View key={tool.key} style={{ alignItems: "stretch", flex: 1, flexDirection: "row" }}>
          {index > 0 ? (
            <View
              style={{
                alignSelf: "center",
                backgroundColor: colors.borderStrong,
                height: 62,
                opacity: 0.65,
                width: 1,
              }}
            />
          ) : null}
          <TenancyToolBox badge={tool.badge} icon={tool.icon} label={tool.label} onPress={tool.onPress} />
        </View>
      ))}
    </Card>
  );
}
function TenancyToolBox({ badge, icon: Icon, label, onPress }: { badge?: number; icon: typeof UserPlus; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const badgeLabel = badge != null && badge > 0 ? (badge > 99 ? "99+" : String(badge)) : null;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        flex: 1,
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 88,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
      }}
    >
      {badgeLabel ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.danger,
            borderRadius: 999,
            justifyContent: "center",
            minWidth: 20,
            paddingHorizontal: 6,
            paddingVertical: 1,
            position: "absolute",
            right: 8,
            top: 6,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 11 }}>
            {badgeLabel}
          </Text>
        </View>
      ) : null}
      <Icon color={colors.primary} size={32} strokeWidth={1.9} />
      <Text
        numberOfLines={2}
        style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 15, textAlign: "center" }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }

  return properties.length === 1 ? properties[0] : null;
}
