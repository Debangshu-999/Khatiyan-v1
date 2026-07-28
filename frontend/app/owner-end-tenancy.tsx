import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { AlertCircle, Check, DoorOpen } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ActionButton, BackButton, ChoiceButton, formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { billTitle, useListManagedTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import { useGetPropertyExitPoliciesQuery } from "@/store/services/property-api";
import { useEndTenancyMutation, useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Owner "End tenancy" gate: confirm the latest bill is cleared, verify the
// property's move-out checklist, then end the stay and choose to settle the
// deposit now (settlement screen) or later (parks it in PENDING_SETTLEMENT).
export default function OwnerEndTenancyScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();
  const { tenancyId: tenancyIdParam } = useLocalSearchParams<{ tenancyId?: string }>();
  const tenancyId = typeof tenancyIdParam === "string" ? tenancyIdParam : "";

  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const tenanciesQuery = useListPropertyTenanciesQuery({ includePast: true, propertyId }, { skip: !propertyId });
  const tenancy = tenanciesQuery.data?.find((item) => item.id === tenancyId) ?? null;

  const policiesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const checklist = policiesQuery.data?.exitChecklist ?? [];

  const cyclesQuery = useListManagedTenancyBillingCyclesQuery(tenancyId, { skip: !tenancyId });
  // Every bill counts — rent cycles AND one-off bills (e.g. an early-exit
  // penalty). Mirrors the backend exit gate, which blocks on any unpaid bill.
  const unpaidBills = useMemo(
    () => (cyclesQuery.data ?? []).filter((cycle) => cycle.status === "UNPAID" || cycle.status === "OVERDUE"),
    [cyclesQuery.data],
  );
  const duesCleared = unpaidBills.length === 0;
  const unpaidTotalPaise = unpaidBills.reduce((sum, cycle) => sum + cycle.totalAmountPaise, 0);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = checklist.every((_, index) => checked[index]);
  const isDaily = tenancy?.billingType === "DAILY";
  // Monthly tenancies choose when the deposit is settled; daily stays have none.
  const [settleNow, setSettleNow] = useState(true);

  const [endTenancy, endState] = useEndTenancyMutation();

  async function end(settleNow: boolean) {
    if (!tenancyId) {
      return;
    }
    if (!duesCleared) {
      toast.error(
        unpaidBills.length === 1
          ? "Clear the outstanding bill before ending the tenancy."
          : "Clear all outstanding bills before ending the tenancy.",
      );
      return;
    }
    if (!allChecked) {
      toast.error("Verify every move-out checklist item first.");
      return;
    }
    try {
      await endTenancy(tenancyId).unwrap();
      if (settleNow && !isDaily) {
        router.replace({ pathname: "/owner-deposit-manager", params: { settle: "1", tenancyId } });
      } else {
        toast.success("Tenancy ended.");
        router.back();
      }
    } catch (error) {
      const message = (error as { data?: { message?: string } })?.data?.message;
      toast.error(message ?? "Could not end the tenancy. Please try again.");
    }
  }

  const loading = tenanciesQuery.isFetching && !tenancy;

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView safeAreaEdges={["top"]} contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.lg, paddingTop: 0 }}>
        <BackButton onPress={() => router.back()} />
        <ScreenHeader
          title="End"
          italicTail="tenancy."
          subtitle={tenancy ? `Check out ${tenancy.tenantName?.trim() || "the tenant"} and settle up.` : "Ending a tenancy."}
        />

        {loading ? (
          <SkeletonCard />
        ) : !tenancy ? (
          <EmptyState
            icon={DoorOpen}
            eyebrow="Not found"
            title="Tenancy unavailable"
            description="This tenancy could not be loaded for the selected property."
          />
        ) : (
          <>
            <StatusRow
              cleared={duesCleared}
              clearedText="All bills are paid — rent cycles and any one-off charges."
              pendingText={
                unpaidBills.length === 1
                  ? `${billTitle(unpaidBills[0])} (${unpaidBills[0].referenceCode}) of ${formatMoneyPaise(unpaidBills[0].totalAmountPaise)} is unpaid.`
                  : `${unpaidBills.length} unpaid bills totalling ${formatMoneyPaise(unpaidTotalPaise)}.`
              }
              title="Dues"
            />

            <Card>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Move-out checklist
              </Text>
              {checklist.length === 0 ? (
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
                  No checklist configured for this property. Add items under exit policies.
                </Text>
              ) : (
                checklist.map((item, index) => (
                  <CheckRow
                    key={`${item}-${index}`}
                    checked={Boolean(checked[index])}
                    label={item}
                    onToggle={() => setChecked((current) => ({ ...current, [index]: !current[index] }))}
                  />
                ))
              )}
            </Card>

            {!isDaily ? (
              <Card>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  Deposit settlement
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <ChoiceButton active={settleNow} label="Settle now" onPress={() => setSettleNow(true)} />
                  <ChoiceButton active={!settleNow} label="Settle later" onPress={() => setSettleNow(false)} />
                </View>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
                  {settleNow
                    ? "You'll go straight to the deposit settlement screen after ending the tenancy."
                    : "The deposit stays pending — settle it whenever from the deposit manager or the action center."}
                </Text>
              </Card>
            ) : null}
          </>
        )}
      </ScreenScrollView>

      {tenancy ? (
        <View
          style={{
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
          }}
        >
          <ActionButton
            disabled={endState.isLoading}
            label={endState.isLoading ? "Ending…" : "End tenancy"}
            onPress={() => void end(isDaily ? false : settleNow)}
            variant="danger"
          />
          {/* Bottom inset measured inside this window — the context insets
              under-report on edge-to-edge Android and clip the button. */}
          <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
        </View>
      ) : null}
    </View>
  );
}

function StatusRow({
  cleared,
  clearedText,
  pendingText,
  title,
}: {
  cleared: boolean;
  clearedText: string;
  pendingText: string;
  title: string;
}) {
  const { colors, type } = useTheme();
  const tone = cleared ? colors.jade : colors.danger;
  const toneSoft = cleared ? colors.jadeSoft : colors.dangerSoft;
  const Icon = cleared ? Check : AlertCircle;
  return (
    <View style={{ alignItems: "center", backgroundColor: toneSoft, borderRadius: 14, flexDirection: "row", gap: spacing.md, padding: spacing.md }}>
      <Icon color={tone} size={22} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.eyebrow, { color: tone }]} selectable>
          {title}
        </Text>
        <Text style={[type.caption, { color: colors.ink, lineHeight: 18 }]} selectable>
          {cleared ? clearedText : pendingText}
        </Text>
      </View>
    </View>
  );
}

function CheckRow({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: checked ? colors.primary : "transparent",
          borderColor: checked ? colors.primary : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 6,
          borderWidth: 1.5,
          height: 22,
          justifyContent: "center",
          width: 22,
        }}
      >
        {checked ? <Check color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
      </View>
      <Text style={[type.body, { color: colors.ink, flex: 1 }]} selectable={false}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
