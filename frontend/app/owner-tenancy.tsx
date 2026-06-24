import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { ArrowLeft, ArrowLeftRight, Bell, DoorOpen, LogOut, UserMinus, UserPlus, Users, UsersRound } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import { SnapshotTile } from "@/components/snapshot-tile";
import { ActiveTenancyCard, PastTenancyCard, TenancyListTabs, type OwnerTenancyListTab } from "@/features/owner/tenancy-list";
import { useAppSelector } from "@/store/hooks";
import { useGetOwnerDashboardQuery } from "@/store/services/dashboard-api";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import {
  type TenancySummary,
  useListActivePropertyTenanciesQuery,
  useListPastPropertyTenanciesQuery,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const TENANCY_PAGE_SIZE = 10;

export default function OwnerTenancyWorkspaceScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const [activeTab, setActiveTab] = useState<OwnerTenancyListTab>("active");
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
  const dashboardQuery = useGetOwnerDashboardQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const activeTenanciesQuery = useListActivePropertyTenanciesQuery(
    // Only filter the active query while the active tab is showing, so the "Active"
    // metric stays accurate when searching from the past tab.
    { page: activePage, propertyId: selectedProperty?.id ?? "", query: activeTab === "active" ? committedQuery : "", size: TENANCY_PAGE_SIZE },
    { skip: !selectedProperty },
  );
  const pastTenanciesQuery = useListPastPropertyTenanciesQuery(
    { page: pastPage, propertyId: selectedProperty?.id ?? "", query: committedQuery, size: TENANCY_PAGE_SIZE },
    { skip: !selectedProperty || activeTab !== "past" },
  );

  const rooms = roomsQuery.data ?? [];
  const activeTenancies = activeTenanciesQuery.data;
  const pastTenancies = pastTenanciesQuery.data;
  const visiblePage = activeTab === "active" ? activeTenancies : pastTenancies;
  const isLoading = activeTab === "active" ? activeTenanciesQuery.isFetching : pastTenanciesQuery.isFetching;
  const isError = activeTab === "active" ? activeTenanciesQuery.isError : pastTenanciesQuery.isError;
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
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
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
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
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
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Active property
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]} selectable>
              {selectedProperty.name}
            </Text>
            <Text style={[type.body, { color: colors.muted }]} selectable>
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
                />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <SnapshotTile icon={DoorOpen} label="Upcoming exits" value={String(tenancySnapshot.upcomingExits)} tone={tenancySnapshot.upcomingExits > 0 ? "danger" : "default"} />
                <View style={{ flex: 1 }} />
              </View>
            </Section>
          ) : (
            <Card>
              <ActivityIndicator color={colors.primary} />
            </Card>
          )}

          <Section eyebrow="Actions" title="Tenancy tools">
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TenancyToolBox icon={UserPlus} label="Create tenancy" onPress={() => router.push("/owner-onboard-tenant")} />
              <TenancyToolBox icon={LogOut} label="Exit requests" onPress={() => router.push("/owner-exit-requests")} />
              <TenancyToolBox icon={ArrowLeftRight} label="Room change" onPress={() => router.push("/owner-room-change-requests")} />
            </View>
          </Section>

          <Section eyebrow="Tenancies" title="Property stays">
            <View style={{ gap: spacing.md }}>
              <TenancyListTabs activeTab={activeTab} onChange={setActiveTab} />

              <SearchField onChangeText={setSearchDraft} placeholder="Search by tenant name, phone or tenancy ID" value={searchDraft} />

              {isLoading && !visiblePage ? (
                <Card>
                  <ActivityIndicator color={colors.primary} />
                </Card>
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
                  eyebrow={committedQuery ? "No matches" : activeTab === "active" ? "No active stay" : "No history"}
                  title={committedQuery ? "No tenancies found" : activeTab === "active" ? "No active tenancies" : "No past tenancies"}
                  description={
                    committedQuery
                      ? "No tenancy matched that tenant name, phone or tenancy ID."
                      : activeTab === "active"
                        ? "Newly onboarded tenants for this property will appear here."
                        : "Completed and inactive tenancies appear here after a stay ends."
                  }
                />
              ) : null}

              {visiblePage?.items.map((tenancy) => {
                const roomLabel = rooms.find((room) => room.id === tenancy.roomId)?.roomNumber ?? null;
                return activeTab === "active" ? (
                  <ActiveTenancyCard key={tenancy.id} onOpen={() => openActiveTenancy(tenancy)} roomLabel={roomLabel} tenancy={tenancy} />
                ) : (
                  <PastTenancyCard key={tenancy.id} roomLabel={roomLabel} tenancy={tenancy} />
                );
              })}

              {visiblePage && visiblePage.totalElements > 0 ? (
                <PaginationBar
                  hasNext={visiblePage.hasNext}
                  hasPrevious={visiblePage.hasPrevious}
                  onNext={() => (activeTab === "active" ? setActivePage((page) => page + 1) : setPastPage((page) => page + 1))}
                  onPrevious={() => (activeTab === "active" ? setActivePage((page) => Math.max(page - 1, 0)) : setPastPage((page) => Math.max(page - 1, 0)))}
                  page={visiblePage.page}
                  totalElements={visiblePage.totalElements}
                  totalPages={visiblePage.totalPages}
                />
              ) : null}
            </View>
          </Section>

        </>
      ) : null}
    </ScreenScrollView>
  );
}

function TenancyToolBox({ icon: Icon, label, onPress }: { icon: typeof UserPlus; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
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
      <Icon color={colors.primary} size={48} strokeWidth={1.8} />
      <Text
        style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 12, fontWeight: "900", lineHeight: 15, textAlign: "center" }}
        numberOfLines={2}
        selectable
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      onPress={onPress}
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 36,
        paddingHorizontal: spacing.sm,
      }}
    >
      <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.4,
        }}
        selectable
      >
        Back
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