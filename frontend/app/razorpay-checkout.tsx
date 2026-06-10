import { Text } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function RazorpayCheckoutScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        eyebrow="PAYMENT"
        title="Browser"
        italicTail="checkout."
        subtitle="Razorpay now opens in your phone browser from the Pay button."
        trailing={<BackButton onPress={() => router.back()} />}
      />
      <Card>
        <Text style={[type.body, { color: colors.muted }]} selectable>
          Go back to your tenancy billing cycle and press Pay again.
        </Text>
      </Card>
    </ScreenScrollView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel="Go back"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        height: 42,
        justifyContent: "center",
        width: 42,
      }}
    >
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}
