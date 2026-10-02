import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Image, Text, View, type ImageSourcePropType } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pin, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { PropertyArtwork } from "@/components/artwork-icon";
import { PropertyIcon } from "@/components/property-icon";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { HeaderNote } from "@/components/header-note";
import { MetricTile } from "@/components/metric-tile";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { OwnerManageMetricsSkeleton, OwnerManagePropertySkeleton } from "@/components/skeletons/owner";
import { visibleOwnerModules, type OwnerModuleRoute } from "@/features/owner/owner-modules";
import { InServiceIcon, RoomsSummaryIcon } from "@/features/property/room-summary-icons";
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
const PROPERTY_CARD_ART = require("../../assets/images/workspace/property-card.jpg");
// The four tiles under the property card share the Property screen's side-rail
// tile, with every glyph in black (user, 2026-10-02). Rooms and Vacancy reuse
// the Rooms & beds marks so a fact looks the same on both screens.
const TILE_ICON_COLOR = "#000000";
// A touch under the 38pt the side rail draws by default (user, 2026-10-02).
const TILE_ICON_SIZE = 32;
function TenanciesTileIcon(_props: LucideProps) {
  return <MaterialCommunityIcons name="account" color={TILE_ICON_COLOR} size={TILE_ICON_SIZE} />;
}
function RoomsTileIcon(props: LucideProps) {
  return <RoomsSummaryIcon {...props} color={TILE_ICON_COLOR} size={TILE_ICON_SIZE} />;
}
function VacancyTileIcon(props: LucideProps) {
  return <InServiceIcon {...props} color={TILE_ICON_COLOR} size={TILE_ICON_SIZE} />;
}
// The Home tab's own glyph, so the tile names the property the way the tab bar does.
function PropertyTileIcon(_props: LucideProps) {
  return <MaterialCommunityIcons name="home-outline" color={TILE_ICON_COLOR} size={TILE_ICON_SIZE} />;
}

export default function OwnerScreen() {
  const router = useGuardedRouter();
  const dispatch = useAppDispatch();
  const { colors, fonts, isDark, type } = useTheme();
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
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.surfaceRaised,
                borderCurve: "continuous",
                borderRadius: 18,
                elevation: 2,
                flexDirection: "row",
                gap: spacing.md,
                minHeight: 72,
                overflow: "hidden",
                padding: spacing.md,
                shadowColor: colors.shadow,
                shadowOffset: { height: 2, width: 0 },
                shadowOpacity: 1,
                shadowRadius: 6,
              }}
            >
              <Image
                resizeMode="cover"
                source={PROPERTY_CARD_ART}
                style={{ bottom: 0, left: 0, opacity: isDark ? 0.1 : 0.16, position: "absolute", right: 0, top: 0 }}
              />
              <View style={{ alignItems: "center", alignSelf: "flex-start", marginTop: -3, width: 42 }}>
                <PropertyArtwork size={36} />
                <View style={{ height: 18, marginTop: 3, width: 18 }}>
                  <Ionicons color={colors.primary} name="location-sharp" size={18} />
                  <View
                    pointerEvents="none"
                    style={{ backgroundColor: "#FFFFFF", borderRadius: 3, height: 5, left: 6.5, position: "absolute", top: 4, width: 5 }}
                  />
                </View>
              </View>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, lineHeight: 25 }}>
                  {selectedProperty.name}
                </Text>
                <Text numberOfLines={2} style={[type.caption, { color: colors.inkSoft, fontSize: 11 }]}>
                  {[selectedProperty.address, selectedProperty.city, selectedProperty.state, selectedProperty.pincode]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
            </View>
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
                <MetricTile icon={TenanciesTileIcon} iconPlacement="side" label="Tenancies" value={String(activeTenancies.length)} hint="Active stays" tone="primary" />
                <MetricTile icon={RoomsTileIcon} iconPlacement="side" label="Rooms" value={String(rooms.length)} hint={`${occupiedRooms} occupied`} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile icon={VacancyTileIcon} iconPlacement="side" label="Vacancy" value={String(vacantRooms)} hint="Rooms" />
                <MetricTile icon={PropertyTileIcon} iconPlacement="side" label="Property" value={selectedProperty.type} hint={selectedProperty.city ?? "Selected"} />
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
  const activeAccount = useAppSelector((state) => state.account.activeAccount);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.62}
        numberOfLines={1}
        style={[type.brand, { color: colors.ink, fontSize: 30, lineHeight: 36 }]}
      >
        {activeAccount === "manager" ? "Manager" : "Owner"}
        <Text style={[type.brandItalic, { color: colors.accent, fontSize: 30, lineHeight: 36 }]}>
          {" "}Workspace
        </Text>
      </Text>

      <HeaderNote>Find all services for your property in one place. Each service opens its own focused workspace.</HeaderNote>
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
            <Text style={[type.description, { color: colors.muted }]}>
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
