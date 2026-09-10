import { View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

/** API-backed tenancy-type options inside the wizard's existing card. */
export function OwnerStayTypeOptionsSkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <Skeleton height={12} width="78%" />
      <Skeleton height={72} radius={14} width="100%" />
      <Skeleton height={72} radius={14} width="100%" />
    </View>
  );
}

/** The selected-property summary; the card and section label stay real. */
export function OwnerOnboardingPropertySkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <Skeleton height={42} radius={12} width={42} />
        <View style={{ flex: 1, gap: 7 }}>
          <Skeleton height={18} width="62%" />
          <Skeleton height={11} width="78%" />
        </View>
      </View>
      <Skeleton height={11} width="48%" />
    </View>
  );
}

/** Floor controls and room choices loaded from the selected property. */
export function OwnerOnboardingRoomsSkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Skeleton height={36} radius={999} width={76} />
        <Skeleton height={36} radius={999} width={82} />
        <Skeleton height={36} radius={999} width={72} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Skeleton height={92} radius={14} width="48%" />
        <Skeleton height={92} radius={14} width="48%" />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Skeleton height={92} radius={14} width="48%" />
        <Skeleton height={92} radius={14} width="48%" />
      </View>
    </View>
  );
}

/** Agreement copy is the only remote part inside the already-open preview. */
export function OwnerAgreementPreviewSkeleton() {
  return (
    <View style={{ gap: spacing.sm }}>
      <Skeleton height={18} width="58%" />
      <Skeleton height={11} width="96%" />
      <Skeleton height={11} width="92%" />
      <Skeleton height={11} width="86%" />
      <Skeleton height={96} radius={12} width="100%" />
    </View>
  );
}
