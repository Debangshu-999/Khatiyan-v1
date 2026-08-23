import { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeftRight, Banknote, BriefcaseBusiness, CalendarCheck, ChevronDown, ChevronRight, ChevronUp, CirclePlus, Clock3, Filter, Pencil, Plus, ReceiptText, Search, ShieldCheck, Trash2, UsersRound, WalletCards, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { FieldError } from "@/components/field-error";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { TabSwitcher } from "@/components/tab-switcher";
import { ActionButton, BackButton, ChoiceButton, ConfirmDialog, FormInput, IconButton, NoticeBar, formatMoneyPaise, humanizeToken, paiseToRupees, rupeesToPaise } from "@/features/owner/owner-ui";
import { OptionPicker, SingleOptionPicker } from "@/components/option-picker";
import { ALL_DAYS_MASK, WEEKDAYS, hasDay, weekdaysLabel, workingDaysInCurrentMonth } from "@/features/owner/working-days";
import { MANAGEABLE_MODULES, fullAccessLevels } from "@/features/owner/manager-access-model";
import { useAppSelector } from "@/store/hooks";
import {
  useAddPropertyManagerMutation,
  useLazyLookupManagerQuery,
  useListMyPropertiesQuery,
  useGetManagerPermissionsQuery,
  useListPropertyManagersQuery,
  useReplaceManagerPermissionsMutation,
  useShiftPropertyManagerMutation,
  type ManagerAccessLevel,
  type ManagerLookup,
  type ManagerResource,
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
  useGetSalaryTotalQuery,
  useListEmployeeHistoryQuery,
  useListEmployeePayslipsQuery,
  useListPropertyPayslipsQuery,
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
  type SalaryPayslip,
  type EndEmploymentPayload,
  type ManagerEmployment,
  type SalaryAccountDetail,
  type SalaryAdjustment,
  type SalaryAdjustmentType,
  type SalaryMonth,
  type SalaryPayment,
  type SalaryPaymentMethod,
  type SalaryStructure,
  type StaffCategory,
  type StaffMember,
} from "@/store/services/staff-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Two tabs, not three. History is not a peer of Team and Salary — it is the
// past tense of each, so it lives as a card at the bottom of whichever tab it
// belongs to rather than as a third destination.
type WorkspaceTab = "TEAM" | "SALARY";
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
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }}
    >
        <BackButton onPress={() => router.back()} />
        <EmptyState icon={UsersRound} title="Choose a property" description="Select one of your properties from Home to manage its team." />
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

      <TabSwitcher
        active={tab}
        onChange={setTab}
        options={[
          { label: "Team", value: "TEAM" },
          { label: "Payroll", value: "SALARY" },
        ]}
      />

      {tab === "TEAM" ? (
        <>
          <TeamDirectory property={property} />
          <TeamHistoryCard property={property} />
        </>
      ) : (
        <>
          <SalaryTracker property={property} />
          {/* Nudged down: the tracker's last section ends short, so without this
              the card floats in the middle of the gap rather than closing it. */}
          <View style={{ marginTop: spacing.lg }}>
            <SalaryHistoryCard property={property} />
          </View>
        </>
      )}
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

      <Section title="My employment">
        {employmentQuery.isLoading ? (
          <SkeletonCard />
        ) : employment ? (
          <Card>
            <View style={{ gap: spacing.sm }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
                <View style={{ alignItems: "center", borderColor: colors.ink, borderRadius: 14, borderWidth: 1, height: 48, justifyContent: "center", width: 48 }}>
                  <BriefcaseBusiness color={colors.ink} size={22} strokeWidth={2.1} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 18 }]}>{employment.fullName}</Text>
                  <Text style={[type.caption, { color: colors.muted }]}>{employment.referenceCode}  ·  {employment.phone}</Text>
                </View>
              </View>
              <DetailRow label="Salary" value={salaryRateLabel(employment.salaryStructure, employment.salaryRatePaise)} />
              <DetailRow label="Start date" value={employment.employmentStartDate ? formatDate(employment.employmentStartDate) : "Not set"} />
              {employment.employmentEndDate ? <DetailRow label="End date" value={formatDate(employment.employmentEndDate)} /> : null}
              <DetailRow label="Verification" value={employment.identityVerificationStatus.replaceAll("_", " ")} />
              <DetailRow label="Benefits" value={employment.benefitsSummary || "None recorded"} />
              {employment.employmentNotes ? <DetailRow label="Notes" value={employment.employmentNotes} /> : null}
              <Text style={[type.caption, { color: colors.kicker }]}>Only the property owner can change these details.</Text>
            </View>
          </Card>
        ) : (
          <EmptyState description="Your employment record could not be loaded." icon={BriefcaseBusiness} title="No record found" />
        )}
      </Section>

      <Section title="My salary account">
        {salaryQuery.isLoading ? (
          <SkeletonCard />
        ) : salaryQuery.data ? (
          <SalaryAccountDetailCard detail={salaryQuery.data} readOnly />
        ) : (
          <EmptyState description="The owner has not opened a salary account for you yet." icon={WalletCards} title="No salary account yet" />
        )}
      </Section>

      <Section title={`${directory.length} staff member${directory.length === 1 ? "" : "s"}`}>
        {directory.length ? directory.map((member) => (
          <View key={member.referenceCode} style={rowCardStyle(colors)}>
            <View style={{ alignItems: "center", borderColor: colors.ink, borderCurve: "continuous", borderRadius: 13, borderWidth: 1, height: 46, justifyContent: "center", width: 46 }}>
              <UsersRound color={colors.ink} size={20} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>{member.categoryName}</Text>
              <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>{member.fullName}</Text>
              <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{member.identityVerificationStatus.replaceAll("_", " ")}</Text>
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
  // Failures from list-level actions — deleting a category, transferring a
  // manager. No field owns them, so they take a modal rather than a toast.
  const opErrors = useFormErrors<never>();

  const router = useRouter();
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
  const [pendingAccess, setPendingAccess] = useState<{ managerUserId: string; name: string } | null>(null);
  const [memberEditor, setMemberEditor] = useState<StaffMember | null | "NEW">(null);
  const [managerEditor, setManagerEditor] = useState<ManagerEmployment | null>(null);
  const [managerDetail, setManagerDetail] = useState<ManagerDirectoryEntry | null>(null);
  const [endTarget, setEndTarget] = useState<EndTarget | null>(null);
  // Null while the chooser is up; set once a path is picked.
  const [endMode, setEndMode] = useState<EndMode | null>(null);
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
      opErrors.failFromServer(errorMessage(error, `"${category.name}" still has staff members, so it cannot be deleted.`));
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
      opErrors.failFromServer(errorMessage(error, "Could not transfer the manager."));
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>

      <Section title={`${managerEntries.length} assigned`} trailing={<View style={{ width: 148 }}><ActionButton compact icon={Plus} label="Add manager" onPress={() => setAddManagerOpen(true)} variant="secondary" /></View>}>
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

      <Section title={`${filteredMembers.length} tracked`} trailing={<View style={{ width: 144 }}><ActionButton icon={Plus} label="Add member" onPress={() => setMemberEditor("NEW")} variant="secondary" /></View>}>
        {/* One control instead of a wall of chips. Categories grow without
            limit, and every chip carried its own delete button — wrapped over
            three or four rows that read as clutter rather than as a filter. The
            list lives in a sheet, where each row has space for its own delete. */}
        <CategoryFilterBar
          categories={categories}
          onCreate={() => setCreateCategoryOpen(true)}
          onDelete={(category) => setPendingDeleteCategory(category)}
          onSelect={setSelectedCategory}
          selected={selectedCategory}
        />
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
      {addManagerOpen ? (
        <AddManagerModal
          onAssigned={(assigned) => {
            setAddManagerOpen(false);
            setPendingAccess(assigned);
          }}
          onClose={() => setAddManagerOpen(false)}
          propertyId={property.id}
        />
      ) : null}
      {pendingAccess ? (
        <ManagerAccessModal manager={pendingAccess} onClose={() => setPendingAccess(null)} propertyId={property.id} />
      ) : null}
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
          onPermissions={() => {
            const assignment = managerDetail.assignment;
            setManagerDetail(null);
            router.push({
              pathname: "/owner-manager-permissions",
              params: {
                managerName: assignment.managerFullName,
                managerUserId: assignment.managerUserId,
                propertyId: property.id,
              },
            });
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
      {endTarget && !endMode ? (
        <EndEmploymentChoiceSheet
          name={endTarget.name}
          onClose={() => setEndTarget(null)}
          onPick={setEndMode}
        />
      ) : null}
      {endTarget && endMode ? (
        <EndEmploymentSheet
          mode={endMode}
          onClose={() => {
            setEndTarget(null);
            setEndMode(null);
          }}
          propertyId={property.id}
          target={endTarget}
        />
      ) : null}
      {pendingShift ? <ConfirmDialog confirmLabel="Transfer" message={`Transfer ${pendingShift.entry.assignment.managerFullName} to ${pendingShift.target.name}?`} onCancel={() => setPendingShift(null)} onConfirm={() => void confirmShift()} title="Transfer manager?" /> : null}
      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
      {pendingDeleteCategory ? <ConfirmDialog confirmLabel="Delete" destructive message={`Delete the "${pendingDeleteCategory.name}" category? This only works if no staff are assigned to it.`} onCancel={() => setPendingDeleteCategory(null)} onConfirm={() => void confirmDeleteCategory()} title="Delete category?" /> : null}
    </View>
  );
}

type SalaryFilter = "ALL" | "MANAGER" | "STAFF";
type AdjustmentTarget = "NEW" | { payrollMonth: string; adjustment: SalaryAdjustment };

function SalaryTracker({ property }: { property: OwnerProperty }) {
  // Failures from list-level actions — deleting a category, transferring a
  // manager. No field owns them, so they take a modal rather than a toast.
  const opErrors = useFormErrors<never>();

  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const managers = useListManagerEmploymentQuery(property.id).data ?? [];
  const members = useListStaffMembersQuery({ propertyId: property.id }).data ?? [];
  const accounts = useListSalaryAccountsQuery(property.id).data ?? [];
  const salaryTotal = useGetSalaryTotalQuery(property.id).data;
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
      opErrors.failFromServer(errorMessage(error, "Complete employment details before opening this salary account."));
    }
  }

  async function confirmDeleteAdjustment() {
    const target = pendingDeleteAdjustment;
    setPendingDeleteAdjustment(null);
    if (!target || !selected) return;
    try {
      setSelected(await removeAdjustment({ accountReferenceCode: selected.account.referenceCode, adjustmentId: target.adjustmentId, payrollMonth: target.payrollMonth, propertyId: property.id }).unwrap());
    } catch (error) {
      opErrors.failFromServer(errorMessage(error, "Could not remove the adjustment."));
    }
  }

  const people: PersonTarget[] = [
    ...managers.map((person) => ({ kind: "MANAGER" as const, person })),
    ...members.map((person) => ({ kind: "STAFF_MEMBER" as const, person })),
  ];
  const visiblePeople = people.filter(
    (entry) => filter === "ALL" || (filter === "MANAGER" ? entry.kind === "MANAGER" : entry.kind === "STAFF_MEMBER"),
  );
  // When a salary account is open we focus on just that person's card (the month
  // detail renders directly under it) and hide the rest of the directory.
  const shownPeople = selected
    ? people.filter((entry) => entry.person.referenceCode === selected.account.holderReferenceCode)
    : visiblePeople;

  return (
    <View style={{ gap: spacing.lg }}>
      <Section title="Salary accounts">
        {!selected ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ChoiceButton active={filter === "ALL"} label="All" onPress={() => setFilter("ALL")} />
            <ChoiceButton active={filter === "MANAGER"} label="Managers" onPress={() => setFilter("MANAGER")} />
            <ChoiceButton active={filter === "STAFF"} label="Other staff" onPress={() => setFilter("STAFF")} />
          </View>
        ) : null}
        {/* Only when there is nothing to stand in for. Rendering it alongside
            the cards put placeholder rows above real content, which reads as two
            extra accounts rather than as loading. A refetch dims the list
            instead — the data is already on screen, it is just going stale. */}
        {loading && shownPeople.length === 0 ? <SkeletonList rows={2} /> : null}
        {shownPeople.map((target) => {
          // Daily-wage employees never get a salary account — we just show their
          // computed payable for the current month (working days × daily rate).
          if (target.person.salaryStructure === "DAILY") {
            return <DailyPayableCard key={`${target.kind}-${target.person.referenceCode}`} kind={target.kind} person={target.person} />;
          }
          const account = accountByHolder.get(target.person.referenceCode);
          const isSelected = selected?.account.holderReferenceCode === target.person.referenceCode;
          return (
            <PersonCard
              key={`${target.kind}-${target.person.referenceCode}`}
              icon={target.kind === "MANAGER" ? BriefcaseBusiness : UsersRound}
              meta={target.kind === "MANAGER" ? "Manager" : target.person.categoryName}
              title={target.person.fullName}
              subtitle={`${salaryRateLabel(target.person.salaryStructure, target.person.salaryRatePaise)}${account ? "  ·  Account open" : ""}`}
              onPress={() => (isSelected ? setSelected(null) : void selectPerson(target))}
            />
          );
        })}
        {!selected && !visiblePeople.length ? (
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

      {salaryTotal ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 16,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.md,
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: colors.ink }]}>Total payable this month</Text>
            <Text style={[type.caption, { color: colors.muted }]}>Opened months plus projected pay</Text>
          </View>
          <Text style={{ color: colors.primary, fontFamily: fonts.display, fontSize: 20, fontVariant: ["tabular-nums"], }}>
            {formatMoneyFull(salaryTotal.totalPayableThisMonthPaise)}
          </Text>
        </View>
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
      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
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
  const currentMonth = months.find((month) => month.payrollMonth === firstOfMonth());
  const currentMonthOpened = Boolean(currentMonth);
  // Once the current month is fully paid there is nothing left to adjust or pay,
  // so those actions are blocked until the next month is opened.
  const currentMonthPaid = currentMonth?.paymentStatus === "PAID";
  const [payHistoryOpen, setPayHistoryOpen] = useState(false);
  const [payHistoryPage, setPayHistoryPage] = useState(0);
  // Client-side: the detail response already carries every month, so paging
  // here is only about how many land on screen at once.
  const payHistoryPages = Math.max(1, Math.ceil(months.length / PAY_MONTHS_PER_PAGE));
  const payHistorySafePage = Math.min(payHistoryPage, payHistoryPages - 1);
  const visibleMonths = months.slice(
    payHistorySafePage * PAY_MONTHS_PER_PAGE,
    (payHistorySafePage + 1) * PAY_MONTHS_PER_PAGE,
  );

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>{account.referenceCode}</Text>
            <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 20 }]}>{account.holderName}</Text>
            <Text style={[type.caption, { color: colors.muted }]}>{account.categoryName}  ·  {salaryRateLabel(account.salaryStructure, account.salaryRatePaise)}</Text>
          </View>
          {onClose ? <IconButton accessibilityLabel="Close salary account" icon={X} onPress={onClose} /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <AmountMetric label="Gross to date" value={formatMoneyPaise(account.grossPayToDatePaise)} />
          <AmountMetric label="Paid to date" value={formatMoneyPaise(account.paidToDatePaise)} />
        </View>
        {!readOnly ? (
          // Record pay is the action of the three, so it gets its own full-width
          // row. The two setup actions share the row above at compact size —
          // three across could not hold "Month opened" without wrapping.
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton
                compact
                disabled={currentMonthOpened}
                icon={currentMonthOpened ? CalendarCheck : CirclePlus}
                label={currentMonthOpened ? "Month opened" : "Open month"}
                onPress={() => onOpenMonth?.()}
                variant="secondary"
              />
              <ActionButton
                compact
                disabled={currentMonthPaid}
                icon={Plus}
                label="Adjustment"
                onPress={() => onAddAdjustment?.()}
                variant="secondary"
              />
            </View>
            <ActionButton
              disabled={currentMonthPaid}
              icon={ReceiptText}
              label="Record pay"
              onPress={() => onRecordPay?.()}
            />
          </View>
        ) : null}
      </View>

      {/* Collapsed by default and sitting on its own surface: the months stack
          up over a long employment, and expanded they bury the actions above.
          The count on the header is what most visits actually need. */}
      <View
        style={{
          backgroundColor: colors.surfaceRaised,
          borderCurve: "continuous",
          borderRadius: 16,
          gap: spacing.sm,
          marginTop: spacing.sm,
          padding: spacing.md,
        }}
      >
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityState={{ expanded: payHistoryOpen }}
          onPress={() => setPayHistoryOpen((current) => !current)}
          style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
        >
          <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>
            Pay history · {months.length}
          </Text>
          {payHistoryOpen ? (
            <ChevronUp color={colors.muted} size={18} strokeWidth={2.2} />
          ) : (
            <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
          )}
        </AnimatedPressable>

        {payHistoryOpen ? visibleMonths.map((month) => {
          const editable = !readOnly && month.paidAmountPaise === 0;
          const lastPayment = month.paymentStatus === "PAID" ? latestPayment(month) : null;
          return (
            <View key={month.payrollMonth} style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
                <View style={{ gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.ink }]}>{formatMonth(month.payrollMonth)}</Text>
                  <Text style={[type.caption, { color: colors.muted }]}>Opened {formatDayMonth(month.openedOn)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={[type.caption, { color: month.paymentStatus === "PAID" ? colors.successText : colors.warningText, fontWeight: "800" }]}>{month.paymentStatus.replaceAll("_", " ")}</Text>
                  {lastPayment ? (
                    <Text style={[type.caption, { color: colors.muted, fontSize: 11, textAlign: "right" }]}>{formatPaidDateTime(lastPayment)}</Text>
                  ) : null}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <AmountMetric label="Gross" value={formatMoneyPaise(month.grossAmountPaise)} />
                <AmountMetric label="Net" value={formatMoneyPaise(month.netAmountPaise)} />
                <AmountMetric label="Paid" value={formatMoneyPaise(month.paidAmountPaise)} />
              </View>
              {month.adjustments.map((adjustment) => (
                <View key={adjustment.id} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                  <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
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
        }) : null}
        {payHistoryOpen && !months.length ? (
          <EmptyState description="Open a payroll month to track additions, deductions, and manual payments." icon={Banknote} title="No salary month opened" />
        ) : null}

        {payHistoryOpen && months.length ? (
          <PaginationBar
            hasNext={payHistorySafePage + 1 < payHistoryPages}
            hasPrevious={payHistorySafePage > 0}
            onNext={() => setPayHistoryPage(payHistorySafePage + 1)}
            onPrevious={() => setPayHistoryPage(Math.max(0, payHistorySafePage - 1))}
            page={payHistorySafePage}
            totalElements={months.length}
            totalPages={payHistoryPages}
          />
        ) : null}
      </View>
    </Card>
  );
}

// Read-only card for a daily-wage employee in the salary tracker: no salary
// account exists, so we show the running payable for the current month.
function DailyPayableCard({ kind, person }: { kind: "MANAGER" | "STAFF_MEMBER"; person: ManagerEmployment | StaffMember }) {
  const { colors, type } = useTheme();
  // Managers have no weekday pattern yet, so they bill every day of the month.
  const mask = kind === "STAFF_MEMBER" ? (person as StaffMember).workingDaysMask : ALL_DAYS_MASK;
  const days = workingDaysInCurrentMonth(mask);
  const payablePaise = days * person.salaryRatePaise;
  const Icon = kind === "MANAGER" ? BriefcaseBusiness : UsersRound;
  const meta = kind === "MANAGER" ? "Manager · Daily" : `${(person as StaffMember).categoryName} · Daily`;
  return (
    <View style={rowCardStyle(colors)}>
      <View style={{ alignItems: "center", borderColor: colors.ink, borderCurve: "continuous", borderRadius: 13, borderWidth: 1, height: 46, justifyContent: "center", width: 46 }}>
        <Icon color={colors.ink} size={20} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>{meta}</Text>
        <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>{person.fullName}</Text>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{formatMoneyPaise(person.salaryRatePaise)} / day × {days} days</Text>
        {kind === "STAFF_MEMBER" ? <Text style={[type.caption, { color: colors.kicker }]} numberOfLines={1}>{weekdaysLabel(mask)}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>Payable</Text>
        <Text style={[type.bodyStrong, { color: colors.ink, fontVariant: ["tabular-nums"] }]}>{formatMoneyPaise(payablePaise)}</Text>
      </View>
    </View>
  );
}

/**
 * Team history, as a card. Opens the past-employee list in a sheet rather than
 * occupying a tab — most visits to this screen are about who works here now.
 */
function TeamHistoryCard({ property }: { property: OwnerProperty }) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);
  const query = useListEmployeeHistoryQuery({ page: 0, propertyId: property.id, size: 1 });
  const total = query.data?.totalElements ?? 0;

  return (
    <>
      <Card>
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>Team history</Text>
          <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>View past employees</Text>
          <Text style={[type.body, { color: colors.muted }]}>
            Everyone who has left this property, with their service span, settlement and payslips.
          </Text>
          <ActionButton
            icon={Clock3}
            label={`${total} record${total === 1 ? "" : "s"}`}
            onPress={() => setOpen(true)}
            variant="secondary"
          />
        </View>
      </Card>

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Team history">
          <EmployeeHistory property={property} />
        </SheetShell>
      ) : null}
    </>
  );
}

/** The same treatment for salary: every payment made at this property. */
function SalaryHistoryCard({ property }: { property: OwnerProperty }) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);
  const query = useListPropertyPayslipsQuery(property.id);
  const total = query.data?.length ?? 0;

  return (
    <>
      <Card>
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>Payment history</Text>
          <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>View payments</Text>
          <Text style={[type.body, { color: colors.muted }]}>
            Every salary payment recorded at this property, newest first.
          </Text>
          <ActionButton
            icon={Clock3}
            label={`${total} payment${total === 1 ? "" : "s"}`}
            onPress={() => setOpen(true)}
            variant="secondary"
          />
        </View>
      </Card>

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Payment history">
          <PayslipList emptyDescription="Salary payments recorded at this property will appear here." payslips={query.data ?? []} showHolder />
        </SheetShell>
      ) : null}
    </>
  );
}

/**
 * One employee's payslips. Never paid is a normal state for a new or unpaid
 * employee, so it gets an empty state rather than being treated as an error.
 */
function PayslipsSheet({
  accountReferenceCode,
  holderName,
  onClose,
  propertyId,
}: {
  accountReferenceCode: string;
  holderName: string;
  onClose: () => void;
  propertyId: string;
}) {
  const query = useListEmployeePayslipsQuery({ accountReferenceCode, propertyId });

  return (
    <SheetShell onClose={onClose} title={`Payslips — ${holderName}`}>
      <PayslipList
        emptyDescription={`${holderName} has not been paid any salary yet.`}
        loading={query.isFetching && !query.data?.length}
        payslips={query.data ?? []}
      />
    </SheetShell>
  );
}

const PAYSLIPS_PER_PAGE = 10;
const HISTORY_PER_PAGE = 10;
const PAY_MONTHS_PER_PAGE = 6;

function PayslipList({
  emptyDescription,
  loading,
  payslips,
  showHolder,
}: {
  emptyDescription: string;
  loading?: boolean;
  payslips: SalaryPayslip[];
  showHolder?: boolean;
}) {
  const { colors, type } = useTheme();
  // The endpoint returns the property's whole history in one response, so the
  // paging is client-side. A busy property accumulates a payment per employee
  // per month, which is a very long sheet by the second year.
  const [page, setPage] = useState(0);

  if (loading) {
    return <SkeletonList rows={3} />;
  }

  if (payslips.length === 0) {
    return <EmptyState description={emptyDescription} icon={ReceiptText} title="No payslips available" />;
  }

  const totalPages = Math.ceil(payslips.length / PAYSLIPS_PER_PAGE);
  const safePage = Math.min(page, totalPages - 1);
  const visible = payslips.slice(safePage * PAYSLIPS_PER_PAGE, (safePage + 1) * PAYSLIPS_PER_PAGE);

  return (
    <View style={{ gap: spacing.sm }}>
      {visible.map((payslip) => (
        <Card key={payslip.id} tone="sunken">
          <View style={{ gap: spacing.xs }}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>{monthLabel(payslip.payrollMonth)}</Text>
              <Text style={[type.caption, { color: colors.muted }]}>{humanizeToken(payslip.paymentMethod)}</Text>
            </View>
            {showHolder ? <Text style={[type.bodyStrong, { color: colors.ink }]}>{payslip.holderName}</Text> : null}
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              numberOfLines={1}
              style={[type.metric, { color: colors.ink, fontSize: 22, lineHeight: 26 }]}
            >
              {formatMoneyPaise(payslip.amountPaise)}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              Paid {formatDate(payslip.paidOn)}
              {payslip.referenceText ? `  ·  ${payslip.referenceText}` : ""}
            </Text>
            {payslip.notes ? <Text style={[type.caption, { color: colors.muted }]}>{payslip.notes}</Text> : null}
          </View>
        </Card>
      ))}

      {/* Always shown: on a single page the arrows are inert but the total is
          not, and a bar that vanishes below the page size reads as pagination
          that failed to render rather than pagination that was not needed. */}
      <PaginationBar
        hasNext={safePage + 1 < totalPages}
        hasPrevious={safePage > 0}
        onNext={() => setPage(safePage + 1)}
        onPrevious={() => setPage(Math.max(0, safePage - 1))}
        page={safePage}
        totalElements={payslips.length}
        totalPages={totalPages}
      />
    </View>
  );
}

function monthLabel(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function EmployeeHistory({ property }: { property: OwnerProperty }) {
  const { colors } = useTheme();
  const [page, setPage] = useState(0);
  // 10 a page, matching the payslip list — 20 made a single wall of cards.
  const query = useListEmployeeHistoryQuery({ page, propertyId: property.id, size: HISTORY_PER_PAGE });
  const pageData = query.data;
  const items = pageData?.items ?? [];
  // isLoading is only true on the FIRST fetch. Re-opening the sheet after the
  // cache is invalidated leaves isLoading false with no data yet, which rendered
  // "No past employees" for a frame before the rows arrived. Anything in flight
  // with nothing to show is loading, whichever fetch it is.
  const loading = query.isFetching && items.length === 0;
  const knownTotal = pageData?.totalElements;

  return (
    <View style={{ gap: spacing.lg }}>
      <Section
        title={knownTotal === undefined ? "Loading…" : `${knownTotal} record${knownTotal === 1 ? "" : "s"}`}
      >
        {loading ? (
          <SkeletonCard />
        ) : items.length ? (
          <View style={{ gap: spacing.sm, opacity: query.isFetching ? 0.6 : 1 }}>
            {items.map((item) => (
              <HistoryCard item={item} key={`${item.holderType}-${item.referenceCode}`} propertyId={property.id} />
            ))}
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

function HistoryCard({ item, propertyId }: { item: EmployeeHistoryItem; propertyId: string }) {
  const { colors, type } = useTheme();
  const [payslipsOpen, setPayslipsOpen] = useState(false);
  const Icon = item.holderType === "MANAGER" ? BriefcaseBusiness : UsersRound;
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: 14, height: 48, justifyContent: "center", width: 48 }}>
            <Icon color={colors.muted} size={22} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>{item.holderType === "MANAGER" ? "Manager" : item.categoryName}</Text>
            <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 18 }]}>{item.fullName}</Text>
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{item.referenceCode}  ·  {salaryRateLabel(item.salaryStructure, item.salaryRatePaise)}</Text>
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

        {/* On every card, whether or not this person was ever paid. Hiding it
            for the unpaid would make its absence a silent claim; the sheet says
            "no payslips available" instead, which is checkable. */}
        <ActionButton
          icon={ReceiptText}
          label="View payslips"
          onPress={() => setPayslipsOpen(true)}
          variant="secondary"
        />
      </View>

      {payslipsOpen ? (
        item.salaryAccountReferenceCode ? (
          <PayslipsSheet
            accountReferenceCode={item.salaryAccountReferenceCode}
            holderName={item.fullName}
            onClose={() => setPayslipsOpen(false)}
            propertyId={propertyId}
          />
        ) : (
          // No salary account was ever opened, so there is nothing to query.
          <SheetShell onClose={() => setPayslipsOpen(false)} title={`Payslips — ${item.fullName}`}>
            <EmptyState
              description={`${item.fullName} never had a salary account opened, so no payslips exist.`}
              icon={ReceiptText}
              title="No payslips available"
            />
          </SheetShell>
        )
      ) : null}
    </Card>
  );
}

function HistoryNote({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 3, padding: spacing.md }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]}>{label}</Text>
      <Text style={[type.body, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}



/**
 * The staff-category filter: a single row showing what is selected, opening the
 * full list in a sheet.
 */
function CategoryFilterBar({
  categories,
  onCreate,
  onDelete,
  onSelect,
  selected,
}: {
  categories: StaffCategory[];
  onCreate: () => void;
  onDelete: (category: StaffCategory) => void;
  onSelect: (name: string | null) => void;
  selected: string | null;
}) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Filter color={colors.kicker} size={16} strokeWidth={2.2} />
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.kicker }]}>Category</Text>
          <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
            {selected ?? "All staff"}
          </Text>
        </View>
        <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
      </AnimatedPressable>

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Filter by category">
          <View style={{ gap: spacing.xs }}>
            <CategoryRow
              active={!selected}
              label="All staff"
              onPress={() => {
                onSelect(null);
                setOpen(false);
              }}
            />
            {categories.map((category) => (
              <CategoryRow
                active={selected === category.name}
                key={category.id}
                label={category.name}
                onDelete={category.system ? undefined : () => onDelete(category)}
                onPress={() => {
                  onSelect(category.name);
                  setOpen(false);
                }}
              />
            ))}
            <ActionButton
              icon={Plus}
              label="New category"
              onPress={() => {
                setOpen(false);
                onCreate();
              }}
              variant="secondary"
            />
          </View>
        </SheetShell>
      ) : null}
    </>
  );
}

function CategoryRow({
  active,
  label,
  onDelete,
  onPress,
}: {
  active: boolean;
  label: string;
  onDelete?: () => void;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.ink : "transparent",
        borderColor: active ? colors.ink : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
      }}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={{ flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}
      >
        <Text style={[type.bodyStrong, { color: active ? colors.surface : colors.ink }]}>{label}</Text>
      </AnimatedPressable>
      {onDelete ? (
        <AnimatedPressable
          accessibilityLabel={`Delete ${label} category`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDelete}
          style={{ alignItems: "center", alignSelf: "stretch", justifyContent: "center", paddingHorizontal: spacing.md }}
        >
          {/* On a selected row the fill is colors.ink, so the glyph takes
              colors.surface instead — danger red on that ground is unreadable in
              one theme or the other, and an illegible delete is worse than an
              uncoloured one. Every unselected row shows it red. */}
          <Trash2 color={active ? colors.surface : colors.danger} size={16} strokeWidth={2.2} />
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
        <View style={{ alignItems: "center", borderColor: colors.ink, borderCurve: "continuous", borderRadius: 13, borderWidth: 1, height: 46, justifyContent: "center", width: 46 }}>
          <BriefcaseBusiness color={colors.ink} size={20} strokeWidth={2.1} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>{employment?.referenceCode ?? "Manager"}</Text>
          <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>{assignment.managerFullName}</Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {employment ? salaryRateLabel(employment.salaryStructure, employment.salaryRatePaise) : assignment.managerPhone}
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </AnimatedPressable>
      <IconButton accessibilityLabel={`Edit employment for ${assignment.managerFullName}`} icon={Pencil} onPress={onEdit} />
    </View>
  );
}

function ManagerDetailModal({ entry, onClose, onEdit, onPermissions, onRemove, onShift, shiftTargets }: {
  entry: ManagerDirectoryEntry;
  onClose: () => void;
  onEdit: () => void;
  onPermissions: () => void;
  onRemove: () => void;
  onShift: (target: OwnerProperty) => void;
  shiftTargets: OwnerProperty[];
}) {
  const { colors, type } = useTheme();
  const { assignment, employment } = entry;
  return (
    <Sheet onClose={onClose} title="Manager details">
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View style={{ alignItems: "center", borderColor: colors.ink, borderRadius: 30, borderWidth: 1, height: 60, justifyContent: "center", width: 60 }}>
          <BriefcaseBusiness color={colors.ink} size={28} strokeWidth={2.1} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 22 }]}>{assignment.managerFullName}</Text>
          <Text style={[type.caption, { color: colors.muted }]}>{assignment.managerPhone}</Text>
          <Text style={[type.caption, { color: colors.kicker }]}>{employment?.referenceCode ?? "Employment record loading"}</Text>
        </View>
      </View>
      <Card>
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>Account</Text>
          <DetailRow label="Phone verified" value={assignment.phoneVerified ? "Verified" : "Not verified"} />
          <DetailRow label="Profile" value={assignment.profileCompleted ? "Completed" : "Incomplete"} />
          <DetailRow label="Account status" value={assignment.accountActive ? "Active" : "Inactive"} />
          <DetailRow label="Assigned on" value={formatDate(assignment.createdAt)} />
        </View>
      </Card>
      {employment ? (
        <Card>
          <View style={{ gap: spacing.sm }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>Employment</Text>
            <DetailRow label="Salary" value={salaryRateLabel(employment.salaryStructure, employment.salaryRatePaise)} />
            <DetailRow label="Start date" value={employment.employmentStartDate ? formatDate(employment.employmentStartDate) : "Not set"} />
            <DetailRow label="Benefits" value={employment.benefitsSummary || "None recorded"} />
          </View>
        </Card>
      ) : null}
      <ActionButton icon={Pencil} label="Edit employment" onPress={onEdit} variant="secondary" />
      {/* Separate from employment on purpose: pay and access are different
          decisions, and bundling them hides the one that matters for safety. */}
      <ActionButton icon={ShieldCheck} label="Access permissions" onPress={onPermissions} variant="secondary" />
      {shiftTargets.length ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>Transfer to property</Text>
          {shiftTargets.map((target) => (
            <AnimatedPressable key={target.id} onPress={() => onShift(target)} style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
              <ArrowLeftRight color={colors.primary} size={18} />
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: colors.ink }]}>{target.name}</Text>
                <Text style={[type.caption, { color: colors.muted }]}>{[target.city, target.state].filter(Boolean).join(", ")}</Text>
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
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text style={[type.caption, { color: colors.ink, flex: 1, fontWeight: "700", textAlign: "right" }]}>{value}</Text>
    </View>
  );
}
// Shared lift so the staff row cards float off the background like the rest of
// the app's clickable cards.
function rowCardStyle(colors: { surface: string; borderStrong: string }) {
  return {
    alignItems: "center" as const,
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderCurve: "continuous" as const,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: spacing.sm,
    padding: spacing.md,
  };
}

function PersonCard({ icon: Icon, meta, onPress, subtitle, title }: { icon: typeof UsersRound; meta: string; onPress: () => void; subtitle: string; title: string }) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable onPress={onPress} style={rowCardStyle(colors)}>
      <View style={{ alignItems: "center", borderColor: colors.ink, borderCurve: "continuous", borderRadius: 13, borderWidth: 1, height: 46, justifyContent: "center", width: 46 }}>
        <Icon color={colors.ink} size={20} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>{meta}</Text>
        <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </AnimatedPressable>
  );
}

function AmountMetric({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, flex: 1, gap: 2, padding: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
      {/* Shrinks to fit rather than clipping. Three of these share a row, so a
          six-figure amount has roughly a third of the width — MetricTile solves
          the same problem the same way. */}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[type.bodyStrong, { color: colors.ink, fontVariant: ["tabular-nums"] }]}
      >
        {value}
      </Text>
    </View>
  );
}

function CreateCategoryModal({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const [name, setName] = useState("");
  const [createCategory, state] = useCreateStaffCategoryMutation();
  const fieldErrors = useFormErrors<"name">();

  async function submit() {
    // Submitting an empty name used to do nothing at all — no request, no
    // message, a button that simply did not respond.
    if (!fieldErrors.validate(name.trim() ? {} : { name: "Enter a category name." })) {
      return;
    }
    try {
      await createCategory({ name: name.trim(), propertyId }).unwrap();
      onClose();
    } catch (error) {
      fieldErrors.failFromServer(errorMessage(error, "Could not create the category."));
    }
  }
  return <Sheet onClose={onClose} title="New staff category"><FormInput error={fieldErrors.errors.name} label="Category name" onChangeText={(next) => { setName(next); fieldErrors.clearField("name"); }} placeholder="e.g. Laundry" value={name} /><ActionButton disabled={state.isLoading || fieldErrors.blocked} icon={Plus} label={state.isLoading ? "Creating" : "Create category"} onPress={() => void submit()} />{fieldErrors.serverError ? <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} /> : null}</Sheet>;
}


/**
 * The access decision for a manager who has just been assigned.
 *
 * <p>
 * Its own modal, owned by the workspace rather than by the add-manager sheet,
 * because the "Configure permissions" path leaves this screen entirely. When the
 * sheet owned this step it called onClose before navigating, so returning with
 * the back button landed on the staff list with the choice destroyed and a
 * manager holding no access at all.
 *
 * <p>
 * While the permissions screen is open this modal is hidden rather than
 * unmounted — a React Native Modal is a separate window and would otherwise
 * cover the screen it just pushed. On return it re-reads the manager's grants:
 * if the owner saved something, there is nothing left to ask and it closes
 * itself; if they backed out without saving, the two paths are still there.
 */
function ManagerAccessModal({
  manager,
  onClose,
  propertyId,
}: {
  manager: { managerUserId: string; name: string };
  onClose: () => void;
  propertyId: string;
}) {
  // Saving permissions can fail after the manager already exists; that refusal
  // has no field of its own.
  const permErrors = useFormErrors<never>();

  const router = useRouter();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [configuring, setConfiguring] = useState(false);
  const [confirmFullAccess, setConfirmFullAccess] = useState(false);
  const [replacePermissions, permissionsState] = useReplaceManagerPermissionsMutation();
  const permissionsQuery = useGetManagerPermissionsQuery({ managerUserId: manager.managerUserId, propertyId });

  useFocusEffect(
    useCallback(() => {
      if (!configuring) {
        return;
      }
      setConfiguring(false);
      void permissionsQuery.refetch().then((result) => {
        const levels = result.data?.levels ?? {};
        if (Object.values(levels).some((level) => level && level !== "NONE")) {
          onClose();
        }
      });
    }, [configuring, onClose, permissionsQuery]),
  );

  async function grantFullAccess() {
    try {
      await replacePermissions({
        levels: fullAccessLevels() as Record<ManagerResource, ManagerAccessLevel>,
        managerUserId: manager.managerUserId,
        propertyId,
      }).unwrap();
      setConfirmFullAccess(false);
      onClose();
      toast.show(`${manager.name} has full access. You can change this any time.`);
    } catch {
      setConfirmFullAccess(false);
      permErrors.failFromServer("Could not save permissions. Open the manager and set them manually.");
    }
  }

  if (configuring) {
    return null;
  }

  return (
    <Sheet onClose={onClose} title="Manager access">
      <Text style={[type.body, { color: colors.ink }]}>
        {manager.name} is assigned to this property but has no access yet. Managers start with nothing.
      </Text>
      <ActionButton
        icon={ShieldCheck}
        label="Configure permissions"
        onPress={() => {
          setConfiguring(true);
          router.push({
            params: { managerName: manager.name, managerUserId: manager.managerUserId, propertyId },
            pathname: "/owner-manager-permissions",
          });
        }}
      />
      <ActionButton
        disabled={permissionsState.isLoading}
        label={permissionsState.isLoading ? "Granting" : "Continue without configuring"}
        onPress={() => setConfirmFullAccess(true)}
        variant="secondary"
      />
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        Continuing without configuring gives them full access to every module you can currently manage. You can change it
        any time from their profile.
      </Text>
      {permErrors.serverError ? <AlertModal message={permErrors.serverError} onClose={permErrors.dismissServerError} /> : null}

      {confirmFullAccess ? (
        <ConfirmDialog
          // Built from the modules actually being granted, so the list cannot
          // drift from what fullAccessLevels() writes when a module converts.
          bullets={MANAGEABLE_MODULES.map((module) => `${module.label} — ${module.description.replace(/\.$/, "")}`)}
          confirmLabel="Give full access"
          destructive
          footnote="Staff management and salaries stay owner-only. You can change any of this later from their profile."
          message={`${manager.name} gets full control of these, immediately:`}
          onCancel={() => setConfirmFullAccess(false)}
          onConfirm={() => void grantFullAccess()}
          title="Full access without configuring?"
        />
      ) : null}
    </Sheet>
  );
}

function AddManagerModal({
  onAssigned,
  onClose,
  propertyId,
}: {
  onAssigned: (manager: { managerUserId: string; name: string }) => void;
  onClose: () => void;
  propertyId: string;
}) {
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [salaryStructure, setSalaryStructure] = useState<SalaryStructure>("MONTHLY");
  const [salary, setSalary] = useState("");
  const [benefits, setBenefits] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lookup, setLookup] = useState<ManagerLookup | null>(null);
  const mgrErrors = useFormErrors<"phone" | "fullName" | "salary" | "startDate">();
  const [runLookup, lookupState] = useLazyLookupManagerQuery();
  const [addManager, state] = useAddPropertyManagerMutation();

  function changePhone(value: string) {
    setPhone(value);
    setFullName("");
    setLookup(null);
    mgrErrors.clearAll();
  }

  async function doLookup() {
    if (!mgrErrors.validate(/^\d{10,15}$/.test(phone.trim()) ? {} : { phone: "Enter a valid phone number." })) {
      return;
    }
    try {
      const result = await runLookup({ phone: phone.trim(), propertyId }).unwrap();
      setLookup(result);
      if (result.exists && result.fullName) setFullName(result.fullName);
    } catch (error) {
      mgrErrors.failFromServer(errorMessage(error, "Could not look up this phone number. Try again."));
    }
  }

  async function submit() {
    const salaryRatePaise = rupeesToPaise(salary);
    // The lookup gate belongs on the phone field: it is that number that has
    // not been checked, or has come back ineligible.
    const problems = {
      ...(lookup?.eligible
        ? {}
        : { phone: lookup?.message ?? "Look up the phone number before assigning a manager." }),
      ...(fullName.trim() ? {} : { fullName: "Enter the manager's name." }),
      ...(salaryRatePaise ? {} : { salary: "Enter a valid amount." }),
      ...(startDate ? {} : { startDate: "Pick a working start date." }),
    };
    if (!mgrErrors.validate(problems) || !salaryRatePaise) {
      return;
    }
    try {
      const created = await addManager({
        propertyId,
        payload: {
          phone: phone.trim(),
          fullName: fullName.trim(),
          dateOfBirth: dateOfBirth || null,
          salaryStructure,
          salaryRatePaise,
          benefitsSummary: benefits,
          employmentStartDate: startDate,
          employmentEndDate: null,
          employmentNotes: notes,
        },
      }).unwrap();
      // A new manager holds NO permissions: absence is NONE, so they can see the
      // workspace and open nothing. Closing here would leave the owner with a
      // manager who cannot work and no hint why, so the decision is made now.
      onAssigned({ managerUserId: created.managerUserId, name: fullName.trim() });
      toast.show("Manager assigned. Now choose their access.");
    } catch (error) {
      mgrErrors.failFromServer(errorMessage(error, "Could not assign the manager. Check the details and try again."));
    }
  }

  return (
    <Sheet onClose={onClose} title="Assign manager">
      <FormInput error={mgrErrors.errors.phone} keyboardType="phone-pad" label="Phone number" onChangeText={(next) => { changePhone(next); mgrErrors.clearField("phone"); }} placeholder="10-digit phone" value={phone} />
      <ActionButton disabled={lookupState.isFetching} icon={Search} label={lookupState.isFetching ? "Looking up" : "Look up"} onPress={() => void doLookup()} variant="secondary" />
      {lookup ? <ManagerLookupResult lookup={lookup} /> : null}
      {lookup?.eligible ? (
        <>
          <FormInput error={mgrErrors.errors.fullName} label="Full name" onChangeText={(next) => { setFullName(next); mgrErrors.clearField("fullName"); }} placeholder="Manager name" value={fullName} />
          <DatePickerField clearable label="Date of birth" onChange={setDateOfBirth} value={dateOfBirth} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ChoiceButton active={salaryStructure === "MONTHLY"} label="Monthly" onPress={() => setSalaryStructure("MONTHLY")} />
            <ChoiceButton active={salaryStructure === "DAILY"} label="Daily" onPress={() => setSalaryStructure("DAILY")} />
          </View>
          <FormInput error={mgrErrors.errors.salary} keyboardType="decimal-pad" label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"} onChangeText={(next) => { setSalary(next); mgrErrors.clearField("salary"); }} placeholder="0" prefix="₹" value={salary} />
          <FormInput label="Benefits provided" multiline onChangeText={setBenefits} placeholder="Optional benefits" value={benefits} />
          <DatePickerField label="Working start date" onChange={(next) => { setStartDate(next); mgrErrors.clearField("startDate"); }} value={startDate} />
          <FieldError message={mgrErrors.errors.startDate} />
          <FormInput label="Notes" multiline onChangeText={setNotes} placeholder="Optional employment notes" value={notes} />
        </>
      ) : null}
      {mgrErrors.serverError ? <AlertModal message={mgrErrors.serverError} onClose={mgrErrors.dismissServerError} /> : null}
      {lookup?.eligible ? <ActionButton disabled={state.isLoading || mgrErrors.blocked} icon={Plus} label={state.isLoading ? "Assigning" : "Assign manager"} onPress={() => void submit()} /> : null}
    </Sheet>
  );
}

function StaffMemberModal({ categories, member, onClose, onEnd, propertyId }: { categories: StaffCategory[]; member: StaffMember | null; onClose: () => void; onEnd?: () => void; propertyId: string }) {
  const toast = useToast();
  const { colors, type } = useTheme();
  const [categoryId, setCategoryId] = useState(categories.find((category) => category.name === member?.categoryName)?.id ?? categories[0]?.id ?? "");
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [birthDate, setBirthDate] = useState(member?.dateOfBirth ?? "");
  const [salaryStructure, setSalaryStructure] = useState<SalaryStructure>(member?.salaryStructure ?? "MONTHLY");
  const [salary, setSalary] = useState(member ? paiseToRupees(member.salaryRatePaise) : "");
  const [workingDaysMask, setWorkingDaysMask] = useState<number>(member?.workingDaysMask ?? ALL_DAYS_MASK);
  const [benefits, setBenefits] = useState(member?.benefitsSummary ?? "");
  const [startDate, setStartDate] = useState(member?.employmentStartDate ?? today());
  const [notes, setNotes] = useState(member?.employmentNotes ?? "");
  const [createMember, createState] = useCreateStaffMemberMutation();
  const [updateMember, updateState] = useUpdateStaffMemberMutation();
  const fieldErrors = useFormErrors<"category" | "fullName" | "salary" | "startDate" | "workingDays">();
  const saving = createState.isLoading || updateState.isLoading;
  const dailyEstPaise = workingDaysInCurrentMonth(workingDaysMask) * (rupeesToPaise(salary) ?? 0);
  async function submit() {
    const salaryRatePaise = rupeesToPaise(salary);
    // One message naming four fields made the reader work out which was
    // missing; each now sits under the input it means.
    const problems = {
      ...(categoryId ? {} : { category: "Pick a category." }),
      ...(fullName.trim() ? {} : { fullName: "Enter the staff member's name." }),
      ...(salaryRatePaise ? {} : { salary: "Enter a valid amount." }),
      ...(startDate ? {} : { startDate: "Pick a start date." }),
      ...(salaryStructure === "DAILY" && workingDaysMask <= 0
        ? { workingDays: "Select at least one working day." }
        : {}),
    };
    if (!fieldErrors.validate(problems) || !salaryRatePaise) {
      return;
    }
    const payload = { benefitsSummary: benefits, categoryId, dateOfBirth: birthDate || null, employmentEndDate: member?.employmentEndDate ?? null, employmentNotes: notes, employmentStartDate: startDate, fullName: fullName.trim(), identityVerificationStatus: member?.identityVerificationStatus ?? "NOT_STARTED" as const, salaryRatePaise, salaryStructure, workingDaysMask: salaryStructure === "DAILY" ? workingDaysMask : ALL_DAYS_MASK };
    try {
      if (member) await updateMember({ payload, propertyId, staffReferenceCode: member.referenceCode }).unwrap();
      else await createMember({ payload, propertyId }).unwrap();
      onClose();
      toast.show(member ? "Staff member updated successfully." : "Staff member added successfully.");
    } catch (error) {
      fieldErrors.failFromServer(errorMessage(error, "Could not save the staff member. Check the details and try again."));
    }
  }
  return (
    <Sheet onClose={onClose} title={member ? "Edit staff member" : "Add staff member"}>
      {/* A picker rather than a chip wrap: categories are owner-defined and
          unbounded, and a dozen of them pushed the rest of the form off-screen. */}
      <SingleOptionPicker
        label="Category"
        onChange={(next) => { setCategoryId(next); fieldErrors.clearField("category"); }}
        options={categories.map((category) => ({ label: category.name, value: category.id }))}
        required
        value={categoryId}
      />
      <FieldError message={fieldErrors.errors.category} />
      <FormInput error={fieldErrors.errors.fullName} label="Full name" onChangeText={(next) => { setFullName(next); fieldErrors.clearField("fullName"); }} placeholder="Staff member name" value={fullName} />
      <DatePickerField clearable label="Date of birth" onChange={setBirthDate} value={birthDate} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}><ChoiceButton active={salaryStructure === "MONTHLY"} label="Monthly" onPress={() => setSalaryStructure("MONTHLY")} /><ChoiceButton active={salaryStructure === "DAILY"} label="Daily" onPress={() => setSalaryStructure("DAILY")} /></View>
      <FormInput error={fieldErrors.errors.salary} keyboardType="decimal-pad" label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"} onChangeText={(next) => { setSalary(next); fieldErrors.clearField("salary"); }} placeholder="0" prefix="₹" value={salary} />
      {salaryStructure === "DAILY" ? (
        <>
          <WeekdayPicker mask={workingDaysMask} onChange={(next) => { setWorkingDaysMask(next); fieldErrors.clearField("workingDays"); }} />
          <FieldError message={fieldErrors.errors.workingDays} />
          <Text style={[type.caption, { color: colors.muted }]}>
            {workingDaysInCurrentMonth(workingDaysMask)} working days this month{dailyEstPaise ? ` · est. ${formatMoneyFull(dailyEstPaise)}` : ""}
          </Text>
        </>
      ) : null}
      <FormInput label="Benefits provided" multiline onChangeText={setBenefits} placeholder="Optional benefits" value={benefits} />
      <DatePickerField label="Working start date" onChange={setStartDate} value={startDate} />
      <FormInput label="Notes" multiline onChangeText={setNotes} placeholder="Optional employment notes" value={notes} />
      <ActionButton disabled={saving || fieldErrors.blocked} icon={Pencil} label={saving ? "Saving" : "Save member"} onPress={() => void submit()} />
      {fieldErrors.serverError ? <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} /> : null}
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
  const [notes, setNotes] = useState(manager.employmentNotes);
  const empErrors = useFormErrors<"salary" | "startDate">();
  const [updateManager, state] = useUpdateManagerEmploymentMutation();

  async function submit() {
    const salaryRatePaise = rupeesToPaise(salary);
    const problems = {
      ...(salaryRatePaise ? {} : { salary: "Enter a valid amount." }),
      ...(startDate ? {} : { startDate: "Pick a working start date." }),
    };
    if (!empErrors.validate(problems) || !salaryRatePaise) {
      return;
    }
    try {
      await updateManager({
        managerReferenceCode: manager.referenceCode,
        payload: {
          benefitsSummary: benefits,
          dateOfBirth: birthDate || null,
          // Preserved, not cleared. The field is gone from this form — the end
          // flow owns the leaving date — so sending null here would silently
          // cancel a scheduled end every time the record was edited.
          employmentEndDate: manager.employmentEndDate ?? null,
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
      empErrors.failFromServer(errorMessage(error, "Could not save manager employment details."));
    }
  }

  return (
    <Sheet onClose={onClose} subtitle={manager.fullName} title="Edit manager employment">
      <DatePickerField clearable label="Date of birth" onChange={setBirthDate} value={birthDate} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ChoiceButton active={salaryStructure === "MONTHLY"} label="Monthly" onPress={() => setSalaryStructure("MONTHLY")} />
        <ChoiceButton active={salaryStructure === "DAILY"} label="Daily" onPress={() => setSalaryStructure("DAILY")} />
      </View>
      <FormInput error={empErrors.errors.salary} keyboardType="decimal-pad" label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"} onChangeText={(next) => { setSalary(next); empErrors.clearField("salary"); }} placeholder="0" prefix="₹" value={salary} />
      <FormInput label="Benefits provided" multiline onChangeText={setBenefits} placeholder="Optional benefits" value={benefits} />
      <DatePickerField label="Working start date" onChange={(next) => { setStartDate(next); empErrors.clearField("startDate"); }} value={startDate} />
      <FieldError message={empErrors.errors.startDate} />
      <FormInput label="Notes" multiline onChangeText={setNotes} placeholder="Optional employment notes" value={notes} />
      {empErrors.serverError ? <AlertModal message={empErrors.serverError} onClose={empErrors.dismissServerError} /> : null}
      <ActionButton disabled={state.isLoading || empErrors.blocked} icon={Pencil} label={state.isLoading ? "Saving" : "Save manager employment"} onPress={() => void submit()} />
    </Sheet>
  );
}
function OpenMonthModal({ account, onClose, onSaved, propertyId }: { account: SalaryAccountDetail; onClose: () => void; onSaved: (value: SalaryAccountDetail) => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const [openMonth, state] = useOpenSalaryMonthMutation();
  // No fields on this sheet — it is a confirm. Any refusal is a server one.
  const opErrors = useFormErrors<never>();
  async function submit() {
    try {
      onSaved(await openMonth({ accountReferenceCode: account.account.referenceCode, propertyId }).unwrap());
      onClose();
    } catch (error) {
      opErrors.failFromServer(errorMessage(error, "Could not open salary month."));
    }
  }
  return <Sheet onClose={onClose} title="Open salary month"><Text style={[type.body, { color: colors.muted }]}>Open {formatMonth(firstOfMonth())} for {account.account.holderName}. It will be recorded as opened today.</Text><ActionButton disabled={state.isLoading} label={state.isLoading ? "Opening" : "Open month"} onPress={() => void submit()} />{opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}</Sheet>;
}

function formatDayMonth(value: string) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00`)); }

// The completing payment for a paid month — used to show when it was settled.
function latestPayment(month: SalaryMonth): SalaryPayment | null {
  if (!month.payments.length) {
    return null;
  }
  return month.payments.reduce((latest, payment) => (payment.recordedAt > latest.recordedAt ? payment : latest));
}

// Payment date (the chosen pay date) plus the time it was recorded, e.g.
// "12 Jun 2026 · 3:45 PM". No "Paid" prefix — this line sits directly under the
// PAID status pill, which has already said it.
function formatPaidDateTime(payment: SalaryPayment) {
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${payment.paidOn}T00:00:00`));
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: true, minute: "2-digit" }).format(new Date(payment.recordedAt));
  return `${date} · ${time}`;
}

function AdjustmentModal({ account, editing, onClose, onSaved, propertyId }: { account: SalaryAccountDetail; editing?: { payrollMonth: string; adjustment: SalaryAdjustment } | null; onClose: () => void; onSaved: (value: SalaryAccountDetail) => void; propertyId: string }) {
  const toast = useToast();
  const payrollMonth = editing?.payrollMonth ?? account.months[0]?.payrollMonth;
  const [type, setType] = useState<SalaryAdjustmentType>(editing?.adjustment.adjustmentType ?? "ADDITION");
  const [amount, setAmount] = useState(editing ? paiseToRupees(editing.adjustment.amountPaise) : "");
  const [reason, setReason] = useState(editing?.adjustment.reason ?? "");
  const [addAdjustment, addState] = useAddSalaryAdjustmentMutation();
  const [updateAdjustment, updateState] = useUpdateSalaryAdjustmentMutation();
  const saving = addState.isLoading || updateState.isLoading;
  const fieldErrors = useFormErrors<"amount" | "reason">();

  async function submit() {
    // Not about a field: no month is open, so there is nothing on this sheet
    // to correct. It ends the attempt, so it takes the modal.
    if (!payrollMonth) {
      fieldErrors.failFromServer("Open a salary month before recording an adjustment.");
      return;
    }

    const amountPaise = rupeesToPaise(amount);
    const problems = {
      ...(amountPaise ? {} : { amount: "Enter a valid amount." }),
      ...(reason.trim() ? {} : { reason: "Enter a reason." }),
    };
    if (!fieldErrors.validate(problems) || !amountPaise) {
      return;
    }

    const payload = { adjustmentType: type, amountPaise, reason: reason.trim() };
    try {
      const detail = editing
        ? await updateAdjustment({ accountReferenceCode: account.account.referenceCode, adjustmentId: editing.adjustment.id, payload, payrollMonth, propertyId }).unwrap()
        : await addAdjustment({ accountReferenceCode: account.account.referenceCode, payload, payrollMonth, propertyId }).unwrap();
      onSaved(detail);
      onClose();
    } catch (error) {
      fieldErrors.failFromServer(errorMessage(error, "Could not save the salary adjustment."));
    }
  }
  return <Sheet onClose={onClose} title={editing ? "Edit adjustment" : "Salary adjustment"}><View style={{ flexDirection: "row", gap: spacing.sm }}><ChoiceButton active={type === "ADDITION"} label="Addition" onPress={() => setType("ADDITION")} /><ChoiceButton active={type === "DEDUCTION"} label="Deduction" onPress={() => setType("DEDUCTION")} /></View><FormInput error={fieldErrors.errors.amount} keyboardType="decimal-pad" label="Amount" onChangeText={(next) => { setAmount(next); fieldErrors.clearField("amount"); }} placeholder="0" prefix="₹" value={amount} /><FormInput error={fieldErrors.errors.reason} label="Reason" multiline onChangeText={(next) => { setReason(next); fieldErrors.clearField("reason"); }} placeholder="e.g. Performance incentive" value={reason} /><ActionButton disabled={saving || fieldErrors.blocked} label={saving ? "Saving" : "Save adjustment"} onPress={() => void submit()} />{fieldErrors.serverError ? <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} /> : null}</Sheet>;
}

function SalaryPaymentModal({ account, onClose, onSaved, propertyId }: { account: SalaryAccountDetail; onClose: () => void; onSaved: (value: SalaryAccountDetail) => void; propertyId: string }) {
  const toast = useToast();
  const latest = account.months[0];
  const [amount, setAmount] = useState(latest ? paiseToRupees(latest.netAmountPaise - latest.paidAmountPaise) : "");
  const [method, setMethod] = useState<SalaryPaymentMethod>("CASH");
  const [referenceText, setReferenceText] = useState("");
  const [notes, setNotes] = useState("");
  const [recordPayment, state] = useRecordSalaryPaymentMutation();
  const fieldErrors = useFormErrors<"amount">();

  async function submit() {
    if (!latest) {
      fieldErrors.failFromServer("Open a salary month before recording a payment.");
      return;
    }

    const amountPaise = rupeesToPaise(amount);
    if (!fieldErrors.validate(amountPaise ? {} : { amount: "Enter a valid payment amount." }) || !amountPaise) {
      return;
    }

    try {
      onSaved(await recordPayment({ accountReferenceCode: account.account.referenceCode, payrollMonth: latest.payrollMonth, payload: { amountPaise, notes, paidOn: today(), paymentMethod: method, referenceText }, propertyId }).unwrap());
      onClose();
    } catch (error) {
      fieldErrors.failFromServer(errorMessage(error, "Could not record salary payment."));
    }
  }
  return <Sheet onClose={onClose} title="Record manual payment"><FormInput error={fieldErrors.errors.amount} keyboardType="decimal-pad" label="Amount paid" onChangeText={(next) => { setAmount(next); fieldErrors.clearField("amount"); }} placeholder="0" prefix="₹" value={amount} /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>{(["CASH", "UPI", "BANK_TRANSFER", "OTHER"] as SalaryPaymentMethod[]).map((item) => <ChoiceButton active={method === item} key={item} label={item.replaceAll("_", " ")} onPress={() => setMethod(item)} />)}</View><FormInput label="Reference" onChangeText={setReferenceText} placeholder="Optional receipt or transfer reference" value={referenceText} /><FormInput label="Notes" multiline onChangeText={setNotes} placeholder="Optional notes" value={notes} /><ActionButton disabled={state.isLoading || fieldErrors.blocked} label={state.isLoading ? "Recording" : "Record payment"} onPress={() => void submit()} />{fieldErrors.serverError ? <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} /> : null}</Sheet>;
}

// Ends a manager or staff employment. For monthly employees this also runs the
// full-and-final settlement (clears outstanding salary + an optional extra
// amount) atomically on the server. Daily-wage employees have no salary account,
// so we collect only a reason and review.
export type EndMode = "now" | "scheduled";

/** The fork: end today, or write down a last working day in the future. */
function EndEmploymentChoiceSheet({
  name,
  onClose,
  onPick,
}: {
  name: string;
  onClose: () => void;
  onPick: (mode: EndMode) => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Sheet onClose={onClose} subtitle={name} title="End employment">
      <Text style={[type.body, { color: colors.muted }]}>Choose an option</Text>
      <ActionButton icon={Trash2} label="End now" onPress={() => onPick("now")} variant="danger" />
      <ActionButton icon={CalendarCheck} label="Schedule end" onPress={() => onPick("scheduled")} variant="secondary" />
    </Sheet>
  );
}

function EndEmploymentSheet({
  mode,
  onClose,
  propertyId,
  target,
}: {
  mode: EndMode;
  onClose: () => void;
  propertyId: string;
  target: EndTarget;
}) {
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
  const [scheduledDate, setScheduledDate] = useState("");
  const endErrors = useFormErrors<"reason" | "scheduledDate">();
  const saving = endStaffState.isLoading || endManagerState.isLoading;
  const scheduling = mode === "scheduled";

  const hasAccount = !isDaily && Boolean(preview?.hasSalaryAccount);
  const outstandingPaise = hasAccount ? preview?.outstandingPaise ?? 0 : 0;
  const additionalPaise = rupeesToPaise(additional) ?? 0;
  const totalSettlementPaise = outstandingPaise + additionalPaise;
  const showSettlement = !isDaily && !scheduling;

  async function submit() {
    // All three checked together, each against the control it means.
    const problems = {
      ...(reason.trim() ? {} : { reason: "Give a reason for ending this employment." }),
      ...(scheduling && !scheduledDate ? { scheduledDate: "Pick the last working day." } : {}),
      ...(scheduling && scheduledDate && scheduledDate <= today()
        ? { scheduledDate: "A scheduled last day must be in the future. Use End now instead." }
        : {}),
    };
    if (!endErrors.validate(problems)) {
      return;
    }
    // Nothing settles when scheduling: they keep working and keep earning until
    // the day arrives, so there is no final figure yet.
    const settling = !scheduling && totalSettlementPaise > 0;
    const payload: EndEmploymentPayload = {
      additionalAmountPaise: scheduling ? 0 : additionalPaise,
      endDate: scheduling ? scheduledDate : null,
      paidOn: settling ? today() : null,
      paymentMethod: settling ? method : null,
      reason: reason.trim(),
      review: review.trim() || undefined,
      settlementNotes: scheduling ? undefined : settlementNotes.trim() || undefined,
    };
    try {
      if (target.kind === "STAFF") await endStaff({ payload, propertyId, staffReferenceCode: target.referenceCode }).unwrap();
      else await endManager({ managerReferenceCode: target.referenceCode, payload, propertyId }).unwrap();
      onClose();
      toast.show(
        scheduling
          ? `${target.name}'s last working day is set.`
          : `${target.name}'s employment has been ended.`,
      );
    } catch (error) {
      endErrors.failFromServer(errorMessage(error, "Could not end the employment. Try again."));
    }
  }

  return (
    <Sheet onClose={onClose} subtitle={target.name} title={scheduling ? "Schedule end" : "End now"}>
      {scheduling ? (
        <>
          <NoticeBar
            message="Pay and access continue as normal. Nothing is settled now — the final amount is worked out when the day arrives."
            title="They keep working until that day"
            tone="warning"
          />
          <DatePickerField label="Last working day" onChange={(next) => { setScheduledDate(next); endErrors.clearField("scheduledDate"); }} value={scheduledDate} />
          <FieldError message={endErrors.errors.scheduledDate} />
        </>
      ) : (
        <NoticeBar
          message="The end date is recorded as today. This cannot be undone."
          title="This deactivates the record immediately"
          tone="danger"
        />
      )}

      <FormInput error={endErrors.errors.reason} label="Reason for leaving" multiline onChangeText={(next) => { setReason(next); endErrors.clearField("reason"); }} placeholder="e.g. Resigned, relocated, performance" value={reason} />
      <FormInput label="Exit review (optional)" multiline onChangeText={setReview} placeholder="A short note for your records" value={review} />

      {showSettlement ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>Full & final settlement</Text>
          {previewLoading ? (
            <SkeletonCard />
          ) : (
            <>
              {hasAccount ? (
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <AmountMetric label="Unpaid salary" value={formatMoneyPaise(outstandingPaise)} />
                  <AmountMetric label="Extra amount" value={formatMoneyPaise(additionalPaise)} />
                  <AmountMetric label="Settlement" value={formatMoneyPaise(totalSettlementPaise)} />
                </View>
              ) : (
                <Text style={[type.caption, { color: colors.muted }]}>No open salary account — record any final payout below.</Text>
              )}
              <FormInput keyboardType="decimal-pad" label="Additional final amount" onChangeText={setAdditional} placeholder="Optional" prefix="₹" value={additional} />
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
        <Text style={[type.caption, { color: colors.muted }]}>
          {scheduling
            ? "The final settlement is handled on the last working day."
            : "Daily-wage employees have no salary account, so there is nothing to settle."}
        </Text>
      )}

      {endErrors.serverError ? <AlertModal message={endErrors.serverError} onClose={endErrors.dismissServerError} /> : null}
      <ActionButton
        disabled={saving || endErrors.blocked}
        icon={scheduling ? CalendarCheck : Trash2}
        label={saving ? "Saving" : scheduling ? "Schedule end" : "End now"}
        onPress={() => void submit()}
        variant={scheduling ? "primary" : "danger"}
      />
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
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>{label}</Text>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <AnimatedPressable onPress={() => setOpen(true)} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 52, justifyContent: "center", paddingHorizontal: spacing.md }}>
          <Text style={[type.body, { color: value ? colors.ink : colors.muted }]}>{value || "Select date"}</Text>
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
      <Text style={[type.caption, { color: lookup.eligible ? colors.successText : colors.danger, fontWeight: "800" }]}>
        {lookup.exists ? `Existing user${lookup.fullName ? `   ${lookup.fullName}` : ""}` : "New user"}
      </Text>
      <Text style={[type.caption, { color: colors.muted }]}>{lookup.message}</Text>
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>{children}</Text>;
}

// Bottom-sheet modal matching the rest of the app (e.g. owner-rooms ModalShell):
// dimmed overlay, surface anchored to the bottom with rounded top corners, and a
// keyboard-avoiding scrollable body honouring the bottom safe area.
function Sheet({
  children,
  onClose,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  // Who or what the sheet is about. Kept out of the title so the title stays a
  // fixed, readable label — a name concatenated into a 22px single-line heading
  // just truncates, and the name is the part that gets cut.
  subtitle?: string;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          {/* The sheet's own panel. NOT a PinnedFooter — it happens to use the
              same bottom-inset expression, but this is the surface the content
              sits on, so it needs a real background. */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingBottom: insets.bottom + spacing.md,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }} numberOfLines={2}>{title}</Text>
                {subtitle ? (
                  <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
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

// Full rupee amount with two decimals and no K/L abbreviation.
function formatMoneyFull(paise: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency" }).format(paise / 100);
}

/**
 * Which days a daily-wage worker is paid for.
 *
 * <p>A multi-select picker rather than seven chips: the chips wrapped to two
 * ragged rows and the chosen days could only be found by scanning all of them.
 * Collapsed, the answer reads as one line — "Mon, Tue, Wed, Thu, Fri".
 */
function WeekdayPicker({ mask, onChange }: { mask: number; onChange: (mask: number) => void }) {
  return (
    <OptionPicker
      emptyLabel="No days selected"
      label="Working days"
      onChange={(bits) =>
        onChange(bits.reduce((next, bit) => next | Number(bit), 0))
      }
      options={WEEKDAYS.map((weekday) => ({ label: weekday.label, value: String(weekday.bit) }))}
      required
      title="Working days"
      value={WEEKDAYS.filter((weekday) => hasDay(mask, weekday.bit)).map((weekday) => String(weekday.bit))}
    />
  );
}
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
