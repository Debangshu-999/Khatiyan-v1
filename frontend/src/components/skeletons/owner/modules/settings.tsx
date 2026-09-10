import { View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { OwnerDataCardSkeleton, OwnerFormSkeleton } from "@/components/skeletons/owner/shared";
import { spacing } from "@/theme/spacing";

export function OwnerSettingsFormSkeleton({ fields = 4, media = false }: { fields?: number; media?: boolean }) {
  return <OwnerFormSkeleton fields={fields} media={media} />;
}

export function OwnerRulesEditorSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerDataCardSkeleton bodyLines={2} />
      <OwnerFormSkeleton fields={3} />
    </View>
  );
}

export function OwnerPermissionSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <OwnerDataCardSkeleton bodyLines={1} />
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={{ flexDirection: "row", gap: spacing.sm }}>
          <Skeleton height={44} radius={12} width="58%" />
          <Skeleton height={44} radius={999} width="36%" />
        </View>
      ))}
    </View>
  );
}
