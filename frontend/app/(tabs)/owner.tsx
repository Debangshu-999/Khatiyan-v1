import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import {
  AlertCircle,
  Banknote,
  Bell,
  Building2,
  ClipboardList,
  Compass,
  KeyRound,
  Megaphone,
  UsersRound,
  Wrench,
  type LucideProps,
} from "lucide-react-native";
import type { ComponentType } from "react";

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

type ServiceRoute =
  | "/owner-tenancy"
  | "/owner-billing"
  | "/owner-property"
  | {
      pathname: "/owner-service-placeholder";
      params: { service: string; title: string };
    };

export default function OwnerScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const userRole = useAppSelector((state) => state.auth.user?.role);
  const workspaceRole = userRole === "OWNER" ? "Owner" : "Manager";
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: false, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );

  function open(route: ServiceRoute) {
    router.push(route as never);
  }

  const rooms = roomsQuery.data ?? [];
  const activeTenancies = tenanciesQuery.data ?? [];
  const occupiedRooms = rooms.filter((room) => room.occupiedCount > 0).length;
  const vacantRooms = rooms.filter((room) => room.availableVacancies > 0).length;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow={`${workspaceRole} workspace`}
        title="Portfolio"
        italicTail="overview."
        subtitle="Use Home to choose the active property. Each service opens its own focused workspace."
      />

      {propertiesQuery.isFetching && properties.length === 0 ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : null}

      {!propertiesQuery.isFetching && properties.length === 0 ? (
        <EmptyState
          icon={Building2}
          eyebrow="No property"
          title="Create a property first"
          description="Owner services unlock after at least one property exists."
        />
      ) : null}

      {properties.length > 0 ? (
        <>
          {selectedProperty ? (
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
          ) : (
            <EmptyState
              icon={Building2}
              eyebrow="Property required"
              title="Select a property from Home"
              description="You own multiple properties. Pick the active property on Home before opening owner services."
            />
          )}

          {selectedProperty ? (
            <>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile label="Tenancies" value={String(activeTenancies.length)} hint="Active stays" tone="primary" />
                <MetricTile label="Rooms" value={String(rooms.length)} hint={`${occupiedRooms} occupied`} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile label="Vacancy" value={String(vacantRooms)} hint="Rooms with space" />
                <MetricTile label="Property" value={selectedProperty.type} hint={selectedProperty.city ?? "Selected"} />
              </View>
            </>
          ) : null}

          <Section eyebrow="Services" title="Open workspace">
            <View style={{ gap: spacing.sm }}>
              <ServiceCard
                icon={UsersRound}
                title="Tenancy"
                description="Create tenancies, view active stays, review exits and handle room-change requests."
                onPress={() => open("/owner-tenancy")}
              />
              <ServiceCard
                icon={Banknote}
                title="Billing"
                description="Billing cycles, overdue dues, line items, deposit ledger and payment status."
                onPress={() => open("/owner-billing")}
              />
              <ServiceCard
                icon={Megaphone}
                title="Notice"
                description="Property board, visible notices, recurring notices and archive controls."
                onPress={() =>
                  open({
                    pathname: "/owner-service-placeholder",
                    params: { service: "notices", title: "Notice" },
                  })
                }
              />
              <ServiceCard
                icon={AlertCircle}
                title="Concern"
                description="Available, under review, undertaken, escalated and history views."
                onPress={() =>
                  open({
                    pathname: "/owner-service-placeholder",
                    params: { service: "concerns", title: "Concern" },
                  })
                }
              />
              <ServiceCard
                icon={Compass}
                title="Discovery"
                description="Listing visibility, description, photos and owner-curated local places."
                onPress={() =>
                  open({
                    pathname: "/owner-service-placeholder",
                    params: { service: "discovery", title: "Discovery" },
                  })
                }
              />
              <ServiceCard
                icon={Wrench}
                title="Property"
                description="Property settings, room inventory (single & bulk), facilities, board and manager assignments."
                onPress={() => open("/owner-property")}
              />
              <ServiceCard
                icon={Bell}
                title="Notifications"
                description="Owner-side operational alerts and pending action summaries."
                onPress={() =>
                  open({
                    pathname: "/owner-service-placeholder",
                    params: { service: "notifications", title: "Notifications" },
                  })
                }
              />
            </View>
          </Section>

          <Section eyebrow="Remaining work" title="Mobile owner modules">
            <Card tone="sunken">
              <Text style={[type.body, { color: colors.muted }]} selectable>
                Tenancy now has its own workspace. Billing, notice, concern, discovery, property and notifications are
                separated as service entries and can be expanded one by one.
              </Text>
            </Card>
          </Section>
        </>
      ) : null}
    </ScreenScrollView>
  );
}

function ServiceCard({
  description,
  icon: Icon,
  onPress,
  title,
}: {
  description: string;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        padding: spacing.lg,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.primarySoft,
            borderRadius: 12,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Icon color={colors.primary} size={20} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 19,
              fontWeight: "500",
              lineHeight: 24,
            }}
            selectable
          >
            {title}
          </Text>
          <Text style={[type.body, { color: colors.muted }]} selectable>
            {description}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }

  return properties.length === 1 ? properties[0] : null;
}
