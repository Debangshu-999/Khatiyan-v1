import { useEffect, useMemo, useState } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, Text, View } from "react-native";
import { ArrowLeft, ArrowLeftRight, Bell, FileSignature, History, Lock, LogOut, UserMinus, UserPlus, Users, UsersRound } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { SheetShell } from "@/components/sheet-shell";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useScreenAccessGuard } from "@/features/owner/use-screen-access-guard";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import { SnapshotTile } from "@/components/snapshot-tile";
import { SkeletonList, SkeletonScreen, SkeletonTiles } from "@/components/skeleton";
import { ActiveTenancyCard, PastTenancyCard } from "@/features/owner/tenancy-list";
import { useAppSelector } from "@/store/hooks";
import { useGetOwnerDashboardQuery } from "@/store/services/dashboard-api";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import {
  type TenancySummary,
  useListActivePropertyTenanciesQuery,
  useListPastPropertyTenanciesQuery,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { BackButton } from "@/features/owner/owner-ui";
import { useTheme } from "@/theme/use-theme";

const TENANCY_PAGE_SIZE = 10;

export default function OwnerTenancyWorkspaceScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
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
  const guard = useScreenAccessGuard(selectedProperty?.id);

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
  const upcomingExits = useMemo(() => {
    const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 7);

    return (activeTenancies?.items ?? [])
      .filter((tenancy) => {
        const checkout = tenancy.billingType === "DAILY" ? tenancy.plannedEndDate : tenancy.endDate;
        if (!checkout) {
          return false;
        }
        const date = new Date(checkout);
        return date >= today && date <= horizon;
      })
      .sort((a, b) => {
        const left = (a.billingType === "DAILY" ? a.plannedEndDate : a.endDate) ?? "";
        const right = (b.billingType === "DAILY" ? b.plannedEndDate : b.endDate) ?? "";
        return left.localeCompare(right);
      });
  }, [activeTenancies]);
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
        userId: tenancy.userId,
      },
    });
  }

  return (
    <>
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      {/* Main module screen, so the standalone Back pill and no line header —
          the inline arrow belongs to nested screens, which name their parent
          in the eyebrow beside it. */}
      <BackButton onPress={() => router.back()} />
      <ScreenHeader
        title="Tenancy"
        italicTail="workspace."
        subtitle={
          selectedProperty
            ? `Create, view and manage tenancy actions for ${selectedProperty.name}.`
            : "Select a property from Home before using tenancy actions."
        }
      />

      {propertiesQuery.isFetching && properties.length === 0 ? (
        <SkeletonScreen />
      ) : null}

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={UsersRound}
          eyebrow="Property required"
          title="No active property selected"
          description="Go to Home and choose the property whose tenancies you want to manage."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Active property
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>
              {selectedProperty.name}
            </Text>
            <Text style={[type.body, { color: colors.muted }]}>
              {[selectedProperty.address, selectedProperty.city, selectedProperty.state, selectedProperty.pincode]
                .filter(Boolean)
                .join(", ")}
            </Text>
          </Card>

          {tenancySnapshot ? (
            <Section eyebrow="Tenancy" title="Tenancy snapshot">
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <SnapshotTile
                  icon={Users}
                  label="Active tenants"
                  value={String(tenancySnapshot.activeTenants)}
                  tone="primary"
                  delta={{ current: tenancySnapshot.activeTenants, previous: tenancySnapshot.activeTenantsPrevMonth }}
                />
                <SnapshotTile icon={Bell} label="On notice" value={String(tenancySnapshot.onNotice)} tone={tenancySnapshot.onNotice > 0 ? "danger" : "default"} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <SnapshotTile
                  icon={UserPlus}
                  label="Started"
                  value={String(tenancySnapshot.startedThisMonth)}
                  tone={tenancySnapshot.startedThisMonth > 0 ? "primary" : "default"}
                  delta={{ current: tenancySnapshot.startedThisMonth, previous: tenancySnapshot.startedPrevMonth }}
                />
                <SnapshotTile
                  icon={UserMinus}
                  label="Ended"
                  value={String(tenancySnapshot.endedThisMonth)}
                  delta={{ current: tenancySnapshot.endedThisMonth, previous: tenancySnapshot.endedPrevMonth }}
                  lowerIsBetter
                />
              </View>
            </Section>
          ) : (
            <SkeletonTiles count={2} />
          )}

          <Section eyebrow="Actions" title="Tenancy tools">
            <Card>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TenancyToolBox
                icon={UserPlus}
                label="Create tenancy"
                onPress={() => guard("TENANCY_CREATE", "Creating a tenancy", () => router.push("/owner-onboard-tenant"))}
              />
              <TenancyToolBox
                badge={dashboardQuery.data?.attention.pendingExitRequests ?? 0}
                icon={LogOut}
                label="Exit requests"
                onPress={() => guard("EXIT_REQUESTS", "Exit requests", () => router.push("/owner-exit-requests"))}
              />
              <TenancyToolBox
                badge={dashboardQuery.data?.attention.pendingRoomChangeRequests ?? 0}
                icon={ArrowLeftRight}
                label="Room change"
                onPress={() => guard("ROOM_CHANGES", "Room changes", () => router.push("/owner-room-change-requests"))}
              />
            </View>

            <Divider />

            {/* Same card as the tools, below the line: these are things you look
                up rather than act on. Past stays were behind a tab beside the
                live list, which made the default view ambiguous — you could not
                tell at a glance whether you were seeing current tenants. */}
            <ActionCard
              flush
              icon={History}
              title="Tenancy history"
              description="Completed and inactive tenancies for this property."
              onPress={() => guard("TENANCIES", "Tenancy history", () => setHistoryOpen(true))}
            />

            <Divider />

            <ActionCard
              flush
              icon={LogOut}
              title="Upcoming exits"
              description={
                upcomingExits.length > 0
                  ? `${upcomingExits.length} stay${upcomingExits.length === 1 ? "" : "s"} ending soon.`
                  : "Nothing due"
              }
              badge={upcomingExits.length}
              onPress={() => guard("TENANCIES", "Upcoming exits", () => setUpcomingOpen(true))}
            />
            </Card>
          </Section>

          {/* Moved here from the Property workspace: both are rules that govern a
              TENANCY — what a tenant must accept to move in, and what happens
              when they move out. They were only under Property because that is
              where they are configured, which is where the owner does not look
              for them. */}
          <Section eyebrow="Setup" title="Tenancy rules">
            <ActionCard
              icon={FileSignature}
              title="Tenancy agreement"
              description="Choose whether monthly tenancies need an accepted agreement, and author its default terms."
              onPress={() => guard("TENANCY_RULES", "Tenancy agreement", () => router.push("/owner-tenancy-agreement"))}
            />
            <ActionCard
              icon={FileSignature}
              title="Exit policies"
              description="Set the damage-charge schedule and move-out checklist used when a tenancy ends and its deposit is settled."
              onPress={() => guard("TENANCY_RULES", "Exit policies", () => router.push("/owner-exit-policies"))}
            />
          </Section>

          <Section eyebrow="Tenancies" title="Property stays">
            {!canView("TENANCIES") ? (
              // A panel, not a destination — so it explains rather than refusing
              // to open something the manager is already looking at.
              <EmptyState
                icon={Lock}
                eyebrow="No access"
                title="You cannot view tenancies"
                description="The property owner has not given you access to the stay list. Ask them if you need it."
              />
            ) : (
            <View style={{ gap: spacing.md }}>
              <SearchField onChangeText={setSearchDraft} placeholder="Search by tenant name, phone or tenancy ID" value={searchDraft} />

              {isLoading && !visiblePage ? (
                <SkeletonList />
              ) : null}

              {isError ? (
                <EmptyState
                  icon={UsersRound}
                  eyebrow="Unavailable"
                  title="Could not load tenancies"
                  description="Refresh the screen and try again."
                />
              ) : null}

              {!isLoading && !isError && visiblePage?.items.length === 0 ? (
                <EmptyState
                  icon={UsersRound}
                  eyebrow={committedQuery ? "No matches" : "No active stay"}
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
    </ScreenScrollView>

    {historyOpen ? (
      <SheetShell onClose={() => setHistoryOpen(false)} title="Tenancy history">
        {pastTenanciesQuery.isFetching && !pastTenancies ? <SkeletonList /> : null}

        {!pastTenanciesQuery.isFetching && (pastTenancies?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={History}
            eyebrow="No history"
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

    {upcomingOpen ? (
      <SheetShell onClose={() => setUpcomingOpen(false)} title="Upcoming exits">
        {upcomingExits.length === 0 ? (
          <NothingUpcomingExits />
        ) : (
          upcomingExits.map((tenancy) => (
            <ActiveTenancyCard
              key={tenancy.id}
              canEndTenancy={canManage("TENANCIES")}
              ending={false}
              onEndTenancy={() => {
                setUpcomingOpen(false);
                router.push({ pathname: "/owner-end-tenancy", params: { tenancyId: tenancy.id } });
              }}
              onOpen={() => {
                setUpcomingOpen(false);
                openActiveTenancy(tenancy);
              }}
              roomLabel={rooms.find((room) => room.id === tenancy.roomId)?.roomNumber ?? null}
              tenancy={tenancy}
            />
          ))
        )}
      </SheetShell>
    ) : null}
    </>
  );
}

/**
 * Mirrors the upcoming-notices empty state: centred in the space the list would
 * have filled, bordered glyph, "All clear". Kept visually identical because the
 * two answer the same question in the same shape — what is coming, and nothing
 * is.
 */
function NothingUpcomingExits() {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        gap: spacing.md,
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xxxl,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.ink,
          borderCurve: "continuous",
          borderRadius: 18,
          borderWidth: 1,
          height: 58,
          justifyContent: "center",
          width: 58,
        }}
      >
        <LogOut color={colors.ink} size={26} strokeWidth={2} />
      </View>
      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21 }}>
          All clear
        </Text>
        <Text style={[type.body, { color: colors.muted, maxWidth: 320, textAlign: "center" }]}>
          No stay is due to end in the next seven days.
        </Text>
      </View>
    </View>
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
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 112,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.md,
      }}
    >
      {badgeLabel ? (
        // New-data counter pinned to the tile corner (e.g. pending requests).
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
            top: 8,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 11, }}>
            {badgeLabel}
          </Text>
        </View>
      ) : null}
      <Icon color={colors.primary} size={48} strokeWidth={1.8} />
      <Text
        style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 15, textAlign: "center" }}
        numberOfLines={2}
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