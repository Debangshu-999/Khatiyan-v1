import { Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Check } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { METHOD_ICON, type TenderMethod } from "@/features/billing/payment-methods";
import type { ManualPaymentMethod } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Payment setup's headings name the method as a way of being paid ("Cash
 * payment"). Bank transfer already reads that way. Everywhere else keeps the
 * short METHOD_LABEL.
 */
const SETUP_LABEL: Record<TenderMethod, string> = {
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card payment",
  CASH: "Cash payment",
  CHEQUE: "Cheque payment",
  UPI: "UPI payment",
};

/**
 * A payment method's checkbox in Payment setup (2026-09-28): ticked means
 * tenants are offered it and Mark paid lists it. Drawn like the end-tenancy
 * checklist's boxes, with the method's icon and name.
 */
export function PaymentMethodToggle({
  checked,
  method,
  onToggle,
}: {
  checked: boolean;
  method: TenderMethod;
  onToggle: () => void;
}) {
  const { colors, fonts } = useTheme();
  // Only the box ticks (user, 2026-09-28). The icon and name beside it are a
  // label, not a target. The slop makes the 22px box thumb-sized without
  // reaching the icon.
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 32 }}>
      <AnimatedPressable
        accessibilityLabel={`${SETUP_LABEL[method]}, ${checked ? "taken" : "not taken"}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        hitSlop={{ bottom: 11, left: 11, right: 6, top: 11 }}
        onPress={onToggle}
        style={{
          alignItems: "center",
          backgroundColor: checked ? colors.primary : "transparent",
          borderColor: checked ? colors.primary : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 5,
          borderWidth: 1.25,
          height: 22,
          justifyContent: "center",
          width: 22,
        }}
      >
        {checked ? <Check color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
      </AnimatedPressable>
      <MaterialCommunityIcons color={colors.ink} name={METHOD_ICON[method]} size={20} />
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>{SETUP_LABEL[method]}</Text>
    </View>
  );
}

/**
 * A payment method's glyph, for pickers that list methods (Mark paid, the
 * end-tenancy one-off bill). Plain ink, no container, like every icon in a
 * picker row. OTHER only appears on old records.
 */
export function PaymentMethodIcon({ method, size = 22 }: { method: ManualPaymentMethod; size?: number }) {
  const { colors } = useTheme();
  return (
    <MaterialCommunityIcons
      color={colors.ink}
      name={method === "OTHER" ? "dots-horizontal-circle-outline" : METHOD_ICON[method]}
      size={size}
    />
  );
}
