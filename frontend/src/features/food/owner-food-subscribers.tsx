import { Text, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { SheetShell } from "@/components/sheet-shell";
import { FoodSubscribersSkeleton } from "@/components/skeletons";
import { DAY_LABEL, FoodStatusChip, foodIcon } from "@/features/food/food-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import type { FoodSubscriber } from "@/store/services/food-api";

/** Subscribers for one profile, opened from that profile's count. */
export function FoodProfileSubscribersSheet({
  loading,
  onClose,
  profileName,
  subscribers,
}: {
  loading: boolean;
  onClose: () => void;
  profileName: string;
  subscribers: FoodSubscriber[];
}) {
  const { colors, fonts } = useTheme();
  const people = [...subscribers].sort((left, right) => left.tenantName.localeCompare(right.tenantName));

  return (
    <SheetShell animated onClose={onClose} title={`${profileName} subscribers`}>
      {loading ? <FoodSubscribersSkeleton rows={4} /> : null}

      {!loading && people.length === 0 ? (
        <EmptyState
          compact
          description="Tenants who choose this profile will appear here."
          icon={foodIcon("account-group-outline")}
          title="No subscribers yet"
        />
      ) : null}

      {!loading ? (
        <View style={{ borderColor: colors.border, borderRadius: radii.card, borderWidth: people.length > 0 ? 1 : 0, overflow: "hidden" }}>
          {people.map((person, index) => (
            <View
              key={person.subscriptionId}
              style={{
                alignItems: "center",
                borderTopColor: colors.border,
                borderTopWidth: index === 0 ? 0 : 1,
                flexDirection: "row",
                gap: spacing.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>
                  {person.tenantName}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
                  {person.tenantPhone}
                </Text>
                {/* A mixed week (user, 2026-09-29): the only tag here, with the
                    days this tenant eats this profile. */}
                {person.hybrid ? (
                  <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2 }}>
                    <FoodStatusChip icon="calendar-week" label="Hybrid" tone="neutral" />
                    {/* The days ride in a grey pill beside the tag, styled
                        as it is (user, 2026-10-02). */}
                    <FoodStatusChip label={person.days.map((day) => DAY_LABEL[day].slice(0, 3)).join(", ")} tone="neutral" />
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 12.5 }}>
                {person.roomNumber ? `Room ${person.roomNumber}` : "No room"}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </SheetShell>
  );
}
