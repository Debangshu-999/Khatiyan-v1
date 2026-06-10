import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { ArrowLeft, DoorOpen, KeyRound, Repeat2, UsersRound } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import { useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerTenancyWorkspaceScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: false, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );

  const rooms = roomsQuery.data ?? [];
  const tenancies = tenanciesQuery.data ?? [];
  const vacancyCount = rooms.filter((room) => room.availableVacancies > 0).length;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />

      <ScreenHeader
        eyebrow="Tenancy"
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

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Active" value={String(tenancies.length)} hint="Tenancies" tone="primary" />
            <MetricTile label="Vacancy" value={String(vacancyCount)} hint="Rooms with space" />
          </View>

          <Section eyebrow="Actions" title="Tenancy tools">
            <View style={{ gap: spacing.sm }}>
              <ActionCard
                meta="Create"
                title="Create tenancy"
                description="Provision a tenant, choose a room, snapshot rent/deposit and start billing."
                onPress={() => router.push("/owner-onboard-tenant")}
                tone="primary"
              />
              <ActionCard
                meta="View"
                title="Active tenancies"
                description="See all currently active stays for the selected property."
                onPress={() => router.push("/owner-active-tenancies")}
              />
              <ActionCard
                meta="Exit"
                title="Exit requests"
                description="Review tenant exit requests, approve with checkout date and deposit settlement, or reject."
                onPress={() => router.push("/owner-exit-requests")}
              />
              <ActionCard
                meta="Room change"
                title="Room-change requests"
                description="Review tenant room movement requests and approve or reject the scheduled transfer."
                onPress={() => router.push("/owner-room-change-requests")}
              />
            </View>
          </Section>

          <Section eyebrow="Current snapshot" title="Tenancy state">
            <View style={{ gap: spacing.sm }}>
              {tenanciesQuery.isFetching ? (
                <Card>
                  <ActivityIndicator color={colors.primary} />
                </Card>
              ) : tenancies.length > 0 ? (
                tenancies.slice(0, 3).map((tenancy) => (
                  <Card key={tenancy.id} tone="sunken">
                    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
                      <View
                        style={{
                          alignItems: "center",
                          backgroundColor: colors.primarySoft,
                          borderRadius: 12,
                          height: 40,
                          justifyContent: "center",
                          width: 40,
                        }}
                      >
                        <DoorOpen color={colors.primary} size={19} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
                          {tenancy.referenceCode}
                        </Text>
                        <Text style={[type.caption, { color: colors.muted }]} selectable>
                          {humanizeToken(tenancy.billingType)} · started {tenancy.startDate}
                        </Text>
                      </View>
                    </View>
                  </Card>
                ))
              ) : (
                <EmptyState
                  icon={KeyRound}
                  eyebrow="No active tenancy"
                  title="No active stays yet"
                  description="Create a tenancy to start filling this workspace."
                />
              )}
            </View>
          </Section>
        </>
      ) : null}
    </ScreenScrollView>
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

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
