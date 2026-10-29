import { View } from "react-native";

import { BookingTokenAmountIcon } from "@/components/booking-vector-icons";
import { FitText } from "@/components/fit-text";
import { useTheme } from "@/theme/use-theme";

/**
 * "₹2,000 booking token received", under a bill's total (2026-10-28).
 *
 * <p>The first bill of a stay onboarded from a booking has the token the
 * property already holds taken off it. Money received, not a discount, so it
 * is named on its own wherever the total is shown, owner's and tenant's alike,
 * with the token's own mark from the Token records screen.
 */
export function BookingTokenNote({ paise }: { paise: number }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
      <BookingTokenAmountIcon color={colors.jade} size={14} />
      <FitText numberOfLines={1} style={{ color: colors.jade, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 12 }}>
        {formatRupees(paise)} booking token received
      </FitText>
    </View>
  );
}

function formatRupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(paise / 100);
}
