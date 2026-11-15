import { useState, type ReactNode } from "react";
import { Image, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { ClipboardCheck, FileSignature, MapPin, Utensils, Wrench } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FitText } from "@/components/fit-text";
import { StayOutIcon } from "@/components/stay-out-icon";
import { GoldenKeyIcon } from "@/components/golden-key-icon";
import { PlateIcon, RedPinIcon } from "@/components/tool-art-icons";
import { AgreementDrawing } from "./stay-overview-cards";
import { DamageRecordIcon } from "@/components/damage-record-icon";
import { RequestDeskIcon } from "@/components/request-desk-icon";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import { useGetMyFoodAvailabilityQuery } from "@/store/services/food-api";
import { useGetMyStayOutsQuery } from "@/store/services/stay-out-api";
import { useGetMoveInChecklistQuery, useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { CONCERNS_ARTWORK, DEPOSIT_ARTWORK } from "./tenant-tool-cards";

/** The owner's Billing drawing, so a bill looks the same on both sides (user, 2026-11-10). */
const BILLING_ARTWORK = require("../../../assets/images/workspace/billing-module.png");
const ENQUIRIES_ARTWORK = require("../../../assets/empty-states/enquiries.png");
const VISITS_ARTWORK = require("../../../assets/images/workspace/manage_visits.png");
const BOOKINGS_ARTWORK = require("../../../assets/icons/home-tools/bookings.png");

export type TenancyTool = {
  key: string;
  title: string;
  /** A drawing where the module has one, else a glyph. */
  artwork?: ImageSourcePropType;
  art?: (size: number) => ReactNode;
  route: { pathname: string; params?: Record<string, string> };
  /** A count waiting on the tenant, shown on the tile. */
  badge?: number;
};

/** On Home: six tiles, the rest behind View more (user, 2026-11-10). */
const HOME_TILE_COUNT = 6;

/**
 * Every tool for the tenant's current stay, most used first (user,
 * 2026-11-10): bills, stay outs, concerns, deposit, damage records and the
 * request desk, then the move-in checklist, the agreement, meals and nearby.
 * Stay outs only where the property takes them, meals only where it serves food.
 */
export function useTenancyTools(): { tools: TenancyTool[]; tenancyId: string | null } {
  const tenancy = useGetMyActiveTenancyQuery().data;
  const tenancyId = tenancy?.tenancy.id ?? null;
  const live = Boolean(tenancy) && tenancy?.tenancy.status !== "PENDING_ACCEPTANCE";
  const cycles = useListMyTenancyBillingCyclesQuery(tenancyId ?? "", { skip: !tenancyId }).data ?? [];
  const stayOuts = useGetMyStayOutsQuery(undefined, { skip: !live }).data;
  const food = useGetMyFoodAvailabilityQuery(undefined, { skip: !live }).data;
  const moveIn = useGetMoveInChecklistQuery(tenancyId ?? "", { skip: !tenancyId }).data;
  if (!tenancyId || !live) return { tenancyId, tools: [] };

  const toPay = cycles.filter((cycle) => cycle.status === "UNPAID" || cycle.status === "OVERDUE").length;
  const tools: TenancyTool[] = [
    { artwork: BILLING_ARTWORK, badge: toPay, key: "bills", route: { params: { tenancyId }, pathname: "/tenancy-bills" }, title: "Bills" },
    ...(stayOuts?.available
      ? [{ art: (size: number) => <StayOutIcon size={size} />, key: "stay-outs", route: { pathname: "/tenancy-stay-outs" }, title: "Stay outs" }]
      : []),
    { artwork: CONCERNS_ARTWORK, key: "concerns", route: { pathname: "/concerns" }, title: "Concerns" },
    { artwork: DEPOSIT_ARTWORK, key: "deposit", route: { params: { tenancyId }, pathname: "/tenancy-deposit" }, title: "Deposit manager" },
    { art: (size: number) => <DamageRecordIcon size={size + 6} />, key: "damages", route: { params: { tenancyId }, pathname: "/tenancy-damages" }, title: "Damage records" },
    { art: (size: number) => <RequestDeskIcon size={size + 8} />, key: "request-desk", route: { pathname: "/tenancy-request-desk" }, title: "Request desk" },
    ...(moveIn
      ? [{
          art: (size: number) => <ToolGlyph icon={ClipboardCheck} size={size} />,
          badge: moveIn.canRespond ? 1 : 0,
          key: "move-in",
          route: { params: { role: "tenant", tenancyId }, pathname: "/move-in-checklist" },
          title: "Move-in checklist",
        }]
      : []),
    { art: (size: number) => <AgreementDrawing onLight size={size + 14} />, key: "agreement", route: { pathname: "/tenancy-agreement-view" }, title: "Agreement" },
    ...(food?.foodAvailableInProperty
      ? [{ art: (size: number) => <PlateIcon size={size + 6} />, key: "meals", route: { pathname: "/tenancy-food" }, title: "Meals and plan" }]
      : []),
    { art: (size: number) => <RedPinIcon size={size + 4} />, key: "nearby", route: { pathname: "/discovery" }, title: "Nearby" },
    // Moved here from the Account tab, with the owner's own marks (user, 2026-11-13).
    // The owner's own drawings (Home tools and the Enquiries screen), no "My" (user, 2026-11-13).
    { artwork: ENQUIRIES_ARTWORK, key: "enquiries", route: { pathname: "/my-enquiries" }, title: "Enquiries" },
    { artwork: VISITS_ARTWORK, key: "visits", route: { pathname: "/my-visits" }, title: "Visits" },
    { artwork: BOOKINGS_ARTWORK, key: "bookings", route: { pathname: "/my-bookings" }, title: "Bookings" },
  ];
  return { tenancyId, tools };
}

/** A glyph on a blue disc, for tools without a drawing of their own. */
function ToolGlyph({ icon: Icon, size }: { icon: typeof Wrench; size: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.primary, borderRadius: 999, height: size, justifyContent: "center", width: size }}>
      <Icon color="#FFFFFF" size={size * 0.52} strokeWidth={2} />
    </View>
  );
}

/** One square tile, built like the owner's pinned services. */
export function TenancyToolTile({ bare = false, tool, width }: { bare?: boolean; tool: TenancyTool; width: number }) {
  const { colors, fonts } = useTheme();
  const router = useGuardedRouter();
  // Bare (the full tools screen, user 2026-11-15): no box, the art and the name straight on the page.
  // Boxed (Home's card, user 2026-11-15): an exact square with sharp corners.
  const height = bare ? undefined : width;
  // The drawing shrinks on a narrow phone so the name still fits inside the square.
  const artHeight = bare ? 56 : Math.max(32, Math.min(56, width - 50));
  return (
    <AnimatedPressable
      accessibilityLabel={tool.badge ? `${tool.title}, ${tool.badge} waiting` : tool.title}
      accessibilityRole="button"
      onPress={() => router.push(tool.route as never)}
      style={bare
        ? { alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, width }
        : {
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 0,
          borderWidth: 1,
          gap: spacing.xs,
          height,
          justifyContent: "center",
          padding: spacing.sm,
          width,
        }}
    >
      <View style={{ alignItems: "center", height: artHeight + 4, justifyContent: "center", width: 72 }}>
        {tool.artwork ? (
          <Image accessibilityIgnoresInvertColors accessible={false} resizeMode="contain" source={tool.artwork} style={{ height: artHeight, width: 70 }} />
        ) : tool.art ? tool.art(Math.round(artHeight * 0.82)) : null}
      </View>
      <FitText numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 15, textAlign: "center" }}>
        {tool.title}
      </FitText>
      {tool.badge ? (
        <View style={{ alignItems: "center", backgroundColor: colors.danger, borderRadius: 999, minWidth: 18, paddingHorizontal: 4, position: "absolute", right: 6, top: 6 }}>
          <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 10.5, lineHeight: 18 }}>{tool.badge > 99 ? "99+" : tool.badge}</Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

/**
 * Equal square tiles, three to a row. Sized from the grid's OWN measured width
 * (user, 2026-11-14): worked out from the card's padding and border instead,
 * the cards' new 2px side edges left it 2px short and the third tile wrapped.
 * `width` is only the first guess, before the grid has been laid out.
 */
export function TenancyToolGrid({ bare = false, tools, width }: { bare?: boolean; tools: TenancyTool[]; width: number }) {
  const [measured, setMeasured] = useState(0);
  const usable = measured || width;
  const tileWidth = usable > 0 ? Math.floor((usable - spacing.sm * 2) / 3) : 0;
  return (
    <View
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={{ columnGap: spacing.sm, flexDirection: "row", flexWrap: "wrap", rowGap: bare ? spacing.md : spacing.sm }}
    >
      {tileWidth ? tools.map((tool) => <TenancyToolTile bare={bare} key={tool.key} tool={tool} width={tileWidth} />) : null}
    </View>
  );
}

/**
 * Tenancy tools on the tenant's Home (user, 2026-11-10): six tiles like the
 * owner's pinned services, and View more for every tool.
 */
export function TenancyToolsHomeCard() {
  const { colors, fonts } = useTheme();
  const router = useGuardedRouter();
  const { tools } = useTenancyTools();
  const { width: windowWidth } = useWindowDimensions();
  const [boxWidth, setBoxWidth] = useState(() => Math.max(0, windowWidth - spacing.lg * 2));
  if (tools.length === 0) return null;
  const inner = Math.max(0, boxWidth - spacing.md * 2 - 2);

  return (
    <View
      onLayout={(event) => setBoxWidth(event.nativeEvent.layout.width)}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
        {/* A golden key, slanted, head down (user, 2026-11-11). */}
        <GoldenKeyIcon size={22} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 18 }}>Tenancy tools</Text>
      </View>
      <TenancyToolGrid tools={tools.slice(0, HOME_TILE_COUNT)} width={inner} />
      {/* A white button with a blue edge and label, the app's secondary button. */}
      <AnimatedPressable
        accessibilityLabel="View all tenancy tools"
        accessibilityRole="button"
        onPress={() => router.push("/tenancy-tools" as never)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.primary,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1.5,
          justifyContent: "center",
          minHeight: 44,
        }}
      >
        <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 14 }}>View more</Text>
      </AnimatedPressable>
    </View>
  );
}
