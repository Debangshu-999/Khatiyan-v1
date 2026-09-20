import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, Image, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, PartyPopper, Phone, Plus, ReceiptIndianRupee, ReceiptText, Sparkles, UserRound, Users, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";

import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { SheetShell } from "@/components/sheet-shell";
import { Section } from "@/components/section";
import { OwnerPaymentListSkeleton, OwnerTenancyListSkeleton } from "@/components/skeletons/owner";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { NoticeBar } from "@/features/owner/owner-ui";
import { ActionButton, FormInput, ViewOnlyChip } from "@/features/owner/owner-ui";
import { BillCard, compareByPeriodDesc } from "@/features/owner/bill-views";
import { useAppSelector } from "@/store/hooks";
import { useCreateOneOffBillMutation, useListManagedTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import { useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_PERSON_ILLUSTRATION = require("../assets/workspace/No-Person_512x512.png");

const NO_BILL_ILLUSTRATION = require("../assets/workspace/No-Bill_512x436.png");

const PAGE_SIZE = 8;
const TENANT_BILLS_HEADER_ILLUSTRATION = require("../assets/workspace/tenant-bills-header.png");

/** How close to the end before the next batch is revealed. */
const LOAD_MORE_THRESHOLD_PX = 220;

/**
 * Room left under the list for the pinned Add-bill footer.
 *
 * <p>More than the footer is tall: it overlays the list rather than sitting
 * below it, so anything less leaves the last bill half-covered with no way to
 * scroll it clear.
 */
const FOOTER_CLEARANCE = 174;

type BillFilter = "ALL" | "RENT_CYCLE" | "ONE_OFF";
const FILTERS: { label: string; value: BillFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Cycles", value: "RENT_CYCLE" },
  { label: "Other bills", value: "ONE_OFF" },
];

export default function OwnerTenantBillsScreen() {
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
    <View style={{ backgroundColor: colors.surface, flex: 1 }}>
    <ScreenScrollView
      background={
        <View style={{ backgroundColor: colors.surface, flex: 1 }}>
          <LinearGradient
            colors={[colors.primarySoft, colors.surface]}
            end={{ x: 0.5, y: 1 }}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            style={{ height: 230 }}
          />
        </View>
      }
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={{
        paddingBottom: selected ? FOOTER_CLEARANCE : undefined,
        paddingTop: spacing.xs,
      }}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      surface={colors.surface}
    >
      <TenantBillsHeader
        canManageBilling={canManageBilling}
        propertyName={property?.name ?? null}
        selectedTenantName={selected?.tenantName?.trim() || null}
      />

      {!property ? (
        <EmptyState
          icon={Users}

          title="No property selected"
          description="Choose an active property from Home before viewing tenant bills."
        />
      ) : selected ? (
        <TenantBills
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
          borderCurve: "continuous",
          borderTopColor: colors.border,
          borderTopLeftRadius: radii.card,
          borderTopRightRadius: radii.card,
          borderTopWidth: 1,
          bottom: 0,
          elevation: 12,
          gap: spacing.sm,
          left: 0,
          paddingBottom: insets.bottom + spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          position: "absolute",
          right: 0,
          shadowColor: colors.shadow,
          shadowOffset: { height: -4, width: 0 },
          shadowOpacity: 1,
          shadowRadius: 14,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Sparkles color={colors.primary} size={19} strokeWidth={2} />
          <Text style={[type.caption, { color: colors.muted, flex: 1, lineHeight: 19 }]}>
            {canManageBilling
              ? `Raises a one-off bill for ${selected.tenantName?.trim() || "this tenant"}, separate from rent cycles.`
              : "You have view-only access to billing, so you cannot raise a bill."}
          </Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <ActionButton
            disabled={!canManageBilling}
            icon={Plus}
            label="Add bill"
            onPress={() => setAddOpen(true)}
          />
        </View>
      </View>
    ) : null}

    {addOpen && selected ? <AddOneOffBillSheet onClose={() => setAddOpen(false)} tenancy={selected} /> : null}
    </View>
  );
}

function TenantBillsHeader({
  canManageBilling,
  propertyName,
  selectedTenantName,
}: {
  canManageBilling: boolean;
  propertyName: string | null;
  selectedTenantName: string | null;
}) {
  const { colors, type } = useTheme();
  const description = selectedTenantName
    ? propertyName
      ? `All bills in ${selectedTenantName}'s current tenancy at ${propertyName}.`
      : `All bills in ${selectedTenantName}'s current tenancy.`
    : propertyName
      ? `Pick an active tenant to see all bills in their current tenancy at ${propertyName}.`
      : "Select a property from Home to view tenant bills.";

  return (
    <View style={{ minHeight: 108, position: "relative" }}>
      <View style={{ gap: spacing.sm, paddingRight: 146 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={[type.brand, { color: colors.ink, flexShrink: 1, fontSize: 29, lineHeight: 35 }]}
          >
            Tenant
            <Text style={[type.brandItalic, { color: colors.accent, fontSize: 29, lineHeight: 35 }]}> bills.</Text>
          </Text>
          {!canManageBilling ? <ViewOnlyChip /> : null}
        </View>

        <View style={{ alignItems: "stretch", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ backgroundColor: colors.accent, borderRadius: 999, width: 3 }} />
          <Text
            style={[
              type.body,
              {
                color: colors.muted,
                flex: 1,
                fontSize: 14,
                fontStyle: "italic",
                lineHeight: 20,
              },
            ]}
          >
            {description}
          </Text>
        </View>
      </View>

      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={TENANT_BILLS_HEADER_ILLUSTRATION}
        style={{ height: 100, position: "absolute", right: -2, top: 3, width: 150 }}
      />
    </View>
  );
}

function TenantCountHeading({ count }: { count: number }) {
  const { colors, fonts } = useTheme();
  const label = `${count} tenant${count === 1 ? "" : "s"}`;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, lineHeight: 27 }}>{label}</Text>
        <View style={{ backgroundColor: colors.accent, borderRadius: 999, height: 3, width: 24 }} />
      </View>
      <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1 }} />
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
    <View style={{ gap: spacing.md }}>
      <TenantCountHeading count={tenancies.length} />
      <SearchField onChangeText={setSearch} placeholder="Search by tenant name, phone or tenancy ID" value={search} />

      {tenanciesQuery.isFetching && tenancies.length === 0 ? <OwnerTenancyListSkeleton rows={4} /> : null}

      {!tenanciesQuery.isFetching && filtered.length === 0 ? (
        <EmptyState
          artwork={NO_PERSON_ILLUSTRATION}
          title="No matching tenants"
          description={search ? "No active tenant matched that search." : "This property has no active tenancies."}
        />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {filtered.map((tenancy) => {
          const tenantName = tenancy.tenantName?.trim() || "Unnamed tenant";
          const phone = tenancy.tenantPhone?.trim() || "";

          return (
            <AnimatedPressable
              accessibilityLabel={`View bills for ${tenantName}`}
              accessibilityRole="button"
              key={tenancy.id}
              onPress={() => onSelect(tenancy)}
            >
              <Card style={{ borderRadius: 14, padding: spacing.md }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
                  <View style={{ height: 58, position: "relative", width: 58 }}>
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.primarySoft,
                        borderRadius: 999,
                        height: 56,
                        justifyContent: "center",
                        width: 56,
                      }}
                    >
                      <UserRound color={colors.primaryDeep} size={31} strokeWidth={2} />
                    </View>
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.primary,
                        borderColor: colors.surface,
                        borderRadius: 999,
                        borderWidth: 2,
                        bottom: 0,
                        height: 23,
                        justifyContent: "center",
                        position: "absolute",
                        right: 0,
                        width: 23,
                      }}
                    >
                      <ReceiptIndianRupee color="#FFFFFF" size={12} strokeWidth={2.3} />
                    </View>
                  </View>

                  <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, lineHeight: 22 }}
                    >
                      {tenantName}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
                      {tenancy.referenceCode}
                    </Text>
                    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
                      <Phone color={colors.muted} size={13} strokeWidth={2.2} />
                      <Text numberOfLines={1} style={[type.caption, { color: colors.muted, flex: 1 }]}>
                        {phone || "Phone not added"}
                      </Text>
                    </View>
                  </View>

                  <ChevronRight color={colors.ink} size={21} strokeWidth={2.4} />
                </View>
              </Card>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function TenantBills({
  onFilterChange,
  onTotalChange,
  tenancy,
  visibleCount,
}: {
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
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
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
        {cyclesQuery.isFetching && all.length === 0 ? <OwnerPaymentListSkeleton rows={4} /> : null}

        {!cyclesQuery.isFetching && filtered.length === 0 ? (
          <EmptyState
            artwork={NO_BILL_ILLUSTRATION}
            title="No bills in this filter"
            description={all.length === 0 ? "This tenant has no bills yet." : "Switch the filter above to see other bills."}
          />
        ) : null}

        <View style={{ gap: spacing.sm }}>
          {visibleItems.map((cycle) => (
            <BillCard cycle={cycle} key={cycle.id} />
          ))}
        </View>

        {hasMore ? (
          <ActivityIndicator color={colors.muted} />
        ) : filtered.length > 0 ? (
          <View style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.primarySoft,
                borderColor: colors.border,
                borderRadius: 999,
                borderWidth: 1,
                height: 36,
                justifyContent: "center",
                width: 36,
              }}
            >
              <PartyPopper color={colors.primary} size={18} strokeWidth={2} />
            </View>
            <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>That&apos;s all for now</Text>
          </View>
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
    // SheetShell, not a hand-rolled Modal. This sheet built its own shell with
    // `KeyboardAvoidingView behavior="padding"` on BOTH platforms, and that is
    // broken on Android under edge-to-edge: the avoider infers the keyboard
    // height from screen-minus-window, edge-to-edge makes the window the whole
    // display, and its padding never returns to zero on dismissal — the sheet
    // stays shoved up the screen after the keyboard closes. SheetShell measures
    // the keyboard itself and applies the avoider on iOS only.
    <>
      <SheetShell onClose={onClose} title="Add a bill">
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

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton label="Cancel" onPress={onClose} variant="secondary" />
          <ActionButton
            disabled={state.isLoading || form.blocked}
            icon={Plus}
            label={state.isLoading ? "Adding…" : "Add bill"}
            onPress={() => void submit()}
          />
        </View>
      </SheetShell>

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </>
  );
}

function FilterPill({ active, count, label, onPress }: { active: boolean; count: number; label: string; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primarySoft : colors.surfaceSunken,
        borderCurve: "continuous",
        borderRadius: 999,
        flex: 1,
        justifyContent: "center",
        minHeight: 42,
        minWidth: 0,
        paddingHorizontal: spacing.xs,
      }}
    >
      <Text
        numberOfLines={1}
        style={[
          type.caption,
          {
            color: active ? colors.primaryDeep : colors.muted,
            fontFamily: fonts.sansSemiBold,
            fontSize: 12,
          },
        ]}
      >
        {label} ({count})
      </Text>
      <View
        style={{
          backgroundColor: active ? colors.primary : "transparent",
          borderRadius: 999,
          height: 2.5,
          marginTop: 3,
          width: 18,
        }}
      />
    </AnimatedPressable>
  );
}
