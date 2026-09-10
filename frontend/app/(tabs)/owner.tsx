import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Image, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { BedDouble, DoorOpen, MapPin, Pin, UsersRound, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { PropertyArtwork } from "@/components/artwork-icon";
import { PropertyIcon } from "@/components/property-icon";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { HeaderNote } from "@/components/header-note";
import { MetricTile } from "@/components/metric-tile";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { OwnerManageMetricsSkeleton, OwnerManagePropertySkeleton } from "@/components/skeletons/owner";
import { visibleOwnerModules, type OwnerModuleRoute } from "@/features/owner/owner-modules";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { savePinnedOwnerModulesForUser } from "@/config/app-settings-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { useGetOwnerDashboardQuery } from "@/store/services/dashboard-api";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import { useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The lean that makes a pin read as pressed into a board rather than upright.
 *
 * <p>Applied to a wrapping View, never to the icon itself. A lucide glyph fills
 * its own viewBox edge to edge and the SVG clips to that box, so rotating the
 * SVG shears the pin's tip off. Rotating a plain View around it has nothing to
 * clip against, and behaves the same on web and native.
 */
const PIN_TILT = { transform: [{ rotate: "32deg" }] } as const;
const WORKSPACE_ILLUSTRATION = require("../../assets/workspace/manage-workspace-illustration.png");
export default function OwnerScreen() {
  const router = useGuardedRouter();
  const dispatch = useAppDispatch();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const pinnedKeys = useAppSelector((state) => state.ownerPins.pinnedKeys);
  const user = useAppSelector((state) => state.auth.user);

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
  const { canView, owner: isOwner } = usePropertyPermissions(selectedProperty?.id);
  // Sections a manager has no access to are removed, not disabled — a greyed
  // card invites a tap and explains nothing.
  const modules = visibleOwnerModules(canView, isOwner);
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  // Unassigned + escalated: the two states where a concern is sitting with
  // nobody working it. Anything already taken up is somebody's job and does not
  // belong on a "needs attention" count.
  const dashboardQuery = useGetOwnerDashboardQuery(selectedProperty?.id ?? "", {
    refetchOnMountOrArgChange: true,
    skip: !selectedProperty,
  });
  // `open` is the unassigned queue — a concern leaves OPEN the moment someone
  // takes it up. `escalated` is counted separately because an escalated concern
  // may already be assigned and still needs the owner.
  const concernAttention =
    (dashboardQuery.data?.concerns?.open ?? 0) + (dashboardQuery.data?.concerns?.escalated ?? 0);
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: false, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );

  function open(route: OwnerModuleRoute) {
    router.push(route as never);
  }

  const rooms = roomsQuery.data ?? [];
  const activeTenancies = tenanciesQuery.data ?? [];
  // Either source still arriving means the tiles have nothing true to show.
  const tilesLoading =
    (roomsQuery.isFetching && !roomsQuery.data) ||
    (tenanciesQuery.isFetching && !tenanciesQuery.data);
  const occupiedRooms = rooms.filter((room) => room.occupiedCount > 0).length;
  const vacantRooms = rooms.filter((room) => room.availableVacancies > 0).length;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} surface={colors.surface}>
      <ManageHeader />

      {/* Header and workspace actions are static. The property summary and
          figures below are the only pieces waiting on the API. */}
      {propertiesQuery.isFetching && properties.length === 0 ? (
        <OwnerManagePropertySkeleton />
      ) : null}

      {!propertiesQuery.isFetching && properties.length === 0 ? (
        <EmptyState
          icon={PropertyIcon}
          title="Create a property first"
          description="Owner services unlock after at least one property exists."
        />
      ) : null}

      {properties.length > 0 ? (
        <>
          {selectedProperty ? (
            <Card>
              <View style={{ gap: spacing.sm }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                  <PropertyArtwork size={24} />
                  <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 22, lineHeight: 27 }]}>
                    {selectedProperty.name}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ alignItems: "center", paddingTop: 2, width: 24 }}>
                    <MapPin color={colors.muted} size={18} strokeWidth={1.9} />
                  </View>
                  <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
                    {[selectedProperty.address, selectedProperty.city, selectedProperty.state, selectedProperty.pincode]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                </View>
              </View>
            </Card>
          ) : (
            <EmptyState
              icon={PropertyIcon}
              title="Select a property from Home"
              description="You own multiple properties. Pick the active property on Home before opening owner services."
            />
          )}

          {/* The tiles read from the rooms and tenancies queries, not from the
              properties one that gates the screen — so on a warm property cache
              they rendered four zeros while their own data was still in flight.
              Their ghost belongs to THEIR load. */}
          {selectedProperty && tilesLoading ? <OwnerManageMetricsSkeleton /> : null}

          {selectedProperty && !tilesLoading ? (
            <>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile icon={UsersRound} iconTone="success" label="Tenancies" value={String(activeTenancies.length)} hint="Active stays" tone="primary" />
                <MetricTile icon={BedDouble} iconTone="primary" label="Rooms" value={String(rooms.length)} hint={`${occupiedRooms} occupied`} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile icon={DoorOpen} iconTone="violet" label="Vacancy" value={String(vacantRooms)} hint="Rooms with space" />
                <MetricTile icon={MapPin} iconTone="primary" label="Property" value={selectedProperty.type} hint={selectedProperty.city ?? "Selected"} />
              </View>
            </>
          ) : null}

          <Section title="Open workspace">
            <View style={{ gap: spacing.sm }}>
              {modules.map((module) => (
                <ServiceCard
                  key={module.key}
                  badge={module.key === "concern" ? concernAttention : undefined}
                  artwork={module.artwork}
                  artworkVariant={module.artworkVariant}
                  icon={module.icon}
                  title={module.title}
                  description={module.description}
                  pinned={pinnedKeys.includes(module.key)}
                  onPress={() => open(module.route)}
                  onTogglePin={() => togglePin(module.key)}
                />
              ))}
            </View>
            <Text style={[type.caption, { color: colors.kicker }]}>
              Tap the pin on a service to add it to "Frequently visited" on Home.
            </Text>
          </Section>
        </>
      ) : null}
    </ScreenScrollView>
  );
}

function ManageHeader() {
  const { colors, type } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 390;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.62}
        numberOfLines={1}
        style={[type.brand, { color: colors.ink, fontSize: 30, lineHeight: 36 }]}
      >
        Property
        <Text style={[type.brandItalic, { color: colors.accent, fontSize: 30, lineHeight: 36 }]}>
          {" "}workspace.
        </Text>
      </Text>

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <HeaderNote>Use Home to choose the active property. Each service opens its own focused workspace.</HeaderNote>
        </View>
        <View style={{ height: compact ? 76 : 94, width: compact ? 112 : 148 }}>
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            resizeMode="contain"
            source={WORKSPACE_ILLUSTRATION}
            style={{ height: "100%", width: "100%" }}
          />
        </View>
      </View>
    </View>
  );
}
function ServiceCard({
  artwork,
  artworkVariant,
  badge,
  description,
  icon: Icon,
  onPress,
  onTogglePin,
  pinned,
  title,
}: {
  artwork?: ImageSourcePropType;
  artworkVariant?: "compact" | "large" | "wide";
  /** Work waiting inside this module. Hidden at zero. */
  badge?: number;
  description: string;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
  onTogglePin: () => void;
  pinned: boolean;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  const artworkFrame = artworkVariant === "wide"
    ? { height: 82, width: 108 }
    : artworkVariant === "large"
      ? { height: 86, width: 86 }
      : { height: 82, width: 82 };
  const artworkImage = artworkVariant === "wide"
    ? { height: 78, width: 106 }
    : artworkVariant === "large"
      ? { height: 84, width: 84 }
      : artworkVariant === "compact"
        ? { height: 70, width: 70 }
        : { height: 78, width: 78 };

  // The pin remains a sibling overlay rather than a nested pressable, keeping
  // the whole module card tappable while preserving a separate pin action.
  return (
    <View>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 22,
          borderWidth: 1,
          elevation: 2,
          minHeight: 116,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          shadowColor: colors.shadow,
          shadowOffset: { height: 4, width: 0 },
          shadowOpacity: 0.7,
          shadowRadius: 11,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: artwork ? "transparent" : colors.primarySoft,
              borderRadius: 999,
              justifyContent: "center",
              overflow: "hidden",
              ...artworkFrame,
            }}
          >
            {artwork ? (
              <Image
                accessibilityIgnoresInvertColors
                accessible={false}
                resizeMode="contain"
                source={artwork}
                style={artworkImage}
              />
            ) : (
              <Icon color={colors.ink} size={32} strokeWidth={1.75} />
            )}
          </View>

          <View style={{ flex: 1, gap: spacing.xs, paddingRight: 34 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  fontSize: 20,
                  lineHeight: 25,
                }}
              >
                {title}
              </Text>
              {badge && badge > 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.danger,
                    borderRadius: 999,
                    justifyContent: "center",
                    minWidth: 22,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 12 }}>
                    {badge > 99 ? "99+" : badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[type.body, { color: colors.muted, fontSize: 14, lineHeight: 21 }]}>
              {description}
            </Text>
          </View>
        </View>
      </AnimatedPressable>

      <AnimatedPressable
        accessibilityLabel={pinned ? `Unpin ${title}` : `Pin ${title}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onTogglePin}
        style={{
          alignItems: "center",
          height: 44,
          justifyContent: "center",
          marginTop: -22,
          position: "absolute",
          right: spacing.sm,
          top: "50%",
          width: 44,
        }}
      >
        <View style={PIN_TILT}>
          <Pin
            color={colors.primary}
            fill={pinned ? colors.primary : "transparent"}
            size={21}
            strokeWidth={2.1}
          />
        </View>
      </AnimatedPressable>
    </View>
  );
}
function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }

  return properties.length === 1 ? properties[0] : null;
}
