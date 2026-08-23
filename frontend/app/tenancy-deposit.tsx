import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Landmark } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonCard } from "@/components/skeleton";
import type { DepositMovement } from "@/store/services/billing-api";
import { isDepositCredit, useGetMyTenancyDepositQuery } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function TenancyDepositScreen() {
  const router = useRouter();
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();
  const { colors, type } = useTheme();
  const depositQuery = useGetMyTenancyDepositQuery(tenancyId ?? "", { skip: !tenancyId });
  const deposit = depositQuery.data;

  return (
    <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Tenancy"
        onBack={() => router.back()}
        title="Deposit"
        italicTail="manager."
        subtitle="Balance, settlement state and deposit movements linked to billing actions."
      />

      {depositQuery.isFetching ? (
        <SkeletonCard />
      ) : deposit ? (
        <>
          <Card>
            <View style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile label="Balance" value={formatMoney(deposit.currentBalancePaise)} hint={humanizeToken(deposit.status)} tone="primary" />
                <MetricTile label="Entries" value={String(deposit.movements.length)} hint="Movements" />
              </View>
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  Account status
                </Text>
                <StatusPill label={humanizeToken(deposit.status)} tone={deposit.status === "ACTIVE" ? "success" : "neutral"} />
              </View>
            </View>
          </Card>

          {deposit.movements.length > 0 ? (
            deposit.movements.map((movement) => <MovementCard key={movement.id} movement={movement} />)
          ) : (
            <EmptyState
              icon={Landmark}
              title="No deposit actions yet"
              description="Credits, deductions and settlement actions will appear here as the deposit ledger changes."
            />
          )}
        </>
      ) : (
        <EmptyState icon={Landmark} title="Deposit account unavailable" description="Deposit details will appear after the account opens." />
      )}
    </ScreenScrollView>
  );
}

function MovementCard({ movement }: { movement: DepositMovement }) {
  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <DetailKicker text={humanizeToken(movement.type)} />
          <StatusPill label={isDepositCredit(movement.type) ? "Credit" : "Debit"} tone={isDepositCredit(movement.type) ? "success" : "warning"} />
        </View>
        <DetailLine label={movement.reason} value={formatMoney(movement.amountPaise)} strong />
        <DetailLine label="Created" value={formatDateTime(movement.createdAt)} />
        {movement.billingCycleId ? <DetailLine label="Billing link" value={shortId(movement.billingCycleId)} /> : null}
      </View>
    </Card>
  );
}


function DetailKicker({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.eyebrow, { color: colors.kicker }]}>{text}</Text>;
}

function DetailLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text style={{ color: colors.ink, flex: 1.25, fontFamily: strong ? fonts.display : fonts.sans, fontSize: strong ? 19 : undefined, fontWeight: strong ? "500" : "800", textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: value % 100 === 0 ? 0 : 2, style: "currency" }).format(value / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}

function humanizeToken(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortId(value: string) {
  return value.slice(0, 8);
}
