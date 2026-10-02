import { Text, View } from "react-native";
import { ReceiptText } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Skeleton } from "@/components/skeleton";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useTheme } from "@/theme/use-theme";

export function WalletTransactionSkeleton({ count = 5 }: { count?: number }) {
  return <View accessibilityLabel="Loading transactions" style={{ gap: 18, paddingVertical: 14 }}>
    {Array.from({ length: count }, (_, index) => <View key={index} style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Skeleton width="48%" height={16} /><Skeleton width={48} height={16} /></View>
      <Skeleton width="58%" height={12} />
      {index < count - 1 ? <Skeleton height={1} radius={0} /> : null}
    </View>)}
  </View>;
}

export function WalletScreenSkeleton() {
  const { colors } = useTheme();
  const card = { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 16, gap: 14 };
  return <SafeAreaView edges={["top", "bottom"]} accessibilityLabel="Loading wallet" style={{ flex: 1, backgroundColor: colors.surface, paddingHorizontal: 18, paddingTop: 8, gap: 12 }}>
    <View style={[card, { alignItems: "center" }]}><Skeleton width={150} height={12} /><Skeleton width={100} height={36} /></View>
    <View style={card}><Skeleton height={48} /><View style={{ flexDirection: "row", gap: 10 }}>{[0, 1, 2].map((key) => <View key={key} style={{ flex: 1 }}><Skeleton height={38} /></View>)}</View><Skeleton height={42} /></View>
    <View style={card}><View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><Skeleton width={36} height={36} /><Skeleton width="60%" height={19} /></View><WalletTransactionSkeleton /><Skeleton width={75} height={16} /></View>
    <View style={[card, { flexDirection: "row", alignItems: "center" }]}><Skeleton width={36} height={36} /><View style={{ flex: 1 }}><Skeleton width="65%" height={18} /></View><Skeleton width={62} height={34} radius={17} /></View>
  </SafeAreaView>;
}

/** The All Transactions screen, as a placeholder: its heading, its filter and a page of rows. */
export function WalletTransactionsScreenSkeleton() {
  const { colors } = useTheme();
  return <SafeAreaView edges={["top", "bottom"]} accessibilityLabel="Loading transactions" style={{ flex: 1, backgroundColor: colors.surface }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 16 }}><Skeleton width={36} height={36} radius={18} /><Skeleton width={150} height={18} /></View>
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 10 }}>{[0, 1, 2].map((key) => <View key={key} style={{ flex: 1 }}><Skeleton height={38} /></View>)}</View>
    <View style={{ paddingHorizontal: 20 }}><WalletTransactionSkeleton count={8} /></View>
  </SafeAreaView>;
}

export function WalletTransactionsErrorCard({ onRetry }: { onRetry: () => void }) {
  const { colors, fonts, type } = useTheme();
  return <View accessibilityRole="alert" style={{ marginVertical: 12, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", gap: 10 }}>
    <View style={{ backgroundColor: colors.neutralSoft, padding: 10, borderRadius: 12 }}><ReceiptText size={24} color={colors.muted} /></View>
    <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 15 }}>Could not load transactions</Text>
    <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>Your transaction history is temporarily unavailable</Text>
    <AnimatedPressable accessibilityRole="button" onPress={onRetry} style={{ backgroundColor: colors.neutralSoft, paddingHorizontal: 22, paddingVertical: 9, borderRadius: 10 }}><Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>Try again</Text></AnimatedPressable>
  </View>;
}
