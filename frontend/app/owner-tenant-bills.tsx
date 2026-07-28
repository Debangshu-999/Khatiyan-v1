import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ChevronRight, ReceiptText, Users } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import { SkeletonList } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ActionButton } from "@/features/owner/owner-ui";
import { BillCard, compareByPeriodDesc } from "@/features/owner/bill-views";
import { useAppSelector } from "@/store/hooks";
import { useListManagedTenancyBillingCyclesQuery } from "@/store/services/billing-api";
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

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
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
                <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 14, height: 44, justifyContent: "center", width: 44 }}>
                  <ReceiptText color={colors.primary} size={20} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "600" }} numberOfLines={1} selectable>
                    {tenancy.tenantName?.trim() || "Unnamed tenant"}
                  </Text>
                  <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>
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
  const cyclesQuery = useListManagedTenancyBillingCyclesQuery(tenancy.id);
  const [filter, setFilter] = useState<BillFilter>("ALL");
  const [page, setPage] = useState(0);

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
    </>
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
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "800" }} selectable>
        {label} · {count}
      </Text>
    </AnimatedPressable>
  );
}
