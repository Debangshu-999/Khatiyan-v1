import { LoadFailedScreen, loadFailure } from "@/components/load-failed";
import type { ModuleArt } from "@/features/owner/workspace-module-icons";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Image, Text, View, type GestureResponderHandlers, type ImageSourcePropType } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ArrowUpDown, Check, ChevronRight, LayoutGrid, Lightbulb, List, Menu, Pin, X, type LucideProps } from "lucide-react-native";
import { useState, type ComponentType, type ReactNode } from "react";

import { PropertyIcon } from "@/components/property-icon";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SectionWithDropdown } from "@/components/filtered-queue";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ReorderableList } from "@/components/reorderable-list";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerManageMetricsSkeleton } from "@/components/skeletons/owner";
import { visibleOwnerModules, type OwnerModule, type OwnerModuleKey, type OwnerModuleRoute } from "@/features/owner/owner-modules";
import { useWorkspaceSort } from "@/features/owner/use-workspace-sort";
import {
  WORKSPACE_SORT_OPTIONS,
  pendingByModule,
  groupWorkspaceModules,
  mergeWorkspaceCategoryOrder,
  type WorkspaceSortMode,
  type WorkspaceViewMode,
} from "@/features/owner/workspace-sort";
import { InServiceIcon, RoomsSummaryIcon } from "@/features/property/room-summary-icons";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { savePinnedOwnerModulesForUser } from "@/config/app-settings-storage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { useGetOwnerDashboardQuery } from "@/store/services/dashboard-api";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import { useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { softShadow } from "@/theme/shadows";
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
const SERVICE_SUMMARIES: Record<OwnerModuleKey, string> = {
  billing: "Bills, deposits & payments",
  concern: "Tenant issues & resolutions",
  food: "Menus, plans & plate counts",
  notice: "Posts, schedules & repeats",
  property: "Rooms, listing & facilities",
  staff: "Team, roles & salaries",
  tenancy: "Move-ins, agreements & exits",
};
// The four tiles under the header share the Property screen's side-rail
// tile, with every glyph in black (user, 2026-10-02). Rooms and Vacancy reuse
// the Rooms & beds marks so a fact looks the same on both screens.

export default function OwnerScreen() {
  const router = useGuardedRouter();
  const dispatch = useAppDispatch();
  const { colors, fonts, type } = useTheme();
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
  const grid = workspaceSort.view === "grid";
  const categories = groupWorkspaceModules(
    visibleModules,
    grid ? "AZ" : workspaceSort.mode,
    workspaceSort.customOrder,
    workspaceSort.marks,
    selectedProperty?.id ?? null,
  );
  const modules = categories.flatMap((category) => category.modules);
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

  function renderServiceCard(module: OwnerModule, handle?: GestureResponderHandlers, held = false, divider = false) {
    return (
      <ServiceCard
        art={module.art}
        artwork={module.artwork}
        artworkVariant={module.artworkVariant}
        description={SERVICE_SUMMARIES[module.key]}
        divider={divider}
        handle={handle}
        held={held}
        icon={module.icon}
        key={module.key}
        layout={workspaceSort.view}
        onPress={() => open(module.route)}
        onTogglePin={() => togglePin(module.key)}
        pending={(pending?.[module.key] ?? 0) > 0}
        pinned={pinnedKeys.includes(module.key)}
        title={module.title}
      />
    );
  }

  function open(route: OwnerModuleRoute) {
    router.push(route as never);
  }


  const loadFailed = loadFailure(propertiesQuery, dashboardQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} scrollEnabled={!dragging} surface={colors.surface}>
      <ManageHeader />

      {!propertiesQuery.isFetching && properties.length === 0 ? (
        <EmptyState
          icon={PropertyIcon}
          title="Create a property first"
          description="Owner services unlock after at least one property exists."
        />
      ) : null}

      {properties.length > 0 ? (
        <>
          {!selectedProperty ? (
            <EmptyState
              icon={PropertyIcon}
              title="Select a property from Home"
              description="You own multiple properties. Pick the active property on Home before opening owner services."
            />
          ) : null}

          {/* No count cards, no "Open workspace" subheading (user, 2026-11-14): the
              screen is the list, its sort and view right under the header. */}
          <SectionWithDropdown<WorkspaceSortMode>
            // The sort and view pills on their own line under the header, at the right (user, 2026-11-14).
            header={(controls) => <View style={{ alignItems: "flex-end", marginBottom: -spacing.xs, marginTop: -spacing.lg }}>{controls}</View>}
            beforeFilter={!grid ? <WorkspaceViewToggle disabled={arranging} onChange={workspaceSort.setView} value={workspaceSort.view} /> : undefined}
            icon={ArrowUpDown}
            onChange={chooseSort}
            options={sortOptions}
            purpose="Sort"
            // While arranging, the sort itself gives way to the tick and the
            // cross: no line of its own above the cards (user, 2026-10-04).
            replacement={grid
              ? <WorkspaceViewToggle onChange={workspaceSort.setView} value={workspaceSort.view} />
              : arranging ? <ArrangeActions onCancel={cancelArrangement} onKeep={keepArrangement} /> : undefined}
            title="Open workspace"
            value={workspaceSort.mode}
          >
            <View style={{ gap: spacing.xl }}>
              {categories.map((category) => (
                <View key={category.key} style={{ gap: spacing.sm }}>
                  {grid ? <Text accessibilityRole="header" style={[type.label, { color: colors.muted }]}>{category.title}</Text> : null}
                  {grid ? (
                    <WorkspaceServiceGrid modules={category.modules} renderItem={(module) => renderServiceCard(module)} />
                  ) : (
                    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, ...softShadow(colors.shadow, 3, 10, 0.7) }}>
                      {/* The category names its card, a line under it (user, 2026-11-14). */}
                      <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15.5, paddingBottom: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm }}>
                        {category.title}
                      </Text>
                      <View style={{ backgroundColor: colors.border, height: 1, marginHorizontal: -spacing.xs }} />
                      {arranging ? (
                        <ReorderableList
                          gap={0}
                          items={category.modules}
                          keyOf={(module) => module.key}
                          onDraggingChange={setDragging}
                          onReorder={(next) => workspaceSort.setCustomOrder(mergeWorkspaceCategoryOrder(
                            workspaceSort.customOrder,
                            modules.map((module) => module.key),
                            next.map((module) => module.key),
                          ))}
                          renderItem={(module, handle, held) => renderServiceCard(module, handle, held, module.key !== category.modules.at(-1)?.key)}
                        />
                      ) : category.modules.map((module, index) => renderServiceCard(module, undefined, false, index < category.modules.length - 1))}
                    </View>
                  )}
                </View>
              ))}
            </View>
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.xxs }}>
              {!arranging ? <Lightbulb color={colors.kicker} size={17} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} /> : null}
              <Text style={[type.caption, { color: colors.kicker, flex: 1 }]}>
                {arranging
                  ? "Hold the bars to move a service within its category. The tick keeps the order, the cross cancels."
                  : "Pin a service to keep it on Home."}
              </Text>
            </View>
          </SectionWithDropdown>
        </>
      ) : null}
    </ScreenScrollView>
  );
}

function ManageHeader({ trailing }: { trailing?: ReactNode }) {
  const activeAccount = useAppSelector((state) => state.account.activeAccount);

  return (
    <ScreenHeader
      italicTail="Workspace"
      trailing={trailing}
      subtitle="Find all services for your property in one place. Each service opens its own focused workspace."
      title={activeAccount === "manager" ? "Manager" : "Owner"}
    />
  );
}

function WorkspaceViewToggle({ disabled = false, onChange, value }: {
  disabled?: boolean;
  onChange: (view: WorkspaceViewMode) => void;
  value: WorkspaceViewMode;
}) {
  const { colors } = useTheme();
  const Icon = value === "list" ? LayoutGrid : List;
  return (
    <AnimatedPressable
      accessibilityLabel={value === "list" ? "Switch to grid view" : "Switch to list view"}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onChange(value === "list" ? "grid" : "list")}
      // White with the search bar's edge, no grey fill (user, 2026-11-14).
      style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: `${colors.ink}40`, borderRadius: 999, borderWidth: 1, height: 32, justifyContent: "center", opacity: disabled ? 0.45 : 1, width: 32 }}
    >
      <Icon color={colors.ink} size={16} strokeWidth={2.1} />
    </AnimatedPressable>
  );
}

/** Fixed two-column rows: an odd last service never grows across the empty right column. */
function WorkspaceServiceGrid({ modules, renderItem }: { modules: OwnerModule[]; renderItem: (module: OwnerModule) => ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: Math.ceil(modules.length / 2) }, (_, row) => (
        <View key={row} style={{ alignItems: "stretch", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>{renderItem(modules[row * 2])}</View>
          {modules[row * 2 + 1] ? (
            <View style={{ flex: 1, minWidth: 0 }}>{renderItem(modules[row * 2 + 1])}</View>
          ) : <View accessible={false} pointerEvents="none" style={{ flex: 1, minWidth: 0 }} />}
        </View>
      ))}
    </View>
  );
}

function ServiceCard({
  art: Art,
  artwork,
  artworkVariant,
  description,
  divider = false,
  handle,
  held = false,
  icon: Icon,
  layout = "list",
  onPress,
  onTogglePin,
  pending,
  pinned,
  title,
}: {
  art?: ModuleArt;
  artwork?: ImageSourcePropType;
  artworkVariant?: "compact" | "large" | "wide";
  /** One short line under the title, kept narrow (user, 2026-10-28). */
  description: string;
  divider?: boolean;
  layout?: WorkspaceViewMode;
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
  const grid = layout === "grid";
  const artworkFrame = artworkVariant === "wide"
    ? { height: 48, width: 62 }
    : { height: 48, width: 48 };
  const artworkImage = artworkVariant === "wide"
    ? { height: 46, width: 60 }
    : artworkVariant === "compact"
      ? { height: 42, width: 42 }
      : { height: 46, width: 46 };

  // The pin remains a sibling overlay rather than a nested pressable, keeping
  // the whole module card tappable while preserving a separate pin action.
  return (
    <View style={{ flex: grid ? 1 : undefined, minWidth: 0 }}>
      <AnimatedPressable
        accessibilityLabel={`Open ${title}`}
        accessibilityRole="button"
        onPress={onPress}
        style={{
          backgroundColor: colors.surface,
          borderColor: held ? colors.ink : grid ? colors.border : "transparent",
          borderCurve: "continuous",
          borderRadius: grid ? 14 : 10,
          borderWidth: held || grid ? 1 : 0,
          flex: grid ? 1 : undefined,
          minHeight: grid ? 150 : 80,
          paddingHorizontal: grid ? spacing.md : spacing.sm,
          paddingVertical: spacing.md,
          ...(grid || held ? softShadow(colors.shadow, 2, 6, 0.7) : {}),
        }}
      >
        <View style={grid ? { gap: spacing.sm } : { alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: Art || artwork ? "transparent" : colors.primarySoft,
              borderRadius: 999,
              justifyContent: "center",
              // Only a picture is clipped round: a vector drawing inside a clipping
              // round view drew nothing on Android (user, 2026-11-14).
              overflow: Art ? "visible" : "hidden",
              flexShrink: 0,
              ...artworkFrame,
            }}
          >
            {Art ? (
              <Art size={artworkImage.height} />
            ) : artwork ? (
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

          <View style={{ flex: grid ? undefined : 1, gap: grid ? spacing.xs : 3, minWidth: 0, paddingRight: grid ? 0 : 40 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  flexShrink: 1,
                  fontSize: grid ? 16 : 17,
                  lineHeight: 22,
                }}
              >
                {title}
              </Text>
              {pending ? (
                <View
                  accessibilityLabel="Something is waiting here"
                  accessible
                  style={{ backgroundColor: colors.danger, borderRadius: 999, flexShrink: 0, height: 8, width: 8 }}
                />
              ) : null}
            </View>
            <Text numberOfLines={2} style={[type.description, { color: colors.muted, fontFamily: fonts.sansMedium, lineHeight: 17 }]}>
              {description}
            </Text>
          </View>
          {!grid ? <ChevronRight color={colors.kicker} size={18} strokeWidth={2} style={{ flexShrink: 0 }} /> : null}
        </View>
      </AnimatedPressable>

      {divider && !grid ? <View pointerEvents="none" style={{ backgroundColor: colors.border, height: 1, marginHorizontal: spacing.sm }} /> : null}

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
            right: 24,
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
            marginTop: grid ? 0 : -22,
            position: "absolute",
            right: grid ? spacing.xxs : 24,
            top: grid ? spacing.xs : "50%",
            width: 44,
          }}
        >
          <View style={{ alignItems: "center", backgroundColor: grid ? "transparent" : colors.surfaceSunken, borderRadius: 999, height: 32, justifyContent: "center", width: 32 }}>
            <View style={PIN_TILT}>
              <Pin
                color={colors.primary}
                fill={pinned ? colors.primary : "transparent"}
                size={18}
                strokeWidth={2.1}
              />
            </View>
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
