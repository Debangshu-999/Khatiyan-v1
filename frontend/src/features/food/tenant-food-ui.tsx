import { Text, View } from "react-native";

import { FoodItemThumb, MealGlyph } from "@/features/food/food-ui";
import type { MealType } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The shared meal icon in the tenant screens' blue. */
export function TenantMealIcon({ meal, size = 22 }: { meal: MealType; size?: number }) {
  const { colors } = useTheme();
  return <MealGlyph color={colors.primary} meal={meal} size={size} />;
}

/** One full-width dish: photo or placeholder, name, then its portion on the right. */
export function TenantMenuItemRow({
  imageUrl,
  name,
  quantity,
}: {
  imageUrl: string | null;
  name: string;
  quantity: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderCurve: "continuous",
        borderRadius: radii.sm,
        flexDirection: "row",
        gap: spacing.sm,
        minHeight: 60,
        padding: spacing.xs,
      }}
    >
      <FoodItemThumb imageUrl={imageUrl} size={46} />
      <Text numberOfLines={2} style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13.5, lineHeight: 18 }}>
        {name}
      </Text>
      <Text numberOfLines={2} style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 11.5, lineHeight: 16, maxWidth: "39%", textAlign: "right" }}>
        {quantity} /person
      </Text>
    </View>
  );
}
