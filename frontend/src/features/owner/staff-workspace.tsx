import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { ArrowLeftRight, Banknote, BriefcaseBusiness, CalendarCheck, ChevronRight, CirclePlus, Pencil, Plus, ReceiptText, Search, Trash2, UsersRound, WalletCards, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { ActionButton, BackButton, ChoiceButton, ConfirmDialog, FormInput, IconButton, formatMoneyPaise, paiseToRupees, rupeesToPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  useAddPropertyManagerMutation,
  useLazyLookupManagerQuery,
  useListMyPropertiesQuery,
  useListPropertyManagersQuery,
  useShiftPropertyManagerMutation,
  type ManagerLookup,
  type OwnerProperty,
  type PropertyManager,
} from "@/store/services/property-api";
import {
  useAddSalaryAdjustmentMutation,
  useCreateStaffCategoryMutation,
  useDeactivateStaffCategoryMutation,
  useCreateStaffMemberMutation,
  useEndManagerEmploymentMutation,
  useEndStaffMemberMutation,
  useGetMyManagerEmploymentQuery,
  useGetMySalaryAccountQuery,
  useListEmployeeHistoryQuery,
  useListManagerEmploymentQuery,
  useListSalaryAccountsQuery,
  useListStaffCategoriesQuery,
  useListStaffDirectoryQuery,
  useListStaffMembersQuery,
  useManagerTerminationPreviewQuery,
  useOpenManagerSalaryAccountMutation,
  useOpenSalaryMonthMutation,
  useOpenStaffSalaryAccountMutation,
  useRecordSalaryPaymentMutation,
  useRemoveSalaryAdjustmentMutation,
  useStaffTerminationPreviewQuery,
  useUpdateManagerEmploymentMutation,
  useUpdateSalaryAdjustmentMutation,
  useUpdateStaffMemberMutation,
  type EmployeeHistoryItem,
  type EndEmploymentPayload,
  type ManagerEmployment,
  type SalaryAccountDetail,
  type SalaryAdjustment,
  type SalaryAdjustmentType,
  type SalaryPaymentMethod,
  type SalaryStructure,
  type StaffCategory,
  type StaffMember,
} from "@/store/services/staff-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type WorkspaceTab = "TEAM" | "SALARY" | "HISTORY";
type PersonTarget =
  | { kind: "MANAGER"; person: ManagerEmployment }
  | { kind: "STAFF_MEMBER"; person: StaffMember };

type ManagerDirectoryEntry = {
  assignment: PropertyManager;
  employment: ManagerEmployment | null;
};
type EndTarget = {
  kind: "STAFF" | "MANAGER";
  referenceCode: string;
  name: string;
  salaryStructure: SalaryStructure;
};
type ModalFeedback = {
  tone: "error" | "success";
  message: string;
};

export function StaffWorkspace() {
  const router = useRouter();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const properties = useListMyPropertiesQuery().data ?? [];
  const property = resolveSelectedProperty(properties, selectedPropertyId);
  const isOwner = Boolean(property && currentUserId === property.ownerId);
  const [tab, setTab] = useState<WorkspaceTab>("TEAM");

  if (!property) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <BackButton onPress={() => router.back()} />
        <EmptyState icon={UsersRound} eyebrow="Staff" title="Choose a property" description="Select one of your properties from Home to manage its team." />
      </ScreenScrollView>
    );
  }

  // Managers get a read-only view of their own record + a redacted directory.
  if (!isOwner) {
    return <ManagerStaffView onBack={() => router.back()} property={property} />;
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ gap: spacing.lg }}>
      <BackButton onPress={() => router.back()} />
      <ScreenHeader title="Staff" italicTail="management." subtitle={property.name} />

      <SegmentBar
        options={[
          { key: "TEAM", label: "Team" },
          { key: "SALARY", label: "Salary" },
          { key: "HISTORY", label: "History" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "TEAM" ? <TeamDirectory property={property} /> : tab === "SALARY" ? <SalaryTracker property={property} /> : <EmployeeHistory property={property} />}
    </ScreenScrollView>
  );
}

// Read-only staff view for an assigned manager: their own employment record and
// salary account, plus a redacted staff directory. No editing anywhere.
function ManagerStaffView({ onBack, property }: { onBack: () => void; property: OwnerProperty }) {
  const { colors, type } = useTheme();
  const employmentQuery = useGetMyManagerEmploymentQuery(property.id);
  const salaryQuery = useGetMySalaryAccountQuery(property.id);
  const directory = useListStaffDirectoryQuery(property.id).data ?? [];
  const employment = employmentQuery.data;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ gap: spacing.lg }}>
      <BackButton onPress={onBack} />
      <ScreenHeader title="Staff" italicTail="management." subtitle={property.name} />

      <Section eyebrow="Your record" title="My employment">
        {employmentQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : employment ? (
          <Card>
            <View style={{ gap: spacing.sm }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
                <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 14, height: 48, justifyContent: "center", width: 48 }}>
                  <BriefcaseBusiness color={colors.primary} size={22} strokeWidth={2.1} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 18 }]} selectable>{employment.fullName}</Text>
                  <Text style={[type.caption, { color: colors.muted }]} selectable>{employment.referenceCode}  ·  {employment.phone}</Text>
                </View>
              </View>
              <DetailRow label="Salary" value={salaryRateLabel(employment.salaryStructure, employment.salaryRatePaise)} />
              <DetailRow label="Start date" value={employment.employmentStartDate ? formatDate(employment.employmentStartDate) : "Not set"} />
              {employment.employmentEndDate ? <DetailRow label="End date" value={formatDate(employment.employmentEndDate)} /> : null}
              <DetailRow label="Verification" value={employment.identityVerificationStatus.replaceAll("_", " ")} />
              <DetailRow label="Benefits" value={employment.benefitsSummary || "None recorded"} />
              {employment.employmentNotes ? <DetailRow label="Notes" value={employment.employmentNotes} /> : null}
              <Text style={[type.caption, { color: colors.kicker }]} selectable>Only the property owner can change these details.</Text>
            </View>
          </Card>
        ) : (
          <EmptyState description="Your employment record could not be loaded." icon={BriefcaseBusiness} title="No record found" />
        )}
      </Section>

      <Section eyebrow="Your pay" title="My salary account">
        {salaryQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : salaryQuery.data ? (
          <SalaryAccountDetailCard detail={salaryQuery.data} readOnly />
        ) : (
          <EmptyState description="The owner has not opened a salary account for you yet." icon={WalletCards} title="No salary account yet" />
        )}
      </Section>

      <Section eyebrow="Team" title={`${directory.length} staff member${directory.length === 1 ? "" : "s"}`}>
        {directory.length ? directory.map((member) => (
          <View key={member.referenceCode} style={rowCardStyle(colors)}>
            <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderCurve: "continuous", borderRadius: 13, height: 46, justifyContent: "center", width: 46 }}>
              <UsersRound color={colors.primary} size={20} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1} selectable>{member.categoryName}</Text>
              <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1} selectable>{member.fullName}</Text>
              <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>{member.identityVerificationStatus.replaceAll("_", " ")}</Text>
            </View>
          </View>
        )) : (
          <EmptyState description="No staff members have been added to this property yet." icon={UsersRound} title="No staff members" />
        )}
      </Section>
    </ScreenScrollView>
  );
}

function TeamDirectory({ property }: { property: OwnerProperty }) {
  const toast = useToast();
  const categories = useListStaffCategoriesQuery(property.id).data ?? [];
  const managerEmployment = useListManagerEmploymentQuery(property.id).data ?? [];
  const assignments = useListPropertyManagersQuery(property.id).data ?? [];
  const members = useListStaffMembersQuery({ propertyId: property.id }).data ?? [];
  const allProperties = useListMyPropertiesQuery().data ?? [];
  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const [deactivateCategory] = useDeactivateStaffCategoryMutation();
  const [shiftManager] = useShiftPropertyManagerMutation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [addManagerOpen, setAddManagerOpen] = useState(false);
  const [memberEditor, setMemberEditor] = useState<StaffMember | null | "NEW">(null);
  const [managerEditor, setManagerEditor] = useState<ManagerEmployment | null>(null);
  const [managerDetail, setManagerDetail] = useState<ManagerDirectoryEntry | null>(null);
  const [endTarget, setEndTarget] = useState<EndTarget | null>(null);
  const [pendingShift, setPendingShift] = useState<{ entry: ManagerDirectoryEntry; target: OwnerProperty } | null>(null);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<StaffCategory | null>(null);

  const managersByPhone = useMemo(
    () => new Map(managerEmployment.map((manager) => [manager.phone, manager])),
    [managerEmployment],
  );
  const managerEntries = assignments.map((assignment) => ({
    assignment,
    employment: managersByPhone.get(assignment.managerPhone) ?? null,
  }));
  const filteredMembers = selectedCategory
    ? members.filter((member) => member.categoryName === selectedCategory)
    : members;
  const shiftTargets = allProperties.filter((candidate) => candidate.ownerId === currentUserId && candidate.id !== property.id);

  async function confirmDeleteCategory() {
    const category = pendingDeleteCategory;
    setPendingDeleteCategory(null);
    if (!category) return;
    try {
      await deactivateCategory({ categoryId: category.id, propertyId: property.id }).unwrap();
      if (selectedCategory === category.name) {
        setSelectedCategory(null);
      }
      toast.show(`${category.name} category deleted.`);
    } catch (error) {
      toast.error(errorMessage(error, `"${category.name}" still has staff members, so it can't be deleted.`));
    }
  }
  async function confirmShift() {
    if (!pendingShift) return;
    try {
      await shiftManager({
        propertyId: property.id,
        managerUserId: pendingShift.entry.assignment.managerUserId,
        targetPropertyId: pendingShift.target.id,
      }).unwrap();
      setPendingShift(null);
      toast.show("Manager transferred successfully.");
    } catch (error) {
      toast.show(errorMessage(error, "Could not transfer the manager."));
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>

      <Section eyebrow="Managers" title={`${managerEntries.length} assigned`} trailing={<View style={{ width: 104 }}><ActionButton icon={Plus} label="Add" onPress={() => setAddManagerOpen(true)} variant="secondary" /></View>}>
        {managerEntries.length ? managerEntries.map((entry) => (
          <ManagerCard
            entry={entry}
            key={entry.assignment.id}
            onEdit={() => entry.employment ? setManagerEditor(entry.employment) : toast.show("Employment details are still loading. Pull down to refresh.")}
            onOpen={() => setManagerDetail(entry)}
          />
        )) : (
          <EmptyState description="Assign a real app user as a manager for this property." icon={BriefcaseBusiness} title="No managers assigned" />
        )}
      </Section>

      <Section eyebrow="Staff members" title={`${filteredMembers.length} tracked`} trailing={<View style={{ width: 144 }}><ActionButton icon={Plus} label="Add member" onPress={() => setMemberEditor("NEW")} variant="secondary" /></View>}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <CategoryButton active={!selectedCategory} label="All staff" onPress={() => setSelectedCategory(null)} />
          {categories.map((category) => (
            <CategoryButton
              active={selectedCategory === category.name}
              key={category.id}
              label={category.name}
              onDelete={category.system ? undefined : () => setPendingDeleteCategory(category)}
              onPress={() => setSelectedCategory(category.name)}
            />
          ))}
          <CategoryButton icon={Plus} label="New category" onPress={() => setCreateCategoryOpen(true)} />
        </View>
        {filteredMembers.length ? filteredMembers.map((member) => (
          <PersonCard
            key={member.referenceCode}
            icon={UsersRound}
            meta={`${member.referenceCode} - ${member.categoryName}`}
            title={member.fullName}
            subtitle={`${salaryRateLabel(member.salaryStructure, member.salaryRatePaise)} - ${member.identityVerificationStatus}`}
            onPress={() => setMemberEditor(member)}
          />
        )) : (
          <EmptyState description="Create a personnel record to track employment and manual salary history." icon={UsersRound} title={selectedCategory ? `No ${selectedCategory.toLowerCase()} staff` : "No staff members added"} />
        )}
      </Section>

      {createCategoryOpen ? <CreateCategoryModal onClose={() => setCreateCategoryOpen(false)} propertyId={property.id} /> : null}
      {addManagerOpen ? <AddManagerModal onClose={() => setAddManagerOpen(false)} propertyId={property.id} /> : null}
      {memberEditor ? (
        <StaffMemberModal
          categories={categories}
          member={memberEditor === "NEW" ? null : memberEditor}
          onClose={() => setMemberEditor(null)}
          onEnd={
            memberEditor !== "NEW"
              ? () => {
                  const target = memberEditor;
                  setMemberEditor(null);
                  setEndTarget({ kind: "STAFF", name: target.fullName, referenceCode: target.referenceCode, salaryStructure: target.salaryStructure });
                }
              : undefined
          }
          propertyId={property.id}
        />
      ) : null}
      {managerEditor ? <ManagerEmploymentModal manager={managerEditor} onClose={() => setManagerEditor(null)} propertyId={property.id} /> : null}
      {managerDetail ? (
        <ManagerDetailModal
          entry={managerDetail}
          onClose={() => setManagerDetail(null)}
          onEdit={() => {
            if (!managerDetail.employment) {
              toast.show("Employment details are still loading. Pull down to refresh.");
              return;
            }
            setManagerDetail(null);
            setManagerEditor(managerDetail.employment);
          }}
          onRemove={() => {
            const entry = managerDetail;
            if (!entry.employment) {
              toast.show("Employment details are still loading. Pull down to refresh.");
              return;
            }
            setManagerDetail(null);
            setEndTarget({ kind: "MANAGER", name: entry.assignment.managerFullName, referenceCode: entry.employment.referenceCode, salaryStructure: entry.employment.salaryStructure });
          }}
          onShift={(target) => {
            const entry = managerDetail;
            setManagerDetail(null);
            setPendingShift({ entry, target });
          }}
          shiftTargets={shiftTargets}
        />
      ) : null}
      {endTarget ? <EndEmploymentSheet onClose={() => setEndTarget(null)} propertyId={property.id} target={endTarget} /> : null}
      {pendingShift ? <ConfirmDialog confirmLabel="Transfer" message={`Transfer ${pendingShift.entry.assignment.managerFullName} to ${pendingShift.target.name}?`} onCancel={() => setPendingShift(null)} onConfirm={() => void confirmShift()} title="Transfer manager?" /> : null}
      {pendingDeleteCategory ? <ConfirmDialog confirmLabel="Delete" destructive message={`Delete the "${pendingDeleteCategory.name}" category? This only works if no staff are assigned to it.`} onCancel={() => setPendingDeleteCategory(null)} onConfirm={() => void confirmDeleteCategory()} title="Delete category?" /> : null}
    </View>
  );
}

type SalaryFilter = "ALL" | "MANAGER" | "STAFF";
type AdjustmentTarget = "NEW" | { payrollMonth: string; adjustment: SalaryAdjustment };

function SalaryTracker({ property }: { property: OwnerProperty }) {
  const { colors } = useTheme();
  const toast = useToast();
  const managers = useListManagerEmploymentQuery(property.id).data ?? [];
  const members = useListStaffMembersQuery({ propertyId: property.id }).data ?? [];
  const accounts = useListSalaryAccountsQuery(property.id).data ?? [];
  const [openStaffAccount, staffAccountState] = useOpenStaffSalaryAccountMutation();
  const [openManagerAccount, managerAccountState] = useOpenManagerSalaryAccountMutation();
  const [removeAdjustment] = useRemoveSalaryAdjustmentMutation();
  const [selected, setSelected] = useState<SalaryAccountDetail | null>(null);
  const [filter, setFilter] = useState<SalaryFilter>("ALL");
  const [monthOpen, setMonthOpen] = useState(false);
  const [adjustmentTarget, setAdjustmentTarget] = useState<AdjustmentTarget | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pendingDeleteAdjustment, setPendingDeleteAdjustment] = useState<{ payrollMonth: string; adjustmentId: string } | null>(null);
  const loading = staffAccountState.isLoading || managerAccountState.isLoading;

  const accountByHolder = useMemo(() => new Map(accounts.map((account) => [account.holderReferenceCode, account])), [accounts]);

  async function selectPerson(target: PersonTarget) {
    try {
      const detail = target.kind === "MANAGER"
        ? await openManagerAccount({ managerReferenceCode: target.person.referenceCode, propertyId: property.id }).unwrap()
        : await openStaffAccount({ propertyId: property.id, staffReferenceCode: target.person.referenceCode }).unwrap();
      setSelected(detail);
    } catch (error) {
      toast.show(errorMessage(error, "Complete employment details before opening this salary account."));
    }
  }

  async function confirmDeleteAdjustment() {
    const target = pendingDeleteAdjustment;
    setPendingDeleteAdjustment(null);
    if (!target || !selected) return;
    try {
      setSelected(await removeAdjustment({ accountReferenceCode: selected.account.referenceCode, adjustmentId: target.adjustmentId, payrollMonth: target.payrollMonth, propertyId: property.id }).unwrap());
    } catch (error) {
      toast.show(errorMessage(error, "Could not remove the adjustment."));
    }
  }

  const people: PersonTarget[] = [
    ...managers.map((person) => ({ kind: "MANAGER" as const, person })),
    ...members.map((person) => ({ kind: "STAFF_MEMBER" as const, person })),
  ];
  const visiblePeople = people.filter(
    (entry) => filter === "ALL" || (filter === "MANAGER" ? entry.kind === "MANAGER" : entry.kind === "STAFF_MEMBER"),
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <Section eyebrow="Choose member" title="Salary accounts">
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ChoiceButton active={filter === "ALL"} label="All" onPress={() => setFilter("ALL")} />
          <ChoiceButton active={filter === "MANAGER"} label="Managers" onPress={() => setFilter("MANAGER")} />
          <ChoiceButton active={filter === "STAFF"} label="Other staff" onPress={() => setFilter("STAFF")} />
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {visiblePeople.map((target) => {
          // Daily-wage employees never get a salary account — we just show their
          // computed payable for the current month (days in month × daily rate).
          if (target.person.salaryStructure === "DAILY") {
            return <DailyPayableCard key={`${target.kind}-${target.person.referenceCode}`} kind={target.kind} person={target.person} />;
          }
          const account = accountByHolder.get(target.person.referenceCode);
          return (
            <PersonCard
              key={`${target.kind}-${target.person.referenceCode}`}
              icon={target.kind === "MANAGER" ? BriefcaseBusiness : UsersRound}
              meta={target.kind === "MANAGER" ? "Manager" : target.person.categoryName}
              title={target.person.fullName}
              subtitle={`${salaryRateLabel(target.person.salaryStructure, target.person.salaryRatePaise)}${account ? "  ·  Account open" : ""}`}
              onPress={() => void selectPerson(target)}
            />
          );
        })}
        {!visiblePeople.length ? (
          <EmptyState
            description="Salary accounts become available after a manager or staff member has been added."
            icon={WalletCards}
            title={people.length ? "Nobody in this filter" : "Add a manager or staff member first"}
          />
        ) : null}
      </Section>

      {selected ? (
        <SalaryAccountDetailCard
          detail={selected}
          onAddAdjustment={() => setAdjustmentTarget("NEW")}
          onClose={() => setSelected(null)}
          onDeleteAdjustment={(payrollMonth, adjustmentId) => setPendingDeleteAdjustment({ adjustmentId, payrollMonth })}
          onEditAdjustment={(payrollMonth, adjustment) => setAdjustmentTarget({ adjustment, payrollMonth })}
          onOpenMonth={() => setMonthOpen(true)}
          onRecordPay={() => setPaymentOpen(true)}
        />
      ) : null}

      {selected && monthOpen ? <OpenMonthModal account={selected} onClose={() => setMonthOpen(false)} onSaved={setSelected} propertyId={property.id} /> : null}
      {selected && adjustmentTarget ? (
        <AdjustmentModal
          account={selected}
          editing={adjustmentTarget === "NEW" ? null : adjustmentTarget}
          onClose={() => setAdjustmentTarget(null)}
          onSaved={setSelected}
          propertyId={property.id}
        />
      ) : null}
      {selected && paymentOpen ? <SalaryPaymentModal account={selected} onClose={() => setPaymentOpen(false)} onSaved={setSelected} propertyId={property.id} /> : null}
      {pendingDeleteAdjustment ? (
        <ConfirmDialog
          confirmLabel="Delete"
          destructive
          message="Delete this salary adjustment? This cannot be undone."
          onCancel={() => setPendingDeleteAdjustment(null)}
          onConfirm={() => void confirmDeleteAdjustment()}
          title="Delete adjustment?"
        />
      ) : null}
    </View>
  );
}

// Salary account detail, reused by the owner tracker (editable) and the manager
// self-view (read-only — no action buttons or per-adjustment edit/delete).
function SalaryAccountDetailCard({
  detail,
  onAddAdjustment,
  onClose,
  onDeleteAdjustment,
  onEditAdjustment,
  onOpenMonth,
  onRecordPay,
  readOnly = false,
}: {
  detail: SalaryAccountDetail;
  onAddAdjustment?: () => void;
  onClose?: () => void;
  onDeleteAdjustment?: (payrollMonth: string, adjustmentId: string) => void;
  onEditAdjustment?: (payrollMonth: string, adjustment: SalaryAdjustment) => void;
  onOpenMonth?: () => void;
  onRecordPay?: () => void;
  readOnly?: boolean;
}) {
  const { colors, type } = useTheme();
  const { account, months } = detail;
  const currentMonthOpened = months.some((month) => month.payrollMonth === firstOfMonth());

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>{account.referenceCode}</Text>
            <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 20 }]} selectable>{account.holderName}</Text>
            <Text style={[type.caption, { color: colors.muted }]} selectable>{account.categoryName}  ·  {salaryRateLabel(account.salaryStructure, account.salaryRatePaise)}</Text>
          </View>
          {onClose ? <IconButton accessibilityLabel="Close salary account" icon={X} onPress={onClose} /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <AmountMetric label="Gross to date" value={formatMoneyPaise(account.grossPayToDatePaise)} />
          <AmountMetric label="Paid to date" value={formatMoneyPaise(account.paidToDatePaise)} />
        </View>
        {!readOnly ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={currentMonthOpened} icon={currentMonthOpened ? CalendarCheck : CirclePlus} label={currentMonthOpened ? "Month opened" : "Open month"} onPress={() => onOpenMonth?.()} variant="secondary" />
            <ActionButton icon={Plus} label="Adjustment" onPress={() => onAddAdjustment?.()} variant="secondary" />
            <ActionButton icon={ReceiptText} label="Record pay" onPress={() => onRecordPay?.()} />
          </View>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Pay history</Text>
        {months.map((month) => {
          const editable = !readOnly && month.paidAmountPaise === 0;
          return (
            <View key={month.payrollMonth} style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>{formatMonth(month.payrollMonth)}</Text>
                  <Text style={[type.caption, { color: colors.muted }]} selectable>Opened {formatDayMonth(month.openedOn)}</Text>
                </View>
                <Text style={[type.caption, { color: month.paymentStatus === "PAID" ? colors.successText : colors.warningText, fontWeight: "800" }]} selectable>{month.paymentStatus.replaceAll("_", " ")}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <AmountMetric label="Gross" value={formatMoneyPaise(month.grossAmountPaise)} />
                <AmountMetric label="Net" value={formatMoneyPaise(month.netAmountPaise)} />
                <AmountMetric label="Paid" value={formatMoneyPaise(month.paidAmountPaise)} />
              </View>
              {month.adjustments.map((adjustment) => (
                <View key={adjustment.id} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                  <Text style={[type.caption, { color: colors.muted, flex: 1 }]} selectable>
                    {adjustment.adjustmentType === "ADDITION" ? "+ " : "− "}{formatMoneyPaise(adjustment.amountPaise)}  ·  {adjustment.reason}
                  </Text>
                  {editable ? (
                    <>
                      <AnimatedPressable accessibilityLabel="Edit adjustment" hitSlop={8} onPress={() => onEditAdjustment?.(month.payrollMonth, adjustment)}>
                        <Pencil color={colors.primary} size={15} strokeWidth={2.2} />
                      </AnimatedPressable>
                      <AnimatedPressable accessibilityLabel="Delete adjustment" hitSlop={8} onPress={() => onDeleteAdjustment?.(month.payrollMonth, adjustment.id)}>
                        <Trash2 color={colors.danger} size={15} strokeWidth={2.2} />
                      </AnimatedPressable>
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
        {!months.length ? <EmptyState description="Open a payroll month to track additions, deductions, and manual payments." icon={Banknote} title="No salary month opened" /> : null}
      </View>
    </Card>
  );
}

// Read-only card for a daily-wage employee in the salary tracker: no salary
// account exists, so we show the running payable for the current month.
function DailyPayableCard({ kind, person }: { kind: "MANAGER" | "STAFF_MEMBER"; person: ManagerEmployment | StaffMember }) {
  const { colors, type } = useTheme();
  const days = daysInCurrentMonth();
  const payablePaise = days * person.salaryRatePaise;
  const Icon = kind === "MANAGER" ? BriefcaseBusiness : UsersRound;
  const meta = kind === "MANAGER" ? "Manager · Daily" : `${(person as StaffMember).categoryName} · Daily`;
  return (
    <View style={rowCardStyle(colors)}>
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderCurve: "continuous", borderRadius: 13, height: 46, justifyContent: "center", width: 46 }}>
        <Icon color={colors.primary} size={20} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1} selectable>{meta}</Text>
        <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1} selectable>{person.fullName}</Text>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>{formatMoneyPaise(person.salaryRatePaise)} / day × {days} days</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Payable</Text>
        <Text style={[type.bodyStrong, { color: colors.ink, fontVariant: ["tabular-nums"] }]} selectable>{formatMoneyPaise(payablePaise)}</Text>
      </View>
    </View>
  );
}

function EmployeeHistory({ property }: { property: OwnerProperty }) {
  const { colors } = useTheme();
  const [page, setPage] = useState(0);
  const query = useListEmployeeHistoryQuery({ page, propertyId: property.id, size: 20 });
  const pageData = query.data;
  const items = pageData?.items ?? [];
  return (
    <View style={{ gap: spacing.lg }}>
      <Section eyebrow="Past employees" title={`${pageData?.totalElements ?? items.length} record${(pageData?.totalElements ?? items.length) === 1 ? "" : "s"}`}>
        {query.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : items.length ? (
          <View style={{ gap: spacing.sm, opacity: query.isFetching ? 0.6 : 1 }}>
            {items.map((item) => <HistoryCard item={item} key={`${item.holderType}-${item.referenceCode}`} />)}
          </View>
        ) : (
          <EmptyState description="Employees you end will appear here with their service span, settlement, and exit review." icon={BriefcaseBusiness} title="No past employees yet" />
        )}
        {pageData && pageData.totalElements > 0 ? (
          <PaginationBar
            hasNext={pageData.hasNext}
            hasPrevious={pageData.hasPrevious}
            onNext={() => setPage((current) => current + 1)}
            onPrevious={() => setPage((current) => Math.max(0, current - 1))}
            page={pageData.page}
            totalElements={pageData.totalElements}
            totalPages={pageData.totalPages}
          />
        ) : null}
      </Section>
    </View>
  );
}

function HistoryCard({ item }: { item: EmployeeHistoryItem }) {
  const { colors, type } = useTheme();
  const Icon = item.holderType === "MANAGER" ? BriefcaseBusiness : UsersRound;
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: 14, height: 48, justifyContent: "center", width: 48 }}>
            <Icon color={colors.muted} size={22} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1} selectable>{item.holderType === "MANAGER" ? "Manager" : item.categoryName}</Text>
            <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 18 }]} selectable>{item.fullName}</Text>
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>{item.referenceCode}  ·  {salaryRateLabel(item.salaryStructure, item.salaryRatePaise)}</Text>
          </View>
        </View>
        <View style={{ gap: spacing.sm }}>
          <DetailRow label="Service" value={serviceDuration(item.employmentStartDate, item.employmentEndDate)} />
          <DetailRow label="Start date" value={item.employmentStartDate ? formatDate(item.employmentStartDate) : "—"} />
          <DetailRow label="End date" value={item.employmentEndDate ? formatDate(item.employmentEndDate) : "—"} />
          {item.settledOn ? <DetailRow label="Settled on" value={formatDate(item.settledOn)} /> : null}
          {item.settlementAmountPaise ? <DetailRow label="Settlement" value={formatMoneyPaise(item.settlementAmountPaise)} /> : null}
          {item.totalPaidPaise ? <DetailRow label="Total paid" value={formatMoneyPaise(item.totalPaidPaise)} /> : null}
        </View>
        {item.employmentEndReason ? <HistoryNote label="Reason for leaving" value={item.employmentEndReason} /> : null}
        {item.employmentReview ? <HistoryNote label="Exit review" value={item.employmentReview} /> : null}
      </View>
    </Card>
  );
}

function HistoryNote({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 3, padding: spacing.md }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>{label}</Text>
      <Text style={[type.body, { color: colors.ink }]} selectable>{value}</Text>
    </View>
  );
}

function SegmentBar<T extends string>({ onChange, options, value }: { onChange: (value: T) => void; options: { key: T; label: string }[]; value: T }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 4, padding: 4 }}>
      {options.map((option) => (
        <Segment active={option.key === value} key={option.key} label={option.label} onPress={() => onChange(option.key)} />
      ))}
    </View>
  );
}

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.surface : "transparent",
        borderColor: active ? colors.border : "transparent",
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        elevation: active ? 2 : 0,
        flex: 1,
        justifyContent: "center",
        minHeight: 44,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: active ? 1 : 0,
        shadowRadius: 6,
      }}
    >
      <Text style={{ color: active ? colors.primary : colors.muted, fontFamily: fonts.sans, fontSize: 14, fontWeight: active ? "800" : "600", letterSpacing: 0.2 }} selectable>{label}</Text>
    </AnimatedPressable>
  );
}

function CategoryButton({ active, icon: Icon, label, onDelete, onPress }: { active?: boolean; icon?: typeof Plus; label: string; onDelete?: () => void; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const foreground = active ? colors.onPrimary : colors.ink;
  return (
    <View style={{ alignItems: "center", backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", minHeight: 40 }}>
      <AnimatedPressable accessibilityRole="button" onPress={onPress} style={{ alignItems: "center", flexDirection: "row", gap: 6, minHeight: 40, paddingHorizontal: spacing.sm }}>
        {Icon ? <Icon color={active ? colors.onPrimary : colors.primary} size={15} /> : null}
        <Text style={{ color: foreground, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" }} selectable>{label}</Text>
      </AnimatedPressable>
      {onDelete ? (
        <AnimatedPressable accessibilityLabel={`Delete ${label} category`} accessibilityRole="button" hitSlop={8} onPress={onDelete} style={{ alignItems: "center", alignSelf: "stretch", borderLeftColor: active ? colors.onPrimary : colors.border, borderLeftWidth: 1, justifyContent: "center", minWidth: 36 }}>
          <X color={active ? colors.onPrimary : colors.danger} size={16} strokeWidth={2.4} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

function ManagerCard({ entry, onEdit, onOpen }: { entry: ManagerDirectoryEntry; onEdit: () => void; onOpen: () => void }) {
  const { colors, type } = useTheme();
  const { assignment, employment } = entry;
  return (
    <View style={rowCardStyle(colors)}>
      <AnimatedPressable onPress={onOpen} style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm }}>
        <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderCurve: "continuous", borderRadius: 13, height: 46, justifyContent: "center", width: 46 }}>
          <BriefcaseBusiness color={colors.primary} size={20} strokeWidth={2.1} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1} selectable>{employment?.referenceCode ?? "Manager"}</Text>
          <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1} selectable>{assignment.managerFullName}</Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>
            {employment ? salaryRateLabel(employment.salaryStructure, employment.salaryRatePaise) : assignment.managerPhone}
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </AnimatedPressable>
      <IconButton accessibilityLabel={`Edit employment for ${assignment.managerFullName}`} icon={Pencil} onPress={onEdit} />
    </View>
  );
}

function ManagerDetailModal({ entry, onClose, onEdit, onRemove, onShift, shiftTargets }: {
  entry: ManagerDirectoryEntry;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onShift: (target: OwnerProperty) => void;
  shiftTargets: OwnerProperty[];
}) {
  const { colors, type } = useTheme();
  const { assignment, employment } = entry;
  return (
    <Sheet onClose={onClose} title="Manager details">
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 30, height: 60, justifyContent: "center", width: 60 }}>
          <BriefcaseBusiness color={colors.primary} size={28} strokeWidth={2.1} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 22 }]} selectable>{assignment.managerFullName}</Text>
          <Text style={[type.caption, { color: colors.muted }]} selectable>{assignment.managerPhone}</Text>
          <Text style={[type.caption, { color: colors.kicker }]} selectable>{employment?.referenceCode ?? "Employment record loading"}</Text>
        </View>
      </View>
      <Card>
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Account</Text>
          <DetailRow label="Phone verified" value={assignment.phoneVerified ? "Verified" : "Not verified"} />
          <DetailRow label="Profile" value={assignment.profileCompleted ? "Completed" : "Incomplete"} />
          <DetailRow label="Account status" value={assignment.accountActive ? "Active" : "Inactive"} />
          <DetailRow label="Assigned on" value={formatDate(assignment.createdAt)} />
        </View>
      </Card>
      {employment ? (
        <Card>
          <View style={{ gap: spacing.sm }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Employment</Text>
            <DetailRow label="Salary" value={salaryRateLabel(employment.salaryStructure, employment.salaryRatePaise)} />
            <DetailRow label="Start date" value={employment.employmentStartDate ? formatDate(employment.employmentStartDate) : "Not set"} />
            <DetailRow label="Benefits" value={employment.benefitsSummary || "None recorded"} />
          </View>
        </Card>
      ) : null}
      <ActionButton icon={Pencil} label="Edit employment" onPress={onEdit} variant="secondary" />
      {shiftTargets.length ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Transfer to property</Text>
          {shiftTargets.map((target) => (
            <AnimatedPressable key={target.id} onPress={() => onShift(target)} style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
              <ArrowLeftRight color={colors.primary} size={18} />
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>{target.name}</Text>
                <Text style={[type.caption, { color: colors.muted }]} selectable>{[target.city, target.state].filter(Boolean).join(", ")}</Text>
              </View>
              <ChevronRight color={colors.muted} size={18} />
            </AnimatedPressable>
          ))}
        </View>
      ) : null}
      <ActionButton icon={Trash2} label="Remove manager" onPress={onRemove} variant="danger" />
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]} selectable>{label}</Text>
      <Text style={[type.caption, { color: colors.ink, flex: 1, fontWeight: "700", textAlign: "right" }]} selectable>{value}</Text>
    </View>
  );
}
// Shared lift so the staff row cards float off the background like the rest of
// the app's clickable cards.
function rowCardStyle(colors: { surface: string; border: string; shadow: string }) {
  return {
    alignItems: "center" as const,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: "continuous" as const,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    flexDirection: "row" as const,
    gap: spacing.sm,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  };
}

function PersonCard({ icon: Icon, meta, onPress, subtitle, title }: { icon: typeof UsersRound; meta: string; onPress: () => void; subtitle: string; title: string }) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable onPress={onPress} style={rowCardStyle(colors)}>
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderCurve: "continuous", borderRadius: 13, height: 46, justifyContent: "center", width: 46 }}>
        <Icon color={colors.primary} size={20} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1} selectable>{meta}</Text>
        <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1} selectable>{title}</Text>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>{subtitle}</Text>
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </AnimatedPressable>
  );
}

function AmountMetric({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, flex: 1, gap: 2, padding: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>{label}</Text>
      <Text style={[type.bodyStrong, { color: colors.ink, fontVariant: ["tabular-nums"] }]} numberOfLines={1} selectable>{value}</Text>
    </View>
  );
}

function CreateCategoryModal({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [createCategory, state] = useCreateStaffCategoryMutation();
  async function submit() {
    if (!name.trim()) return;
    try { await createCategory({ name: name.trim(), propertyId }).unwrap(); onClose(); } catch (error) { toast.show(errorMessage(error, "Could not create the category.")); }
  }
  return <Sheet onClose={onClose} title="New staff category"><FormInput label="Category name" onChangeText={setName} placeholder="e.g. Laundry" value={name} /><ActionButton disabled={state.isLoading} icon={Plus} label={state.isLoading ? "Creating" : "Create category"} onPress={() => void submit()} /></Sheet>;
}

function AddManagerModal({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [salaryStructure, setSalaryStructure] = useState<SalaryStructure>("MONTHLY");
  const [salary, setSalary] = useState("");
  const [benefits, setBenefits] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lookup, setLookup] = useState<ManagerLookup | null>(null);
  const [feedback, setFeedback] = useState<ModalFeedback | null>(null);
  const [runLookup, lookupState] = useLazyLookupManagerQuery();
  const [addManager, state] = useAddPropertyManagerMutation();

  function changePhone(value: string) {
    setPhone(value);
    setFullName("");
    setLookup(null);
    setFeedback(null);
  }

  async function doLookup() {
    if (!/^\d{10,15}$/.test(phone.trim())) {
      setFeedback({ message: "Enter a valid phone number.", tone: "error" });
      return;
    }
    setFeedback(null);
    try {
      const result = await runLookup({ phone: phone.trim(), propertyId }).unwrap();
      setLookup(result);
      if (result.exists && result.fullName) setFullName(result.fullName);
    } catch {
      setFeedback({ message: "Could not look up this phone number. Try again.", tone: "error" });
    }
  }

  async function submit() {
    const salaryRatePaise = rupeesToPaise(salary);
    if (!lookup?.eligible) {
      setFeedback({ message: lookup?.message ?? "Look up the phone number before assigning a manager.", tone: "error" });
      return;
    }
    if (!fullName.trim() || !salaryRatePaise || !startDate) {
      setFeedback({ message: "Name, salary and working start date are required.", tone: "error" });
      return;
    }
    setFeedback(null);
    try {
      await addManager({
        propertyId,
        payload: {
          phone: phone.trim(),
          fullName: fullName.trim(),
          dateOfBirth: dateOfBirth || null,
          salaryStructure,
          salaryRatePaise,
          benefitsSummary: benefits,
          employmentStartDate: startDate,
          employmentEndDate: endDate || null,
          employmentNotes: notes,
        },
      }).unwrap();
      onClose();
      toast.show("Manager assigned successfully.");
    } catch {
      setFeedback({ message: "Could not assign the manager. Check the details and try again.", tone: "error" });
    }
  }

  return (
    <Sheet onClose={onClose} title="Assign manager">
      <FormInput keyboardType="phone-pad" label="Phone number" onChangeText={changePhone} placeholder="10-digit phone" value={phone} />
      <ActionButton disabled={lookupState.isFetching} icon={Search} label={lookupState.isFetching ? "Looking up" : "Look up"} onPress={() => void doLookup()} variant="secondary" />
      {lookup ? <ManagerLookupResult lookup={lookup} /> : null}
      {lookup?.eligible ? (
        <>
          <FormInput label="Full name" onChangeText={setFullName} placeholder="Manager name" value={fullName} />
          <DatePickerField clearable label="Date of birth" onChange={setDateOfBirth} value={dateOfBirth} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ChoiceButton active={salaryStructure === "MONTHLY"} label="Monthly" onPress={() => setSalaryStructure("MONTHLY")} />
            <ChoiceButton active={salaryStructure === "DAILY"} label="Daily" onPress={() => setSalaryStructure("DAILY")} />
          </View>
          <FormInput keyboardType="decimal-pad" label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"} onChangeText={setSalary} placeholder="Rs." value={salary} />
          <FormInput label="Benefits provided" multiline onChangeText={setBenefits} placeholder="Optional benefits" value={benefits} />
          <DatePickerField label="Working start date" onChange={setStartDate} value={startDate} />
          <DatePickerField clearable label="Working end date" onChange={setEndDate} value={endDate} />
          <FormInput label="Notes" multiline onChangeText={setNotes} placeholder="Optional employment notes" value={notes} />
        </>
      ) : null}
      <InlineFeedback feedback={feedback} />
      {lookup?.eligible ? <ActionButton disabled={state.isLoading} icon={Plus} label={state.isLoading ? "Assigning" : "Assign manager"} onPress={() => void submit()} /> : null}
    </Sheet>
  );
}

function StaffMemberModal({ categories, member, onClose, onEnd, propertyId }: { categories: StaffCategory[]; member: StaffMember | null; onClose: () => void; onEnd?: () => void; propertyId: string }) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState(categories.find((category) => category.name === member?.categoryName)?.id ?? categories[0]?.id ?? "");
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [birthDate, setBirthDate] = useState(member?.dateOfBirth ?? "");
  const [salaryStructure, setSalaryStructure] = useState<SalaryStructure>(member?.salaryStructure ?? "MONTHLY");
  const [salary, setSalary] = useState(member ? paiseToRupees(member.salaryRatePaise) : "");
  const [benefits, setBenefits] = useState(member?.benefitsSummary ?? "");
  const [startDate, setStartDate] = useState(member?.employmentStartDate ?? today());
  const [notes, setNotes] = useState(member?.employmentNotes ?? "");
  const [createMember, createState] = useCreateStaffMemberMutation();
  const [updateMember, updateState] = useUpdateStaffMemberMutation();
  const [feedback, setFeedback] = useState<ModalFeedback | null>(null);
  const saving = createState.isLoading || updateState.isLoading;
  async function submit() {
    const salaryRatePaise = rupeesToPaise(salary);
    if (!categoryId || !fullName.trim() || !salaryRatePaise || !startDate) {
      setFeedback({ message: "Category, name, salary and start date are required.", tone: "error" });
      return;
    }
    const payload = { benefitsSummary: benefits, categoryId, dateOfBirth: birthDate || null, employmentEndDate: null, employmentNotes: notes, employmentStartDate: startDate, fullName: fullName.trim(), identityVerificationStatus: member?.identityVerificationStatus ?? "NOT_STARTED" as const, salaryRatePaise, salaryStructure };
    try {
      if (member) await updateMember({ payload, propertyId, staffReferenceCode: member.referenceCode }).unwrap();
      else await createMember({ payload, propertyId }).unwrap();
      onClose();
      toast.show(member ? "Staff member updated successfully." : "Staff member added successfully.");
    } catch (error) {
      setFeedback({ message: "Could not save the staff member. Check the details and try again.", tone: "error" });
    }
  }
  return (
    <Sheet onClose={onClose} title={member ? "Edit staff member" : "Add staff member"}>
      <FieldLabel>Category</FieldLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>{categories.map((category) => <ChoiceButton active={category.id === categoryId} key={category.id} label={category.name} onPress={() => setCategoryId(category.id)} />)}</View>
      <FormInput label="Full name" onChangeText={setFullName} placeholder="Staff member name" value={fullName} />
      <DatePickerField clearable label="Date of birth" onChange={setBirthDate} value={birthDate} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}><ChoiceButton active={salaryStructure === "MONTHLY"} label="Monthly" onPress={() => setSalaryStructure("MONTHLY")} /><ChoiceButton active={salaryStructure === "DAILY"} label="Daily" onPress={() => setSalaryStructure("DAILY")} /></View>
      <FormInput keyboardType="decimal-pad" label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"} onChangeText={setSalary} placeholder="Rs." value={salary} />
      <FormInput label="Benefits provided" multiline onChangeText={setBenefits} placeholder="Optional benefits" value={benefits} />
      <DatePickerField label="Working start date" onChange={setStartDate} value={startDate} />
      <FormInput label="Notes" multiline onChangeText={setNotes} placeholder="Optional employment notes" value={notes} />
      <InlineFeedback feedback={feedback} />
      <ActionButton disabled={saving} icon={Pencil} label={saving ? "Saving" : "Save member"} onPress={() => void submit()} />
      {member?.active && onEnd ? <ActionButton icon={Trash2} label="End employment" onPress={onEnd} variant="danger" /> : null}
    </Sheet>
  );
}

function ManagerEmploymentModal({ manager, onClose, propertyId }: { manager: ManagerEmployment; onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [birthDate, setBirthDate] = useState(manager.dateOfBirth ?? "");
  const [salaryStructure, setSalaryStructure] = useState<SalaryStructure>(manager.salaryStructure);
  const [salary, setSalary] = useState(manager.salaryRatePaise ? paiseToRupees(manager.salaryRatePaise) : "");
  const [benefits, setBenefits] = useState(manager.benefitsSummary);
  const [startDate, setStartDate] = useState(manager.employmentStartDate ?? today());
  const [endDate, setEndDate] = useState(manager.employmentEndDate ?? "");
  const [notes, setNotes] = useState(manager.employmentNotes);
  const [feedback, setFeedback] = useState<ModalFeedback | null>(null);
  const [updateManager, state] = useUpdateManagerEmploymentMutation();

  async function submit() {
    const salaryRatePaise = rupeesToPaise(salary);
    if (!salaryRatePaise || !startDate) {
      setFeedback({ message: "Salary and working start date are required.", tone: "error" });
      return;
    }

    setFeedback(null);
    try {
      await updateManager({
        managerReferenceCode: manager.referenceCode,
        payload: {
          benefitsSummary: benefits,
          dateOfBirth: birthDate || null,
          employmentEndDate: endDate || null,
          employmentNotes: notes,
          employmentStartDate: startDate,
          identityVerificationStatus: manager.identityVerificationStatus,
          salaryRatePaise,
          salaryStructure,
        },
        propertyId,
      }).unwrap();
      onClose();
      toast.show("Manager employment updated successfully.");
    } catch (error) {
      setFeedback({ message: errorMessage(error, "Could not save manager employment details."), tone: "error" });
    }
  }

  return (
    <Sheet onClose={onClose} title={`Edit manager employment - ${manager.fullName}`}>
      <DatePickerField clearable label="Date of birth" onChange={setBirthDate} value={birthDate} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ChoiceButton active={salaryStructure === "MONTHLY"} label="Monthly" onPress={() => setSalaryStructure("MONTHLY")} />
        <ChoiceButton active={salaryStructure === "DAILY"} label="Daily" onPress={() => setSalaryStructure("DAILY")} />
      </View>
      <FormInput keyboardType="decimal-pad" label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"} onChangeText={setSalary} placeholder="Rs." value={salary} />
      <FormInput label="Benefits provided" multiline onChangeText={setBenefits} placeholder="Optional benefits" value={benefits} />
      <DatePickerField label="Working start date" onChange={setStartDate} value={startDate} />
      <DatePickerField clearable label="Working end date" onChange={setEndDate} value={endDate} />
      <FormInput label="Notes" multiline onChangeText={setNotes} placeholder="Optional employment notes" value={notes} />
      <InlineFeedback feedback={feedback} />
      <ActionButton disabled={state.isLoading} icon={Pencil} label={state.isLoading ? "Saving" : "Save manager employment"} onPress={() => void submit()} />
    </Sheet>
  );
}
function OpenMonthModal({ account, onClose, onSaved, propertyId }: { account: SalaryAccountDetail; onClose: () => void; onSaved: (value: SalaryAccountDetail) => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const [openMonth, state] = useOpenSalaryMonthMutation();
  async function submit() {
    try { onSaved(await openMonth({ accountReferenceCode: account.account.referenceCode, propertyId }).unwrap()); onClose(); } catch (error) { toast.show(errorMessage(error, "Could not open salary month.")); }
  }
  return <Sheet onClose={onClose} title="Open salary month"><Text style={[type.body, { color: colors.muted }]} selectable>Open {formatMonth(firstOfMonth())} for {account.account.holderName}. It will be recorded as opened today.</Text><ActionButton disabled={state.isLoading} label={state.isLoading ? "Opening" : "Open month"} onPress={() => void submit()} /></Sheet>;
}

function formatDayMonth(value: string) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00`)); }

function AdjustmentModal({ account, editing, onClose, onSaved, propertyId }: { account: SalaryAccountDetail; editing?: { payrollMonth: string; adjustment: SalaryAdjustment } | null; onClose: () => void; onSaved: (value: SalaryAccountDetail) => void; propertyId: string }) {
  const toast = useToast();
  const payrollMonth = editing?.payrollMonth ?? account.months[0]?.payrollMonth;
  const [type, setType] = useState<SalaryAdjustmentType>(editing?.adjustment.adjustmentType ?? "ADDITION");
  const [amount, setAmount] = useState(editing ? paiseToRupees(editing.adjustment.amountPaise) : "");
  const [reason, setReason] = useState(editing?.adjustment.reason ?? "");
  const [addAdjustment, addState] = useAddSalaryAdjustmentMutation();
  const [updateAdjustment, updateState] = useUpdateSalaryAdjustmentMutation();
  const saving = addState.isLoading || updateState.isLoading;
  async function submit() {
    if (!payrollMonth) { toast.show("Open a salary month first."); return; }
    const amountPaise = rupeesToPaise(amount);
    if (!amountPaise || !reason.trim()) { toast.show("Enter an amount and reason."); return; }
    const payload = { adjustmentType: type, amountPaise, reason: reason.trim() };
    try {
      const detail = editing
        ? await updateAdjustment({ accountReferenceCode: account.account.referenceCode, adjustmentId: editing.adjustment.id, payload, payrollMonth, propertyId }).unwrap()
        : await addAdjustment({ accountReferenceCode: account.account.referenceCode, payload, payrollMonth, propertyId }).unwrap();
      onSaved(detail);
      onClose();
    } catch (error) { toast.show(errorMessage(error, "Could not save the salary adjustment.")); }
  }
  return <Sheet onClose={onClose} title={editing ? "Edit adjustment" : "Salary adjustment"}><View style={{ flexDirection: "row", gap: spacing.sm }}><ChoiceButton active={type === "ADDITION"} label="Addition" onPress={() => setType("ADDITION")} /><ChoiceButton active={type === "DEDUCTION"} label="Deduction" onPress={() => setType("DEDUCTION")} /></View><FormInput keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} placeholder=" " value={amount} /><FormInput label="Reason" multiline onChangeText={setReason} placeholder="e.g. Performance incentive" value={reason} /><ActionButton disabled={saving} label={saving ? "Saving" : "Save adjustment"} onPress={() => void submit()} /></Sheet>;
}

function SalaryPaymentModal({ account, onClose, onSaved, propertyId }: { account: SalaryAccountDetail; onClose: () => void; onSaved: (value: SalaryAccountDetail) => void; propertyId: string }) {
  const toast = useToast();
  const latest = account.months[0];
  const [amount, setAmount] = useState(latest ? paiseToRupees(latest.netAmountPaise - latest.paidAmountPaise) : "");
  const [method, setMethod] = useState<SalaryPaymentMethod>("CASH");
  const [referenceText, setReferenceText] = useState("");
  const [notes, setNotes] = useState("");
  const [recordPayment, state] = useRecordSalaryPaymentMutation();
  async function submit() {
    if (!latest) { toast.show("Open a salary month first."); return; }
    const amountPaise = rupeesToPaise(amount);
    if (!amountPaise) { toast.show("Enter a valid payment amount."); return; }
    try { onSaved(await recordPayment({ accountReferenceCode: account.account.referenceCode, payrollMonth: latest.payrollMonth, payload: { amountPaise, notes, paidOn: today(), paymentMethod: method, referenceText }, propertyId }).unwrap()); onClose(); } catch (error) { toast.show(errorMessage(error, "Could not record salary payment.")); }
  }
  return <Sheet onClose={onClose} title="Record manual payment"><FormInput keyboardType="decimal-pad" label="Amount paid" onChangeText={setAmount} placeholder=" " value={amount} /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>{(["CASH", "UPI", "BANK_TRANSFER", "OTHER"] as SalaryPaymentMethod[]).map((item) => <ChoiceButton active={method === item} key={item} label={item.replaceAll("_", " ")} onPress={() => setMethod(item)} />)}</View><FormInput label="Reference" onChangeText={setReferenceText} placeholder="Optional receipt or transfer reference" value={referenceText} /><FormInput label="Notes" multiline onChangeText={setNotes} placeholder="Optional notes" value={notes} /><ActionButton disabled={state.isLoading} label={state.isLoading ? "Recording" : "Record payment"} onPress={() => void submit()} /></Sheet>;
}

// Ends a manager or staff employment. For monthly employees this also runs the
// full-and-final settlement (clears outstanding salary + an optional extra
// amount) atomically on the server. Daily-wage employees have no salary account,
// so we collect only a reason and review.
function EndEmploymentSheet({ onClose, propertyId, target }: { onClose: () => void; propertyId: string; target: EndTarget }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const isDaily = target.salaryStructure === "DAILY";
  const staffPreview = useStaffTerminationPreviewQuery(
    { propertyId, staffReferenceCode: target.referenceCode },
    { skip: target.kind !== "STAFF" || isDaily },
  );
  const managerPreview = useManagerTerminationPreviewQuery(
    { managerReferenceCode: target.referenceCode, propertyId },
    { skip: target.kind !== "MANAGER" || isDaily },
  );
  const preview = target.kind === "STAFF" ? staffPreview.data : managerPreview.data;
  const previewLoading = target.kind === "STAFF" ? staffPreview.isLoading : managerPreview.isLoading;
  const [endStaff, endStaffState] = useEndStaffMemberMutation();
  const [endManager, endManagerState] = useEndManagerEmploymentMutation();
  const [reason, setReason] = useState("");
  const [review, setReview] = useState("");
  const [additional, setAdditional] = useState("");
  const [method, setMethod] = useState<SalaryPaymentMethod>("CASH");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [feedback, setFeedback] = useState<ModalFeedback | null>(null);
  const saving = endStaffState.isLoading || endManagerState.isLoading;

  const hasAccount = !isDaily && Boolean(preview?.hasSalaryAccount);
  const outstandingPaise = hasAccount ? preview?.outstandingPaise ?? 0 : 0;
  const additionalPaise = rupeesToPaise(additional) ?? 0;
  const totalSettlementPaise = outstandingPaise + additionalPaise;
  const showSettlement = !isDaily;

  async function submit() {
    if (!reason.trim()) {
      setFeedback({ message: "A reason for ending employment is required.", tone: "error" });
      return;
    }
    setFeedback(null);
    const settling = totalSettlementPaise > 0;
    const payload: EndEmploymentPayload = {
      additionalAmountPaise: additionalPaise,
      paidOn: settling ? today() : null,
      paymentMethod: settling ? method : null,
      reason: reason.trim(),
      review: review.trim() || undefined,
      settlementNotes: settlementNotes.trim() || undefined,
    };
    try {
      if (target.kind === "STAFF") await endStaff({ payload, propertyId, staffReferenceCode: target.referenceCode }).unwrap();
      else await endManager({ managerReferenceCode: target.referenceCode, payload, propertyId }).unwrap();
      onClose();
      toast.show(`${target.name}'s employment has been ended.`);
    } catch (error) {
      setFeedback({ message: errorMessage(error, "Could not end the employment. Try again."), tone: "error" });
    }
  }

  return (
    <Sheet onClose={onClose} title={`End employment — ${target.name}`}>
      <View style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderCurve: "continuous", borderRadius: 14, borderWidth: 1, gap: 4, padding: spacing.md }}>
        <Text style={[type.bodyStrong, { color: colors.danger }]} selectable>This deactivates the record immediately</Text>
        <Text style={[type.caption, { color: colors.danger }]} selectable>The end date is recorded as today. This cannot be undone.</Text>
      </View>

      <FormInput label="Reason for leaving" multiline onChangeText={setReason} placeholder="e.g. Resigned, relocated, performance" value={reason} />
      <FormInput label="Exit review (optional)" multiline onChangeText={setReview} placeholder="A short note for your records" value={review} />

      {showSettlement ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Full & final settlement</Text>
          {previewLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              {hasAccount ? (
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <AmountMetric label="Unpaid salary" value={formatMoneyPaise(outstandingPaise)} />
                  <AmountMetric label="Extra amount" value={formatMoneyPaise(additionalPaise)} />
                  <AmountMetric label="Settlement" value={formatMoneyPaise(totalSettlementPaise)} />
                </View>
              ) : (
                <Text style={[type.caption, { color: colors.muted }]} selectable>No open salary account — record any final payout below.</Text>
              )}
              <FormInput keyboardType="decimal-pad" label="Additional final amount" onChangeText={setAdditional} placeholder="Rs. (optional)" value={additional} />
              {totalSettlementPaise > 0 ? (
                <>
                  <FieldLabel>Payment method</FieldLabel>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    {(["CASH", "UPI", "BANK_TRANSFER", "OTHER"] as SalaryPaymentMethod[]).map((item) => (
                      <ChoiceButton active={method === item} key={item} label={item.replaceAll("_", " ")} onPress={() => setMethod(item)} />
                    ))}
                  </View>
                  <FormInput label="Settlement notes" multiline onChangeText={setSettlementNotes} placeholder="Optional notes" value={settlementNotes} />
                </>
              ) : null}
            </>
          )}
        </View>
      ) : (
        <Text style={[type.caption, { color: colors.muted }]} selectable>Daily-wage employees have no salary account, so there is nothing to settle.</Text>
      )}

      <InlineFeedback feedback={feedback} />
      <ActionButton disabled={saving} icon={Trash2} label={saving ? "Ending" : "End employment"} onPress={() => void submit()} variant="danger" />
    </Sheet>
  );
}

function DatePickerField({ clearable = false, label, onChange, value }: { clearable?: boolean; label: string; onChange: (value: string) => void; value: string }) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T12:00:00`) : new Date();

  function update(event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (event.type === "dismissed" || !selected) return;
    onChange(toLocalIso(selected));
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} selectable>{label}</Text>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <AnimatedPressable onPress={() => setOpen(true)} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 52, justifyContent: "center", paddingHorizontal: spacing.md }}>
          <Text style={[type.body, { color: value ? colors.ink : colors.muted }]} selectable>{value || "Select date"}</Text>
        </AnimatedPressable>
        {clearable && value ? <IconButton accessibilityLabel={`Clear ${label}`} icon={X} onPress={() => onChange("")} /> : null}
      </View>
      {open ? <DateTimePicker display="default" maximumDate={label === "Date of birth" ? new Date() : undefined} mode="date" onChange={update} value={selectedDate} /> : null}
    </View>
  );
}
function ManagerLookupResult({ lookup }: { lookup: ManagerLookup }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: spacing.xs, padding: spacing.md }}>
      <Text style={[type.caption, { color: lookup.eligible ? colors.successText : colors.danger, fontWeight: "800" }]} selectable>
        {lookup.exists ? `Existing user${lookup.fullName ? `   ${lookup.fullName}` : ""}` : "New user"}
      </Text>
      <Text style={[type.caption, { color: colors.muted }]} selectable>{lookup.message}</Text>
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} selectable>{children}</Text>;
}

function InlineFeedback({ feedback }: { feedback: ModalFeedback | null }) {
  const { colors, type } = useTheme();
  if (!feedback) return null;
  const success = feedback.tone === "success";
  return (
    <View style={{ backgroundColor: success ? colors.primarySoft : colors.surfaceSunken, borderColor: success ? colors.primary : colors.danger, borderRadius: 12, borderWidth: 1, padding: spacing.sm }}>
      <Text style={[type.caption, { color: success ? colors.successText : colors.danger, fontWeight: "700" }]} selectable>{feedback.message}</Text>
    </View>
  );
}
// Bottom-sheet modal matching the rest of the app (e.g. owner-rooms ModalShell):
// dimmed overlay, surface anchored to the bottom with rounded top corners, and a
// keyboard-avoiding scrollable body honouring the bottom safe area.
function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingBottom: Math.max(insets.bottom, spacing.md),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} numberOfLines={1} selectable>{title}</Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) { return selectedPropertyId ? properties.find((property) => property.id === selectedPropertyId) ?? null : properties.length === 1 ? properties[0] : null; }
function salaryRateLabel(structure: SalaryStructure, amountPaise: number) { return `${formatMoneyPaise(amountPaise)}${structure === "DAILY" ? " / day" : " / month"}`; }
// Format a Date as a local YYYY-MM-DD. toISOString() would convert to UTC and
// roll the date back a day for timezones ahead of UTC (e.g. IST).
function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function today() { return toLocalIso(new Date()); }
function firstOfMonth() { return `${today().slice(0, 7)}-01`; }
function daysInCurrentMonth() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); }
// Human-friendly tenure between a start date and an end date (or today if open).
function serviceDuration(start: string, end: string | null) {
  if (!start) return "—";
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = end ? new Date(`${end}T00:00:00`) : new Date();
  if (!Number.isFinite(startDate.getTime()) || endDate.getTime() < startDate.getTime()) return "—";
  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  if (endDate.getDate() < startDate.getDate()) months -= 1;
  if (months < 1) {
    const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (remMonths) parts.push(`${remMonths} mo`);
  return parts.join(" ") || "1 mo";
}
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function formatMonth(value: string) { return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`)); }

function errorMessage(error: unknown, fallback: string) { if (typeof error === "object" && error && "data" in error) { const data = (error as { data?: { message?: unknown } }).data; if (typeof data?.message === "string" && data.message.trim()) { const message = data.message.trim(); if (!/request body|malformed|json parse|deserialize|date.*parse/i.test(message)) return message; } } return fallback; }
