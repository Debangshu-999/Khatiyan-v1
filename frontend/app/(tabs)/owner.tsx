import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Building2, Pin, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
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
  const occupiedRooms = rooms.filter((room) => room.occupiedCount > 0).length;
  const vacantRooms = rooms.filter((room) => room.availableVacancies > 0).length;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        // eyebrow={`${workspaceRole} workspace`}
        title="Property"
        italicTail="workspace."
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
              {modules.map((module) => (
                <ServiceCard
                  key={module.key}
                  badge={module.key === "concern" ? concernAttention : undefined}
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

function ServiceCard({
  badge,
  description,
  icon: Icon,
  onPress,
  onTogglePin,
  pinned,
  title,
}: {
  /** Work waiting inside this module. Hidden at zero. */
  badge?: number;
  description: string;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
  onTogglePin: () => void;
  pinned: boolean;
  title: string;
}) {
  const { colors, fonts, isDark, type } = useTheme();

  // The pin is a SIBLING overlay, not a child of the card press target. Nesting
  // one pressable inside another renders <button> inside <button> on web, which
  // is invalid HTML and warns on every render. Overlaying keeps the whole card
  // tappable while leaving the two targets independent.
  return (
    <View>
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
            borderColor: colors.ink,
            borderWidth: 1,
            borderRadius: 12,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Icon color={colors.ink} size={20} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 19,
              lineHeight: 24,
            }}
          >
            {title}
          </Text>
          {/* Beside the title, not on the icon: it qualifies the module by name,
              and a count on the glyph would fight the outlined-icon rule. */}
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
          <Text style={[type.body, { color: colors.muted }]}>
            {description}
          </Text>
        </View>
        {/* Reserves the space the overlaid pin occupies so the description
            never runs underneath it. */}
        <View style={{ height: 36, width: 36 }} />
      </View>
      </AnimatedPressable>

      <AnimatedPressable
        accessibilityLabel={pinned ? `Unpin ${title}` : `Pin ${title}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onTogglePin}
        // No tile behind the glyph. A tinted square in the corner of every card
        // read as a status badge on the card rather than a control, and the
        // pinned state was carried by a wash so faint it needed comparing
        // against a neighbour to see. The glyph itself now holds the state.
        // Room for the glyph to lean into. A rotated icon needs more square
        // than its upright size suggests — the corners of an 18px pin swing
        // outside an 18px box — and the box doubles as the tap target.
        style={{
          alignItems: "center",
          height: 44,
          justifyContent: "center",
          position: "absolute",
          right: spacing.md,
          top: spacing.md,
          width: 44,
        }}
      >
        {/* One pin, two states: filled when pinned, outlined when not. This
            used to swap to PinOff for the unpinned state, whose slash turns
            into an unreadable squiggle at 18px once tilted — the icon stopped
            looking like a pin at all. Fill alone carries the state, and the
            shape stays constant so the control is recognisable either way.

            The lean is what makes it read as pressed into a board; upright, a
            pin glyph reads as a location marker. */}
        <View style={PIN_TILT}>
          <Pin
            color={pinned ? colors.primary : colors.kicker}
            fill={pinned ? colors.primary : "transparent"}
            size={18}
            strokeWidth={2}
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
