import { View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

export function PropertyProfileSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" }}>
        <Skeleton height={42} radius={999} width={42} />
        <Skeleton height={42} radius={999} width={42} />
      </View>

      <Skeleton height={224} radius={18} />
      <View style={{ flexDirection: "row", gap: 7 }}>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton height={56} key={index} radius={8} width="18.4%" />
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Skeleton height={24} width="24%" />
        <Skeleton height={32} width="72%" />
        <Skeleton height={18} width="94%" />
        <Skeleton height={42} width="100%" />
      </View>

      <GridBlock rows={2} />
      <Skeleton height={86} radius={10} />
      <GridBlock rows={3} />

      <View style={{ gap: spacing.sm }}>
        <Skeleton height={18} width="34%" />
        <GridBlock rows={2} />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Skeleton height={18} width="30%" />
        <Skeleton height={150} radius={16} />
        <Skeleton height={150} radius={16} />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Skeleton height={18} width="42%" />
        <GridBlock rows={3} />
      </View>
    </View>
  );
}

function GridBlock({ rows }: { rows: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={{ flexDirection: "row", gap: spacing.lg }}>
          {[0, 1].map((cell) => (
            <View key={cell} style={{ flex: 1, gap: 7 }}>
              <Skeleton height={10} width="52%" />
              <Skeleton height={15} width="78%" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
