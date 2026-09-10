import { Text, View } from "react-native";

import { Card } from "@/components/card";
import { Skeleton } from "@/components/skeletons/primitives";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** API-backed account-role rows. The surrounding section title stays real. */
export function AccountSwitchRowsSkeleton({ rows = 2 }: { rows?: number }) {
  const { colors } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.md,
            padding: spacing.md,
          }}
        >
          <Skeleton height={42} radius={12} width={42} />
          <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
            <Skeleton height={16} width={index % 2 ? "42%" : "50%"} />
            <Skeleton height={11} width={index % 2 ? "70%" : "82%"} />
          </View>
          <Skeleton height={12} width={62} />
        </View>
      ))}
    </View>
  );
}

/** The enquiry-channel group while the server resolves available channels. */
export function AccountEnquiryRepliesSkeleton() {
  const { colors, type } = useTheme();

  return (
    <Card>
      <View
        style={{
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <View
            key={index}
            style={{
              alignItems: "center",
              borderTopColor: colors.border,
              borderTopWidth: index === 0 ? 0 : 1,
              flexDirection: "row",
              gap: spacing.md,
              minHeight: 70,
              padding: spacing.md,
            }}
          >
            <Skeleton height={20} radius={7} width={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton height={14} width={index === 1 ? "38%" : "30%"} />
              <Skeleton height={10} width={index === 2 ? "68%" : "78%"} />
            </View>
            <Skeleton height={28} radius={999} width={48} />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Skeleton height={22} radius={6} width={22} />
        <Text style={[type.caption, { color: colors.inkSoft, flex: 1, lineHeight: 19 }]}>
          I agree to share the contact details I picked with the properties I enquire to.
        </Text>
      </View>
    </Card>
  );
}

/** Session cards shaped like the device rows that replace them. */
export function AccountSessionListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <Skeleton height={20} radius={7} width={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton height={15} width={index ? "48%" : "58%"} />
              <Skeleton height={10} width={index ? "62%" : "38%"} />
            </View>
            <Skeleton height={32} radius={999} width={76} />
          </View>
        </Card>
      ))}
    </View>
  );
}
