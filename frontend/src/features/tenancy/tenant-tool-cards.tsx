import { Image, Text, View } from "react-native";
import type { ComponentType } from "react";
import { ChevronRight, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FitText } from "@/components/fit-text";
import { buildExitRequestChains, buildRoomChangeRequestChains } from "@/features/tenancy/request-chain";
import type { TenancyExitRequest, TenancyRoomChangeRequest } from "@/store/services/tenancy-api";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The tenant's request cards (2026-11-10), moved off the Tenancy tab onto the
 * Request desk unchanged, and the drawings the Tenancy tools tiles share.
 */

// The same drawing the owner's Deposit manager tile carries on Home. A deposit
// is one thing across both sides of the app and should look like one thing.
export const DEPOSIT_ARTWORK = require("../../../assets/icons/home-tools/deposit-manager.png");
export const REQUESTS_ARTWORK = require("../../../assets/images/workspace/tenancy-module.png");
export const CONCERNS_ARTWORK = require("../../../assets/images/workspace/concern-module.png");


export function StayRequestsCard({
  hasUpdate,
  onPress,
}: {
  hasUpdate: boolean;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        padding: spacing.md,
      }}
    >
      <AnimatedPressable
        accessibilityLabel="View your requests"
        accessibilityRole="button"
        onPress={onPress}
        style={{ alignItems: "center", borderRadius: radii.lg, flexDirection: "row", gap: spacing.md }}
      >
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={REQUESTS_ARTWORK}
          style={{ height: 48, width: 64 }}
        />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19 }}>
            My Requests
          </FitText>
        </View>
        <SummaryChevron hasUpdate={hasUpdate} />
      </AnimatedPressable>
    </View>
  );
}

export function SummaryChevron({ hasUpdate }: { hasUpdate?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderRadius: 999,
        height: 34,
        justifyContent: "center",
        width: 34,
      }}
    >
      <ChevronRight color={colors.muted} size={17} strokeWidth={2.3} />
      {hasUpdate ? (
        <View
          pointerEvents="none"
          style={{
            backgroundColor: colors.danger,
            borderColor: colors.surface,
            borderRadius: 999,
            borderWidth: 2,
            height: 10,
            position: "absolute",
            right: -2,
            top: -2,
            width: 10,
          }}
        />
      ) : null}
    </View>
  );
}


/**
 * One of the two things a tenant can ask for.
 *
 * <p>A tile rather than a card with a paragraph. The two are alternatives to
 * each other, and side by side they read as one question — which is what they
 * are — where two stacked cards read as two unrelated features.
 */
export function RequestTile({
  disabled = false,
  icon: Icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        justifyContent: "center",
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <Icon color={colors.primary} size={22} strokeWidth={2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>{label}</Text>
    </AnimatedPressable>
  );
}

export type TenantRequestHistoryItem =
  | (TenancyExitRequest & { requestKind: "EXIT" })
  | (TenancyRoomChangeRequest & { requestKind: "ROOM_CHANGE" });


export function compareRequests(left: { updatedAt: string; createdAt: string }, right: { updatedAt: string; createdAt: string }) {
  return new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime();
}

export function mergedRequests(
  exitRequests: TenancyExitRequest[] = [],
  roomChangeRequests: TenancyRoomChangeRequest[] = [],
  tenancyId?: string,
): TenantRequestHistoryItem[] {
  const exits = buildExitRequestChains(exitRequests)
    .map((chain) => chain.head)
    .filter((request) => !tenancyId || request.tenancyId === tenancyId)
    .map((request) => ({ ...request, requestKind: "EXIT" as const }));
  const roomChanges = buildRoomChangeRequestChains(roomChangeRequests)
    .map((chain) => chain.head)
    .filter((request) => !tenancyId || request.tenancyId === tenancyId)
    .map((request) => ({ ...request, requestKind: "ROOM_CHANGE" as const }));

  return [...exits, ...roomChanges];
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(value / 100);
}

