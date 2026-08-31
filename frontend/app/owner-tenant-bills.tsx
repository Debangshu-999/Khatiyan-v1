import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Modal, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ChevronRight, Plus, ReceiptText, Users, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";

import { ScreenHeader } from "@/components/screen-header";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import { SkeletonList } from "@/components/skeleton";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { NoticeBar } from "@/features/owner/owner-ui";
import { ActionButton, FormInput, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { BillCard, compareByPeriodDesc } from "@/features/owner/bill-views";
import { useAppSelector } from "@/store/hooks";
import { useCreateOneOffBillMutation, useListManagedTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import { useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PAGE_SIZE = 8;

/** How close to the end before the next batch is revealed. */
const LOAD_MORE_THRESHOLD_PX = 220;

/**
 * Room left under the list for the pinned Add-bill footer.
 *
 * <p>More than the footer is tall: it overlays the list rather than sitting
 * below it, so anything less leaves the last bill half-covered with no way to
 * scroll it clear.
 */
const FOOTER_CLEARANCE = 148;

type BillFilter = "ALL" | "RENT_CYCLE" | "ONE_OFF";
const FILTERS: { label: string; value: BillFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Cycles", value: "RENT_CYCLE" },
  { label: "Other bills", value: "ONE_OFF" },
];

export default function OwnerTenantBillsScreen() {
  const router = useGuardedRouter();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const [selected, setSelected] = useState<TenancySummary | null>(null);
  const { canManage: canManageResource } = usePropertyPermissions(propertyId);
  const canManageBilling = canManageResource("BILLING_CYCLES");
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [addOpen, setAddOpen] = useState(false);

  // The whole tenancy's bills arrive in one response, so this pages the RENDER
  // rather than the fetch — which is the only reason it can be this simple, and
  // the reason it must change if the endpoint ever paginates.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [visibleTotal, setVisibleTotal] = useState(0);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (visibleCount >= visibleTotal) {
      return;
    }
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom <= LOAD_MORE_THRESHOLD_PX) {
      setVisibleCount((current) => Math.min(current + PAGE_SIZE, visibleTotal));
    }
  }

  const selectTenant = useCallback((next: TenancySummary | null) => {
    setSelected(next);
    setVisibleCount(PAGE_SIZE);
  }, []);

  // The header's back button steps out of a tenant's bills into the picker; the
  // device button used to leave the screen entirely, so the two disagreed about
  // where "back" is.
  //
  // Focus-scoped, not a plain effect: expo-router keeps screens mounted, and an
  // unscoped listener stays registered and eats the back press on whatever
  // screen you are actually looking at.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!selected) {
          return false;
        }
        selectTenant(null);
        return true;
      });
      return () => subscription.remove();
    }, [selectTenant, selected]),
  );

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
    <ScreenScrollView
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={{
        paddingBottom: selected ? FOOTER_CLEARANCE : undefined,
        paddingTop: 0,
      }}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <ScreenHeader
        badge={!canManageBilling ? <ViewOnlyChip /> : null}
        onBack={() => (selected ? selectTenant(null) : router.back())}
        eyebrow="Billing"
        title="Tenant"
        italicTail="bills."
        subtitle={
          selected
            ? `All bills in ${selected.tenantName?.trim() || "this tenant"}'s current tenancy.`
            : property
              ? `Pick an active tenant to see all bills in their current tenancy at ${property.name}.`
              : "Select a property from Home to view tenant bills."
        }
      />

      {!property ? (
        <EmptyState
          icon={Users}

          title="No property selected"
          description="Choose an active property from Home before viewing tenant bills."
        />
      ) : selected ? (
        <TenantBills
          onChangeTenant={() => selectTenant(null)}
          onFilterChange={() => setVisibleCount(PAGE_SIZE)}
          onTotalChange={setVisibleTotal}
          tenancy={selected}
          visibleCount={visibleCount}
        />
      ) : (
        <TenantPicker onSelect={selectTenant} propertyId={propertyId} />
      )}
    </ScreenScrollView>

    {/* Outside the scroll view: raising a bill is the one thing you come to this
        screen to DO, and at the end of a long list it was the one control you
        had to scroll past every bill to reach. */}
    {selected ? (
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          bottom: 0,
          gap: spacing.sm,
          left: 0,
          paddingBottom: insets.bottom + spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          position: "absolute",
          right: 0,
        }}
      >
        <View style={{ flexDirection: "row" }}>
          <ActionButton
            disabled={!canManageBilling}
            icon={Plus}
            label="Add bill"
            onPress={() => setAddOpen(true)}
          />
        </View>
        <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
          {canManageBilling
            ? `Raises a one-off bill for ${selected.tenantName?.trim() || "this tenant"}, separate from their rent cycles.`
            : "You have view-only access to billing, so you cannot raise a bill."}
        </Text>
      </View>
    ) : null}

    {addOpen && selected ? <AddOneOffBillSheet onClose={() => setAddOpen(false)} tenancy={selected} /> : null}
    </View>
  );
}

function TenantPicker({ onSelect, propertyId }: { onSelect: (tenancy: TenancySummary) => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const [search, setSearch] = useState("");
  // Active tenancies only — a tenant's bills are always viewed in the context
  // of their current stay; past tenancies are out of scope here.
  const tenanciesQuery = useListPropertyTenanciesQuery({ propertyId }, { skip: !propertyId });
  const tenancies = tenanciesQuery.data ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return tenancies;
    }
    return tenancies.filter((t) =>
      [t.tenantName ?? "", t.tenantPhone ?? "", t.referenceCode].some((field) => field.toLowerCase().includes(needle)),
    );
  }, [search, tenancies]);

  return (
    <Section title={`${tenancies.length} tenant${tenancies.length === 1 ? "" : "s"}`}>
      <SearchField onChangeText={setSearch} placeholder="Search by tenant name, phone or tenancy ID" value={search} />

      {tenanciesQuery.isFetching && tenancies.length === 0 ? <SkeletonList rows={4} /> : null}

      {!tenanciesQuery.isFetching && filtered.length === 0 ? (
        <EmptyState
          icon={Users}

          title="No matching tenants"
          description={search ? "No active tenant matched that search." : "This property has no active tenancies."}
        />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {filtered.map((tenancy) => (
          <AnimatedPressable accessibilityRole="button" key={tenancy.id} onPress={() => onSelect(tenancy)}>
            <Card>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
                <View style={{ alignItems: "center", borderColor: colors.ink, borderRadius: 14, borderWidth: 1, height: 44, justifyContent: "center", width: 44 }}>
                  <ReceiptText color={colors.ink} size={20} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, }} numberOfLines={1}>
                    {tenancy.tenantName?.trim() || "Unnamed tenant"}
                  </Text>
                  <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
                    {tenancy.referenceCode}
                    {tenancy.tenantPhone ? ` · ${tenancy.tenantPhone}` : ""}
                  </Text>
                </View>
                <ChevronRight color={colors.muted} size={20} strokeWidth={2.2} />
              </View>
            </Card>
          </AnimatedPressable>
        ))}
      </View>
    </Section>
  );
}

function TenantBills({
  onChangeTenant,
  onFilterChange,
  onTotalChange,
  tenancy,
  visibleCount,
}: {
  onChangeTenant: () => void;
  /** Resets the reveal so a new filter starts from the top. */
  onFilterChange: () => void;
  /** Lets the scrolling parent know when to stop revealing. */
  onTotalChange: (total: number) => void;
  tenancy: TenancySummary;
  visibleCount: number;
}) {
  // Raising a one-off bill is BILLING_CYCLES at MANAGE. Blocked here rather
  // than left to fail on submit: the modal's error had no way to say "you are
  // not allowed", so it read as a bug.
  const { canManage: canManageResource } = usePropertyPermissions(tenancy.propertyId);
  const canManageBilling = canManageResource("BILLING_CYCLES");
  const { colors, type } = useTheme();
  const cyclesQuery = useListManagedTenancyBillingCyclesQuery(tenancy.id);
  const [filter, setFilter] = useState<BillFilter>("ALL");

  const all = useMemo(() => [...(cyclesQuery.data ?? [])].sort(compareByPeriodDesc), [cyclesQuery.data]);
  const filtered = filter === "ALL" ? all : all.filter((c) => c.category === filter);

  const rentCount = all.filter((c) => c.category === "RENT_CYCLE").length;
  const oneOffCount = all.filter((c) => c.category === "ONE_OFF").length;

  const visibleItems = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // The parent owns the scroll and therefore the reveal, but only this component
  // knows how long the filtered list is.
  useEffect(() => {
    onTotalChange(filtered.length);
  }, [filtered.length, onTotalChange]);

  function pick(next: BillFilter) {
    setFilter(next);
    onFilterChange();
  }

  return (
    <>
      <View style={{ flexDirection: "row" }}>
        <ActionButton icon={Users} label="Change tenant" onPress={onChangeTenant} variant="secondary" />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {FILTERS.map((entry) => (
          <FilterPill
            active={filter === entry.value}
            count={entry.value === "RENT_CYCLE" ? rentCount : entry.value === "ONE_OFF" ? oneOffCount : all.length}
            key={entry.value}
            label={entry.label}
            onPress={() => pick(entry.value)}
          />
        ))}
      </View>

      <Section title={`${filtered.length} bill${filtered.length === 1 ? "" : "s"}`}>
        {cyclesQuery.isFetching && all.length === 0 ? <SkeletonList rows={4} /> : null}

        {!cyclesQuery.isFetching && filtered.length === 0 ? (
          <EmptyState
            icon={ReceiptText}

            title="No bills in this filter"
            description={all.length === 0 ? "This tenant has no bills yet." : "Switch the filter above to see other bills."}
          />
        ) : null}

        <View style={{ gap: spacing.sm }}>
          {visibleItems.map((cycle) => (
            <BillCard cycle={cycle} key={cycle.id} />
          ))}
        </View>

        {/* A foot either way: still revealing, or genuinely the end. Without it
            the last bill just stops, and a finished list is indistinguishable
            from one that failed to extend. */}
        {hasMore ? (
          <ActivityIndicator color={colors.muted} />
        ) : filtered.length > 0 ? (
          <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
            That&apos;s all for now
          </Text>
        ) : null}
      </Section>

    </>
  );
}

// A charge that belongs to no rent cycle. It exists because a live cycle is
// frozen — once its window opens nothing can be added to it, so anything that
// cannot wait for the next cycle has to become a bill of its own.
function AddOneOffBillSheet({ onClose, tenancy }: { onClose: () => void; tenancy: TenancySummary }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [createOneOffBill, state] = useCreateOneOffBillMutation();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const form = useFormErrors<"amount" | "reason">();

  async function submit() {
    const trimmedReason = reason.trim();
    const rupees = Number(amount.trim());
    const cleared = form.validate({
      ...(Number.isFinite(rupees) && rupees > 0 ? {} : { amount: "Enter an amount greater than zero." }),
      ...(trimmedReason ? {} : { reason: "Add a reason so the tenant knows what this is for." }),
    });
    if (!cleared) {
      return;
    }
    try {
      await createOneOffBill({
        payload: { amountPaise: Math.round(rupees * 100), reason: trimmedReason },
        tenancyId: tenancy.id,
      }).unwrap();
      toast.success("One-off bill raised.");
      onClose();
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not raise the bill. Try again.");
    }
  }

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              gap: spacing.md,
              maxHeight: "88%",
              padding: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  One-off bill
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
                  Add a bill
                </Text>
              </View>
              <IconButton accessibilityLabel="Close add bill" icon={X} onPress={onClose} />
            </View>

            <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* An explanation, not a precaution — so the blue tone rather than
                  amber. NoticeBar takes plain text, which costs the bolded
                  "one-off bill"; the title says it instead. */}
              <NoticeBar
                message={`For ${tenancy.tenantName ?? "this tenant"} — it stands on its own and is due today, not part of any rent cycle. Use it when a charge cannot wait for the next cycle.`}
                title="This is a one-off bill"
                tone="info"
              />

              <FormInput
                error={form.errors.amount}
                keyboardType="decimal-pad"
                label="Amount"
                onChangeText={(next) => {
                  setAmount(next);
                  form.clearField("amount");
                }}
                placeholder="0"
                prefix="₹"
                required
                value={amount}
              />
              <FormInput
                error={form.errors.reason}
                label="Reason"
                maxLength={120}
                onChangeText={(next) => {
                  setReason(next);
                  form.clearField("reason");
                }}
                placeholder="Damage, cleaning, extra usage"
                required
                value={reason}
              />
            </ScrollView>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton label="Cancel" onPress={onClose} variant="secondary" />
              <ActionButton
                disabled={state.isLoading || form.blocked}
                icon={Plus}
                label={state.isLoading ? "Adding…" : "Add bill"}
                onPress={() => void submit()}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </Modal>
  );
}

function FilterPill({ active, count, label, onPress }: { active: boolean; count: number; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm - 2,
      }}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, }}>
        {label} · {count}
      </Text>
    </AnimatedPressable>
  );
}
