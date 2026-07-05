import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Building2, Pin, PinOff, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { OWNER_MODULES, type OwnerModuleRoute } from "@/features/owner/owner-modules";
import { savePinnedOwnerModulesForUser } from "@/config/app-settings-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import { useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerScreen() {
  const router = useGuardedRouter();
  const dispatch = useAppDispatch();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const pinnedKeys = useAppSelector((state) => state.ownerPins.pinnedKeys);
  const user = useAppSelector((state) => state.auth.user);
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const workspaceRole = activeAccount === "manager" ? "Manager" : "Owner";

  function togglePin(key: string) {
    const next = pinnedKeys.includes(key) ? pinnedKeys.filter((pinned) => pinned !== key) : [...pinnedKeys, key];
    dispatch(setPinnedOwnerModules(next));
    if (user?.id) {
      void savePinnedOwnerModulesForUser(user.id, next);
    }
  }
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: false, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );

  function open(route: OwnerModuleRoute) {
    router.push(route as never);
  }

  const rooms = roomsQuery.data ?? [];
  const activeTenancies = tenanciesQuery.data ?? [];
  const occupiedRooms = rooms.filter((room) => room.occupiedCount > 0).length;
  const vacantRooms = rooms.filter((room) => room.availableVacancies > 0).length;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        // eyebrow={`${workspaceRole} workspace`}
        title="Portfolio"
        italicTail="overview."
        subtitle="Use Home to choose the active property. Each service opens its own focused workspace."
      />

      {propertiesQuery.isFetching && properties.length === 0 ? (
        <SkeletonCard />
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
              {OWNER_MODULES.map((module) => (
                <ServiceCard
                  key={module.key}
                  icon={module.icon}
                  title={module.title}
                  description={module.description}
                  pinned={pinnedKeys.includes(module.key)}
                  onPress={() => open(module.route)}
                  onTogglePin={() => togglePin(module.key)}
                />
              ))}
            </View>
            <Text style={[type.caption, { color: colors.kicker }]} selectable>
              Tap the pin on a service to add it to "Frequently visited" on Home.
            </Text>
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
  onTogglePin,
  pinned,
  title,
}: {
  description: string;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
  onTogglePin: () => void;
  pinned: boolean;
  title: string;
}) {
  const { colors, fonts, isDark, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 20,
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
        <AnimatedPressable
          accessibilityLabel={pinned ? `Unpin ${title}` : `Pin ${title}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onTogglePin}
          style={{
            alignItems: "center",
            backgroundColor: pinned ? colors.primarySoft : colors.surfaceSunken,
            borderColor: pinned ? colors.primary : colors.border,
            borderRadius: 10,
            borderWidth: 1,
            height: 36,
            justifyContent: "center",
            width: 36,
          }}
        >
          {pinned ? (
            <Pin color={colors.primary} size={16} strokeWidth={2.2} />
          ) : (
            <PinOff color={colors.kicker} size={16} strokeWidth={2.2} />
          )}
        </AnimatedPressable>
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
