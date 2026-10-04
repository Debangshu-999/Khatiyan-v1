import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Image, Text, View, type GestureResponderHandlers, type ImageSourcePropType } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ArrowUpDown, Check, Menu, Pin, X, type LucideProps } from "lucide-react-native";
import { useState, type ComponentType } from "react";

import { PropertyArtwork } from "@/components/artwork-icon";
import { PropertyIcon } from "@/components/property-icon";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SectionWithDropdown } from "@/components/filtered-queue";
import { EmptyState } from "@/components/empty-state";
import { HeaderNote } from "@/components/header-note";
import { MetricTile } from "@/components/metric-tile";
import { ReorderableList } from "@/components/reorderable-list";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerManageMetricsSkeleton, OwnerManagePropertySkeleton } from "@/components/skeletons/owner";
import { visibleOwnerModules, type OwnerModule, type OwnerModuleRoute } from "@/features/owner/owner-modules";
import { useWorkspaceSort } from "@/features/owner/use-workspace-sort";
import {
  WORKSPACE_SORT_OPTIONS,
  pendingByModule,
  sortWorkspaceModules,
  type WorkspaceSortMode,
} from "@/features/owner/workspace-sort";
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
  const visibleModules = visibleOwnerModules(canView, isOwner);
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  // Unassigned + escalated: the two states where a concern is sitting with
  // nobody working it. Anything already taken up is somebody's job and does not
  // belong on a "needs attention" count.
  const dashboardQuery = useGetOwnerDashboardQuery(selectedProperty?.id ?? "", {
    refetchOnMountOrArgChange: true,
    skip: !selectedProperty,
  });
  // What is waiting on the owner in each module. A card shows a dot for it, not
  // a number (user, 2026-10-04), and Dynamic sorts by it. For concerns that is
  // the unassigned queue plus the escalated ones: a concern leaves OPEN the
  // moment someone takes it up, and an escalated one may already be assigned
  // and still needs the owner.
  const pending = dashboardQuery.data ? pendingByModule(dashboardQuery.data) : null;
  // The order of the cards on this tab, chosen beside "Open workspace" (user,
  // 2026-10-04). The shared module list keeps its own order, which Home's
  // pinned tiles and Frequently visited read.
  const workspaceSort = useWorkspaceSort(user?.id ?? null, selectedProperty?.id ?? null, pending);
  const modules = sortWorkspaceModules(
    visibleModules,
    workspaceSort.mode,
    workspaceSort.customOrder,
    workspaceSort.marks,
    selectedProperty?.id ?? null,
  );
  const custom = workspaceSort.mode === "CUSTOM";
  // Custom has two states (user, 2026-10-04). Arranging: the pins give way to
  // bars, the cards are moved by them, and the sort gives way to a tick and a
  // cross. The tick keeps the new order and the cross puts back the one it
  // started from. Either ends it and the pins come back. It starts the first
  // time Custom is chosen, and after that from Change on the Custom row.
  // Holds the order to go back to, for as long as the cards are being arranged.
  const [orderBeforeArranging, setOrderBeforeArranging] = useState<string[] | null>(null);
  const arranging = custom && orderBeforeArranging !== null;

  /** Into Custom with the bars showing. What the cross goes back to is the order in force now. */
  function startArranging() {
    const shown = modules.map((module) => module.key);
    setOrderBeforeArranging(workspaceSort.customOrder.length > 0 ? workspaceSort.customOrder : shown);
    workspaceSort.setMode("CUSTOM", shown);
  }

  function chooseSort(mode: WorkspaceSortMode) {
    // Nothing to put the cards back into yet: Custom opens ready to arrange.
    if (mode === "CUSTOM" && workspaceSort.customOrder.length === 0) {
      startArranging();
      return;
    }
    setOrderBeforeArranging(null);
    workspaceSort.setMode(mode, modules.map((module) => module.key));
  }

  function keepArrangement() {
    setOrderBeforeArranging(null);
  }

  function cancelArrangement() {
    if (orderBeforeArranging) {
      workspaceSort.setCustomOrder(orderBeforeArranging);
    }
    setOrderBeforeArranging(null);
  }

  // Once an order of their own exists, the Custom row offers Change, which
  // opens the arranging again.
  const sortOptions = WORKSPACE_SORT_OPTIONS.map((option) =>
    option.value === "CUSTOM" && workspaceSort.customOrder.length > 0
      ? { ...option, action: { label: "Change", onPress: startArranging } }
      : option,
  );
  // A card is in the hand: the page holds still under it.
  const [dragging, setDragging] = useState(false);

  function renderServiceCard(module: OwnerModule, handle?: GestureResponderHandlers, held = false) {
    return (
      <ServiceCard
        artwork={module.artwork}
        artworkVariant={module.artworkVariant}
        description={module.description}
        handle={handle}
        held={held}
        icon={module.icon}
        key={module.key}
        onPress={() => open(module.route)}
        onTogglePin={() => togglePin(module.key)}
        pending={(pending?.[module.key] ?? 0) > 0}
        pinned={pinnedKeys.includes(module.key)}
        title={module.title}
      />
    );
  }
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
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} scrollEnabled={!dragging} surface={colors.surface}>
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
                {/* "Tenants", in ink (user, 2026-10-04). It was "Tenancies", in green. */}
                <MetricTile icon={TenanciesTileIcon} iconPlacement="side" label="Tenants" value={String(activeTenancies.length)} hint="Active stays" />
                <MetricTile icon={RoomsTileIcon} iconPlacement="side" label="Rooms" value={String(rooms.length)} hint={`${occupiedRooms} occupied`} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {/* The green is here now: rooms to let are the number to act on. "primary" is the tile's green. */}
                <MetricTile icon={VacancyTileIcon} iconPlacement="side" label="Vacancy" value={String(vacantRooms)} hint="Rooms" tone="primary" />
                <MetricTile icon={PropertyTileIcon} iconPlacement="side" label="Property" value={selectedProperty.type} hint={selectedProperty.city ?? "Selected"} />
              </View>
            </>
          ) : null}

          <SectionWithDropdown<WorkspaceSortMode>
            icon={ArrowUpDown}
            onChange={chooseSort}
            options={sortOptions}
            purpose="Sort"
            // While arranging, the sort itself gives way to the tick and the
            // cross: no line of its own above the cards (user, 2026-10-04).
            replacement={arranging ? <ArrangeActions onCancel={cancelArrangement} onKeep={keepArrangement} /> : undefined}
            title="Open workspace"
            value={workspaceSort.mode}
          >
            {arranging ? (
              // The pin gives way to three bars, held and moved to rearrange
              // the cards (user, 2026-10-04).
              <ReorderableList
                gap={spacing.sm}
                items={modules}
                keyOf={(module) => module.key}
                onDraggingChange={setDragging}
                onReorder={(next) => workspaceSort.setCustomOrder(next.map((module) => module.key))}
                renderItem={renderServiceCard}
              />
            ) : (
              <View style={{ gap: spacing.sm }}>{modules.map((module) => renderServiceCard(module))}</View>
            )}
            <Text style={[type.caption, { color: colors.kicker }]}>
              {arranging
                ? "Hold the bars on a service and move it. The tick keeps the order, the cross cancels."
                : 'Tap the pin on a service to add it to "Pinned Services".'}
            </Text>
          </SectionWithDropdown>
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
  description,
  handle,
  held = false,
  icon: Icon,
  onPress,
  onTogglePin,
  pending,
  pinned,
  title,
}: {
  artwork?: ImageSourcePropType;
  artworkVariant?: "compact" | "large" | "wide";
  description: string;
  /**
   * Given while the cards are being arranged by hand: the pin gives way to
   * three bars that carry these handlers, held and moved to rearrange.
   */
  handle?: GestureResponderHandlers;
  /** This card is the one in the hand. */
  held?: boolean;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
  onTogglePin: () => void;
  /** Something is waiting inside this module: a red dot, never a number (user, 2026-10-04). */
  pending: boolean;
  pinned: boolean;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  // Small enough that the words decide the card's height, not the picture
  // (user, 2026-10-04): at its old 82 the artwork was taller than three lines
  // of description, so every card came out the same height whatever it said.
  const artworkFrame = artworkVariant === "wide"
    ? { height: 64, width: 84 }
    : artworkVariant === "large"
      ? { height: 66, width: 66 }
      : { height: 64, width: 64 };
  const artworkImage = artworkVariant === "wide"
    ? { height: 61, width: 83 }
    : artworkVariant === "large"
      ? { height: 65, width: 65 }
      : artworkVariant === "compact"
        ? { height: 55, width: 55 }
        : { height: 61, width: 61 };

  // The pin remains a sibling overlay rather than a nested pressable, keeping
  // the whole module card tappable while preserving a separate pin action.
  return (
    <View>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        style={{
          backgroundColor: colors.surface,
          // The card in the hand is outlined in ink, so it reads as lifted.
          borderColor: held ? colors.ink : colors.borderStrong,
          borderCurve: "continuous",
          // The four tiles' own corner, so the tab reads as one set of cards (user, 2026-10-04). It was 22.
          borderRadius: 12,
          borderWidth: 1,
          elevation: 2,
          // No fixed height: a two-line description makes a shorter card than
          // a three-line one.
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
              {pending ? (
                <View
                  accessibilityLabel="Something is waiting here"
                  accessible
                  style={{ backgroundColor: colors.danger, borderRadius: 999, height: 9, width: 9 }}
                />
              ) : null}
            </View>
            <Text style={[type.description, { color: colors.muted }]}>
              {description}
            </Text>
          </View>
        </View>
      </AnimatedPressable>

      {handle ? (
        // In the pin's own place, and as large a target: held and moved, it
        // carries the card with it.
        <View
          accessibilityHint="Hold and move to rearrange"
          accessibilityLabel={`Move ${title}`}
          {...handle}
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
          <Menu color={colors.ink} size={22} strokeWidth={2.4} />
        </View>
      ) : (
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
      )}
    </View>
  );
}
/**
 * A tick and a cross in one pill with a rule between them (user, 2026-10-04),
 * in the sort's own place while the cards are being arranged. The tick keeps
 * the new order, the cross puts back the old one, and either ends the
 * arranging.
 */
function ArrangeActions({ onCancel, onKeep }: { onCancel: () => void; onKeep: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
      }}
    >
      <AnimatedPressable
        accessibilityLabel="Keep this order"
        accessibilityRole="button"
        hitSlop={6}
        onPress={onKeep}
        style={{ paddingHorizontal: spacing.md, paddingVertical: 6 }}
      >
        <Check color={colors.successText} size={18} strokeWidth={2.8} />
      </AnimatedPressable>
      <View style={{ backgroundColor: colors.borderStrong, height: 18, width: 1 }} />
      <AnimatedPressable
        accessibilityLabel="Cancel rearranging"
        accessibilityRole="button"
        hitSlop={6}
        onPress={onCancel}
        style={{ paddingHorizontal: spacing.md, paddingVertical: 6 }}
      >
        <X color={colors.danger} size={18} strokeWidth={2.8} />
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
