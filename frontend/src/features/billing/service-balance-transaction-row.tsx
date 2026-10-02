import { Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import type { ServiceBalanceEntry } from "@/store/services/service-balance-api";
import { useTheme } from "@/theme/use-theme";

export function transactionAmount(entry: ServiceBalanceEntry) {
  // Charges may debit available funds, consume a hold, or create a debt.
  return entry.type === "CHARGE"
    ? -(Math.abs(entry.availableDeltaPaise) + Math.abs(entry.reservedDeltaPaise) + Math.abs(entry.outstandingDeltaPaise))
    : entry.availableDeltaPaise;
}

const TITLES: Record<ServiceBalanceEntry["type"], string> = {
  TOPUP: "Balance added", RESERVE: "Amount held for a service", RELEASE: "Service hold released",
  CHARGE: "Service charge", REFUND: "Balance refunded", CHARGEBACK: "Payment reversed", ADJUSTMENT: "Balance adjustment",
};

export function ServiceBalanceTransactionRow({ entry, compact = false }: { entry: ServiceBalanceEntry; compact?: boolean }) {
  const { colors, fonts } = useTheme();
  const amount = transactionAmount(entry);
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(entry.createdAt)).replace(/\bSept\b/g, "Sep");
  const time = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(entry.createdAt));
  return <View style={{ paddingVertical: compact ? 8 : 17, gap: compact ? 3 : 6 }}>
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <Text style={{ flex: 1, color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20 }}>{entry.memo || TITLES[entry.type]}</Text>
      <Text style={{ color: amount > 0 ? colors.successText : amount < 0 ? colors.danger : colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{amount > 0 ? "+" : amount < 0 ? "−" : ""}{formatMoneyPaise(Math.abs(amount))}</Text>
    </View>
    <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16 }}>{date}, {time}</Text>
  </View>;
}

export function TransactionSeparator() {
  const { colors } = useTheme();
  // Hidden from screen readers through a View, not on the Svg. On the web build
  // an Svg hands unknown props straight to the DOM, and React logs an error for
  // each one, which opens the dev overlay every time the wallet is entered.
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height={3}>
      <Line x1={1} y1={1.5} x2="100%" y2={1.5} stroke={colors.borderStrong} strokeWidth={1} strokeDasharray="4 6" strokeLinecap="butt" />
    </Svg>
  </View>;
}
