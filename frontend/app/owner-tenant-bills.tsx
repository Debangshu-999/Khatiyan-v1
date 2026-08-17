import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ChevronRight, Plus, ReceiptText, Users, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import { SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ActionButton, FormInput, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { BillCard, compareByPeriodDesc } from "@/features/owner/bill-views";
import { useAppSelector } from "@/store/hooks";
import { useCreateOneOffBillMutation, useListManagedTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import { useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PAGE_SIZE = 8;

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

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        badge={!canManageBilling ? <ViewOnlyChip /> : null}
        onBack={() => (selected ? setSelected(null) : router.back())}
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
          eyebrow="Property required"
          title="No property selected"
          description="Choose an active property from Home before viewing tenant bills."
        />
      ) : selected ? (
        <TenantBills onChangeTenant={() => setSelected(null)} tenancy={selected} />
      ) : (
        <TenantPicker onSelect={setSelected} propertyId={propertyId} />
      )}
    </ScreenScrollView>
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
    <Section eyebrow="Select tenant" title={`${tenancies.length} tenant${tenancies.length === 1 ? "" : "s"}`}>
      <SearchField onChangeText={setSearch} placeholder="Search by tenant name, phone or tenancy ID" value={search} />

      {tenanciesQuery.isFetching && tenancies.length === 0 ? <SkeletonList rows={4} /> : null}

      {!tenanciesQuery.isFetching && filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          eyebrow="No tenants"
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

function TenantBills({ onChangeTenant, tenancy }: { onChangeTenant: () => void; tenancy: TenancySummary }) {
  // Raising a one-off bill is BILLING_CYCLES at MANAGE. Blocked here rather
  // than left to fail on submit: the modal's error had no way to say "you are
  // not allowed", so it read as a bug.
  const { canManage: canManageResource } = usePropertyPermissions(tenancy.propertyId);
  const canManageBilling = canManageResource("BILLING_CYCLES");
  const { colors, type } = useTheme();
  const cyclesQuery = useListManagedTenancyBillingCyclesQuery(tenancy.id);
  const [filter, setFilter] = useState<BillFilter>("ALL");
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  const all = useMemo(() => [...(cyclesQuery.data ?? [])].sort(compareByPeriodDesc), [cyclesQuery.data]);
  const filtered = filter === "ALL" ? all : all.filter((c) => c.category === filter);

  const rentCount = all.filter((c) => c.category === "RENT_CYCLE").length;
  const oneOffCount = all.filter((c) => c.category === "ONE_OFF").length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function pick(next: BillFilter) {
    setFilter(next);
    setPage(0);
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

      <Section eyebrow={tenancy.referenceCode} title={`${filtered.length} bill${filtered.length === 1 ? "" : "s"}`}>
        {cyclesQuery.isFetching && all.length === 0 ? <SkeletonList rows={4} /> : null}

        {!cyclesQuery.isFetching && filtered.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            eyebrow="No bills"
            title="No bills in this filter"
            description={all.length === 0 ? "This tenant has no bills yet." : "Switch the filter above to see other bills."}
          />
        ) : null}

        <View style={{ gap: spacing.sm }}>
          {pageItems.map((cycle) => (
            <BillCard cycle={cycle} key={cycle.id} />
          ))}
        </View>

        {filtered.length > 0 ? (
          <PaginationBar
            hasNext={safePage + 1 < totalPages}
            hasPrevious={safePage > 0}
            onNext={() => setPage(safePage + 1)}
            onPrevious={() => setPage(Math.max(0, safePage - 1))}
            page={safePage}
            totalElements={filtered.length}
            totalPages={totalPages}
          />
        ) : null}
      </Section>

      {/* Pinned under the list: raising a bill is the one thing you come to this
          screen to DO, everything above it is reading. */}
      <View style={{ gap: spacing.sm }}>
        <ActionButton
          disabled={!canManageBilling}
          icon={Plus}
          label="Add bill"
          onPress={() => setAddOpen(true)}
        />
        <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
          {canManageBilling
            ? `Raises a one-off bill for ${tenancy.tenantName ?? "this tenant"}, separate from their rent cycles.`
            : "You have view-only access to billing, so you cannot raise a bill."}
        </Text>
      </View>

      {addOpen ? <AddOneOffBillSheet onClose={() => setAddOpen(false)} tenancy={tenancy} /> : null}
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
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Add a reason so the tenant knows what this is for.");
      return;
    }
    const rupees = Number(amount.trim());
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setError(null);
    try {
      await createOneOffBill({
        payload: { amountPaise: Math.round(rupees * 100), reason: trimmedReason },
        tenancyId: tenancy.id,
      }).unwrap();
      toast.success("One-off bill raised.");
      onClose();
    } catch (error) {
      const message = (error as { data?: { message?: string } })?.data?.message;
      setError(message ?? "Could not raise the bill. Try again.");
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: 22,
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
              <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, padding: spacing.md }}>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  This is a <Text style={{ color: colors.ink, fontWeight: "800" }}>one-off bill</Text> for{" "}
                  {tenancy.tenantName ?? "this tenant"} — it stands on its own and is due today, not part of any rent
                  cycle. Use it when a charge cannot wait for the next cycle.
                </Text>
              </View>

              <FormInput
                keyboardType="decimal-pad"
                label="Amount"
                onChangeText={(next) => {
                  setAmount(next);
                  setError(null);
                }}
                placeholder="0"
                prefix="₹"
                value={amount}
              />
              <FormInput
                label="Reason"
                maxLength={120}
                onChangeText={(next) => {
                  setReason(next);
                  setError(null);
                }}
                placeholder="Damage, cleaning, extra usage"
                value={reason}
              />

              {error ? (
                <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]}>
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton label="Cancel" onPress={onClose} variant="secondary" />
              <ActionButton
                disabled={state.isLoading}
                icon={Plus}
                label={state.isLoading ? "Adding…" : "Add bill"}
                onPress={() => void submit()}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
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
