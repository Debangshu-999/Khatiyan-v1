import { Children, Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, ArrowLeftRight, Banknote, BriefcaseBusiness, Building2, CalendarCheck, ChevronDown, ChevronRight, ChevronUp, CirclePlus, Clock3, Filter, Pencil, Plus, ReceiptText, Search, ShieldCheck, Trash2, UsersRound, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { MoneyIcon } from "@/components/artwork-icon";
import { FieldError } from "@/components/field-error";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { TabSwitcher } from "@/components/tab-switcher";
import { ActionButton, ChoiceButton, ConfirmDialog, FormInput, IconButton, NoticeBar, formatMoneyPaise, humanizeToken, paiseToRupees, rupeesToPaise } from "@/features/owner/owner-ui";
import { OptionPicker, SingleOptionPicker } from "@/components/option-picker";
import { useKeyboardInset } from "@/components/use-keyboard-inset";
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
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_SALARY_ILLUSTRATION = require("../../../assets/workspace/No-Salary_1_512x512.png");

const NO_PERSON_ILLUSTRATION = require("../../../assets/workspace/No-Person_512x512.png");

const NO_BILL_ILLUSTRATION = require("../../../assets/workspace/No-Bill_512x436.png");

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

// The Manage screen's staff tile artwork, not a header-only variant. Reaching
// this screen from that card and being met by a different drawing of the same
// thing read as having arrived somewhere else.
const STAFF_HEADER_ILLUSTRATION = require("../../../assets/workspace/staff-module.png");
const STAFF_HISTORY_ILLUSTRATION = require("../../../assets/workspace/staff-history.png");
const PAYROLL_PAYMENT_HISTORY_ILLUSTRATION = require("../../../assets/workspace/payroll-payment-history.png");
const PAYROLL_PAYABLE_WALLET_ILLUSTRATION = require("../../../assets/workspace/payroll-payable-wallet.png");

function StaffScreenBackground() {
  const { colors } = useTheme();

  return (
    <View style={{ backgroundColor: colors.surface, flex: 1 }}>
      <LinearGradient
        colors={[colors.primarySoft, colors.surface]}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        style={{ height: 260 }}
      />
    </View>
  );
}

function StaffHeader({ propertyName }: { propertyName: string }) {
  return (
    <ScreenHeader
      italicTail="management."
      subtitle={`Staff workspace for ${propertyName}.`}
      artwork={STAFF_HEADER_ILLUSTRATION}
      title="Staff"
    />
  );
}

function StaffGroupCard({
  actionLabel,
  children,
  onAction,
  title,
}: {
  actionLabel?: string;
  children: React.ReactNode;
  onAction?: () => void;
  title: string;
}) {
  const { colors, type } = useTheme();

  return (
    <Card style={{ padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={[type.display, { color: colors.ink, flex: 1, fontSize: 18, lineHeight: 23 }]}>
          {title}
        </Text>
        {actionLabel && onAction ? (
          <AnimatedPressable
            accessibilityLabel={actionLabel}
            accessibilityRole="button"
            onPress={onAction}
            style={{
              alignItems: "center",
              borderColor: colors.primary,
              borderRadius: 11,
              borderWidth: 1,
              flexDirection: "row",
              gap: 4,
              minHeight: 34,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Plus color={colors.primary} size={15} strokeWidth={2.1} />
            <Text numberOfLines={1} style={[type.caption, { color: colors.primary, fontSize: 12, fontWeight: "700" }]}>
              {actionLabel}
            </Text>
          </AnimatedPressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

function SalaryFilterButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primarySoft : colors.surface,
        borderColor: active ? colors.primarySoft : colors.border,
        borderCurve: "continuous",
        borderRadius: 999,
        borderWidth: 1,
        flex: 1,
        justifyContent: "center",
        minHeight: 42,
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
        {label}
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
export function StaffWorkspace() {
  const router = useRouter();
  const { colors } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const properties = useListMyPropertiesQuery().data ?? [];
  const property = resolveSelectedProperty(properties, selectedPropertyId);
  const isOwner = Boolean(property && currentUserId === property.ownerId);
  const [tab, setTab] = useState<WorkspaceTab>("TEAM");

  if (!property) {
    return (
      <ScreenScrollView background={<StaffScreenBackground />} safeAreaEdges={["top", "bottom"]} surface={colors.surface}
      contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }}
    >
        <EmptyState icon={UsersRound} title="Choose a property" description="Select one of your properties from Home to manage its team." />
      </ScreenScrollView>
    );
  }

  // Managers get a read-only view of their own record + a redacted directory.
  if (!isOwner) {
    return <ManagerStaffView property={property} />;
  }

  return (
    <ScreenScrollView background={<StaffScreenBackground />} safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ gap: spacing.lg }} surface={colors.surface}>
      <StaffHeader propertyName={property.name} />

      {/* A little clear of the header. The header's artwork hangs below its
          text, so the container's own gap left the switcher sitting against the
          illustration rather than under the heading. */}
      <View style={{ marginTop: spacing.sm }}>
        <TabSwitcher
          active={tab}
          onChange={setTab}
          options={[
            { icon: UsersRound, label: "Team", value: "TEAM" },
            { icon: Banknote, label: "Payroll", value: "SALARY" },
          ]}
        />
      </View>

      {tab === "TEAM" ? (
        <>
          <TeamDirectory property={property} />
          <TeamHistoryCard property={property} />
        </>
      ) : (
        <>
          <SalaryTracker property={property} />
          <SalaryHistoryCard property={property} />
        </>
      )}
    </ScreenScrollView>
  );
}

// Read-only staff view for an assigned manager: their own employment record and
// salary account, plus a redacted staff directory. No editing anywhere.
function ManagerStaffView({ property }: { property: OwnerProperty }) {
  const { colors, type } = useTheme();
  const employmentQuery = useGetMyManagerEmploymentQuery(property.id);
  const salaryQuery = useGetMySalaryAccountQuery(property.id);
  const directoryQuery = useListStaffDirectoryQuery(property.id);
  const directory = directoryQuery.data ?? [];
  const employment = employmentQuery.data;

  return (
    <ScreenScrollView background={<StaffScreenBackground />} safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ gap: spacing.lg }} surface={colors.surface}>
      <StaffHeader propertyName={property.name} />

      <Section title="My employment">
        {employmentQuery.isLoading ? (
          <SkeletonCard />
        ) : employment ? (
          <Card>
            <View style={{ gap: spacing.sm }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
                <View style={{ alignItems: "center", borderRadius: 14, height: 48, justifyContent: "center", width: 48 }}>
                  <BriefcaseBusiness color={colors.ink} size={30} strokeWidth={2.1} />
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
          <EmptyState description="The owner has not opened a salary account for you yet." artwork={NO_SALARY_ILLUSTRATION} title="No salary account yet" />
        )}
      </Section>

      <Section title={`${directory.length} staff member${directory.length === 1 ? "" : "s"}`}>
        {directoryQuery.isLoading ? (
          <SkeletonList rows={3} />
        ) : directory.length ? (
          <PersonScroller count={directory.length}>
            {directory.map((member) => (
            <View key={member.referenceCode} style={rowCardStyle(colors)}>
              <View style={{ alignItems: "center", borderCurve: "continuous", borderRadius: 13, height: 46, justifyContent: "center", width: 46 }}>
                <UsersRound color={colors.ink} size={28} strokeWidth={2.1} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>{member.categoryName}</Text>
                <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>{member.fullName}</Text>
                {/* Whether they work here, not whether their ID was checked. The
                    redacted manager view carries no dates, so this is the coarser
                    of the two answers — but it is at least an answer about their
                    employment. */}
                <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
                  {member.active ? "Active" : "Ended"}
                </Text>
              </View>
            </View>
            ))}
          </PersonScroller>
        ) : (
          <EmptyState description="No staff members have been added to this property yet." artwork={NO_PERSON_ILLUSTRATION} title="No staff members" />
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
  const managerEmploymentQuery = useListManagerEmploymentQuery(property.id);
  const assignmentsQuery = useListPropertyManagersQuery(property.id);
  const membersQuery = useListStaffMembersQuery({ propertyId: property.id });
  const managerEmployment = managerEmploymentQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  /**
   * Each list's OWN wait.
   *
   * <p>"No managers assigned" and "still asking the server" are not the same
   * thing, and the empty state was standing in for both — so every visit began
   * by telling the owner they had no staff, then contradicted itself.
   */
  const managersLoading = assignmentsQuery.isLoading || managerEmploymentQuery.isLoading;
  const membersLoading = membersQuery.isLoading;
  const allProperties = useListMyPropertiesQuery().data ?? [];
  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const [deactivateCategory] = useDeactivateStaffCategoryMutation();
  const [shiftManager] = useShiftPropertyManagerMutation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
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

      <StaffGroupCard actionLabel="Add manager" onAction={() => router.push("/owner-add-manager")} title="Managers">
        {managersLoading ? (
          <SkeletonList rows={2} />
        ) : managerEntries.length ? (
          <PersonScroller count={managerEntries.length} divided>
            {managerEntries.map((entry) => (
              <ManagerCard entry={entry} key={entry.assignment.id} onOpen={() => setManagerDetail(entry)} />
            ))}
          </PersonScroller>
        ) : (
          <EmptyState description="Assign a real app user as a manager for this property." artwork={NO_PERSON_ILLUSTRATION} title="No managers assigned" />
        )}
      </StaffGroupCard>

      <StaffGroupCard actionLabel="Add member" onAction={() => setMemberEditor("NEW")} title="Tracked staff">
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
        {membersLoading ? (
          <SkeletonList rows={3} />
        ) : filteredMembers.length ? (
          <PersonScroller count={filteredMembers.length} divided>
            {filteredMembers.map((member) => (
              <PersonCard
                divided
                key={member.referenceCode}
                icon={UsersRound}
                meta={`${member.referenceCode} · ${humanizeToken(member.categoryName)}`}
                title={member.fullName}
                salary={salaryRateLabel(member.salaryStructure, member.salaryRatePaise)}
                status={employmentStatus(member)}
                onPress={() => setMemberEditor(member)}
              />
            ))}
          </PersonScroller>
        ) : (
          <EmptyState description="Create a personnel record to track employment and manual salary history." artwork={NO_PERSON_ILLUSTRATION} title={selectedCategory ? `No ${selectedCategory.toLowerCase()} staff` : "No staff members added"} />
        )}
      </StaffGroupCard>

      {createCategoryOpen ? <CreateCategoryModal onClose={() => setCreateCategoryOpen(false)} propertyId={property.id} /> : null}
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
  const managersQuery = useListManagerEmploymentQuery(property.id);
  const membersQuery = useListStaffMembersQuery({ propertyId: property.id });
  const accountsQuery = useListSalaryAccountsQuery(property.id);
  const managers = managersQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
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
  /**
   * Whether the DIRECTORY is still arriving.
   *
   * <p>Distinct from {@link loading}, which is a mutation's — opening someone's
   * salary account. The list's placeholder was gated on that, so it appeared
   * while a card was being created and never once while the list itself
   * loaded, which is the only time anybody is waiting for it.
   */
  const directoryLoading = managersQuery.isLoading || membersQuery.isLoading || accountsQuery.isLoading;

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
      <StaffGroupCard title="Salary accounts">
        {!selected ? (
          <>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <SalaryFilterButton active={filter === "ALL"} label="All" onPress={() => setFilter("ALL")} />
              <SalaryFilterButton active={filter === "MANAGER"} label="Managers" onPress={() => setFilter("MANAGER")} />
              <SalaryFilterButton active={filter === "STAFF"} label="Other staff" onPress={() => setFilter("STAFF")} />
            </View>
            {/* The same rule that separates the rows below, so the filters and
                the list read as one thing. Full bleed, which is why it cancels
                the card's padding rather than sitting inside it.

                The negative marginTop cancels most of the Card's own gap. A
                Fragment is not a flex item, so its two children are spaced by
                the card's 14pt like any other pair — which left the rule
                floating between the filters and the list instead of closing the
                filters off. */}
            <View style={{ backgroundColor: colors.border, height: 1, marginHorizontal: -spacing.md, marginTop: -spacing.sm }} />
          </>
        ) : null}
        {/* Only when there is nothing to stand in for. Rendering it alongside
            the cards put placeholder rows above real content, which reads as two
            extra accounts rather than as loading. A refetch dims the list
            instead — the data is already on screen, it is just going stale. */}
        {(directoryLoading || loading) && shownPeople.length === 0 ? <SkeletonList rows={3} /> : null}
        <DividedRows>
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
                divided
                subtitle={salaryRateLabel(target.person.salaryStructure, target.person.salaryRatePaise)}
                // A chip, like every other status on these rows. Appended to the
                // subtitle it was a fact hiding inside a sentence about pay.
                status={account ? "Account open" : undefined}
                onPress={() => (isSelected ? setSelected(null) : void selectPerson(target))}
              />
            );
          })}
        </DividedRows>
        {!selected && !visiblePeople.length ? (
          <EmptyState
            description="Salary accounts become available after a manager or staff member has been added."
            artwork={NO_PERSON_ILLUSTRATION}
            title={people.length ? "Nobody in this filter" : "Add a manager or staff member first"}
          />
        ) : null}
      </StaffGroupCard>

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
        <Card style={{ padding: spacing.md }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 18 }]}>
                Payable this month
              </Text>
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                style={{
                  color: colors.primaryDeep,
                  fontFamily: fonts.display,
                  fontSize: 28,
                  fontVariant: ["tabular-nums"],
                  letterSpacing: -0.4,
                }}
              >
                {formatMoneyFull(salaryTotal.totalPayableThisMonthPaise)}
              </Text>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                Opened months plus projected pay
              </Text>
            </View>
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={PAYROLL_PAYABLE_WALLET_ILLUSTRATION}
              style={{ height: 84, width: 104 }}
            />
          </View>
        </Card>
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
  const { colors, fonts, type } = useTheme();
  const { account, months } = detail;
  const currentMonth = months.find((month) => month.payrollMonth === firstOfMonth());
  const currentMonthOpened = Boolean(currentMonth);
  // Once the current month is fully paid there is nothing left to adjust or pay,
  // so those actions are blocked until the next month is opened.
  const currentMonthPaid = currentMonth?.paymentStatus === "PAID";
  const [payHistoryOpen, setPayHistoryOpen] = useState(false);
  const [payHistoryShown, setPayHistoryShown] = useState(PAY_MONTHS_PER_PAGE);
  // Client-side: the detail response already carries every month, so this is
  // only about how many land on screen at once.
  const visibleMonths = months.slice(0, payHistoryShown);

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>{account.referenceCode}</Text>
            <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 20 }]}>{account.holderName}</Text>
            <Text style={[type.caption, { color: colors.muted }]}>{account.categoryName}  ·  {salaryRateLabel(account.salaryStructure, account.salaryRatePaise)}</Text>
          </View>
          {onClose ? <IconButton accessibilityLabel="Close salary account" filled icon={X} onPress={onClose} /> : null}
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

      {/* Collapsed by default: the months stack up over a long employment and
          expanded they bury the actions above. The panel that used to hold
          them is gone — it inset every month card by its own padding, so the
          history read as narrower than the account it belongs to. The header
          rule is the whole affordance now, and the cards run the full width. */}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityState={{ expanded: payHistoryOpen }}
          onPress={() => setPayHistoryOpen((current) => !current)}
          style={{
            alignItems: "center",
            borderTopColor: colors.border,
            borderTopWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            paddingTop: spacing.sm,
          }}
        >
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13.5 }}>
            Pay history
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>{months.length}</Text>
          {payHistoryOpen ? (
            <ChevronUp color={colors.inkSoft} size={18} strokeWidth={2.2} />
          ) : (
            <ChevronDown color={colors.inkSoft} size={18} strokeWidth={2.2} />
          )}
        </AnimatedPressable>

        {payHistoryOpen ? visibleMonths.map((month) => {
          const editable = !readOnly && month.paidAmountPaise === 0;
          const lastPayment = month.paymentStatus === "PAID" ? latestPayment(month) : null;
          return (
            <View
              key={month.payrollMonth}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderCurve: "continuous",
                borderRadius: radii.card,
                borderWidth: 1,
                gap: spacing.md,
                padding: spacing.lg,
              }}
            >
              <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
                <View style={{ gap: 2 }}>
                  <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>
                    {formatMonth(month.payrollMonth)}
                  </Text>
                  <Text style={[type.caption, { color: colors.muted }]}>Opened {formatDayMonth(month.openedOn)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={[type.caption, { color: month.paymentStatus === "PAID" ? colors.successText : colors.warningText, fontWeight: "800" }]}>{month.paymentStatus.replaceAll("_", " ")}</Text>
                  {lastPayment ? (
                    <View style={{ alignItems: "flex-end" }}>
                      {/* Weighted, because this is when money left the account —
                          at caption weight in muted it read as filler beside
                          the status it sits under. */}
                      <Text
                        style={{
                          color: colors.inkSoft,
                          fontFamily: fonts.sansSemiBold,
                          fontSize: 11.5,
                          textAlign: "right",
                        }}
                      >
                        {paidDateTimeParts(lastPayment).date}
                      </Text>
                      <Text
                        style={{
                          color: colors.muted,
                          fontFamily: fonts.sansMedium,
                          fontSize: 11.5,
                          textAlign: "right",
                        }}
                      >
                        {paidDateTimeParts(lastPayment).time}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* A receipt, not three tiles. Gross, what was added, what was
                  taken off, then the line they total to — read down, the
                  arithmetic is visible. Side by side the three numbers looked
                  like three unrelated facts and left "why is net not gross?"
                  unanswered. */}
              <PayReceipt month={month} />
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
          <EmptyState description="Open a payroll month to track additions, deductions, and manual payments." artwork={NO_SALARY_ILLUSTRATION} title="No salary month opened" />
        ) : null}

        {payHistoryOpen && months.length > payHistoryShown ? (
          <ListMoreButton
            label={`Show ${Math.min(months.length - payHistoryShown, PAY_MONTHS_PER_PAGE)} more`}
            onPress={() => setPayHistoryShown((current) => current + PAY_MONTHS_PER_PAGE)}
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
    <View style={PERSON_ROW_STYLE}>
      <View style={{ alignItems: "center", borderCurve: "continuous", borderRadius: 13, height: 46, justifyContent: "center", width: 46 }}>
        <Icon color={colors.ink} size={28} strokeWidth={2.1} />
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
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Clock3 color={colors.primary} size={18} strokeWidth={2.1} />
              <Text style={[type.body, { color: colors.muted }]}>Team history</Text>
            </View>
            <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]}>View past employees</Text>
            <Text style={[type.caption, { color: colors.muted, lineHeight: 19 }]}>
              Everyone who has left this property, with their service span, settlement and payslips.
            </Text>
          </View>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={STAFF_HISTORY_ILLUSTRATION}
            style={{ height: 78, width: 98 }}
          />
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={{
            alignItems: "center",
            borderColor: colors.primary,
            borderRadius: 13,
            borderWidth: 1,
            flexDirection: "row",
            justifyContent: "center",
            minHeight: 46,
            paddingHorizontal: spacing.md,
            position: "relative",
          }}
        >
          <Clock3 color={colors.primary} size={17} strokeWidth={2.1} />
          <Text style={[type.bodyStrong, { color: colors.primary, marginLeft: spacing.xs }]}>
            {total} record{total === 1 ? "" : "s"}
          </Text>
          <ChevronRight color={colors.primary} size={20} strokeWidth={2.2} style={{ position: "absolute", right: spacing.md }} />
        </AnimatedPressable>
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
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Clock3 color={colors.primary} size={18} strokeWidth={2.1} />
              <Text style={[type.body, { color: colors.muted }]}>Payment history</Text>
            </View>
            <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]}>
              View payments
            </Text>
            <Text style={[type.caption, { color: colors.muted, lineHeight: 19 }]}>
              Every salary payment recorded at this property, newest first.
            </Text>
          </View>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={PAYROLL_PAYMENT_HISTORY_ILLUSTRATION}
            style={{ height: 78, width: 98 }}
          />
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={{
            alignItems: "center",
            borderColor: colors.primary,
            borderRadius: 13,
            borderWidth: 1,
            flexDirection: "row",
            justifyContent: "center",
            minHeight: 46,
            paddingHorizontal: spacing.md,
            position: "relative",
          }}
        >
          <Clock3 color={colors.primary} size={17} strokeWidth={2.1} />
          <Text style={[type.bodyStrong, { color: colors.primary, marginLeft: spacing.xs }]}>
            {total} payment{total === 1 ? "" : "s"}
          </Text>
          <ChevronRight
            color={colors.primary}
            size={20}
            strokeWidth={2.2}
            style={{ position: "absolute", right: spacing.md }}
          />
        </AnimatedPressable>
      </Card>

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Payment history">
          <PayslipList
            emptyDescription="Salary payments recorded at this property will appear here."
            payslips={query.data ?? []}
            showHolder
          />
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
// One month per page. Six at a time made the section a long scroll inside a
// card, and the arrows already exist — stepping through them one at a time is
// what the pager is for, and it keeps each month's receipt readable in full.
const PAY_MONTHS_PER_PAGE = 1;

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
  const { colors, fonts, type } = useTheme();
  // The endpoint returns the property's whole history in one response, so the
  // paging is client-side. A busy property accumulates a payment per employee
  // per month, which is a very long sheet by the second year.
  /**
   * How many payslips are on screen, grown rather than paged.
   *
   * <p>
   * A pager suits a table somebody navigates; a payment history is read
   * downwards, and arrows made the reader carry which page they were on. The
   * list extends instead and the count sits at its foot.
   */
  const [shown, setShown] = useState(PAYSLIPS_PER_PAGE);

  if (loading) {
    return <SkeletonList rows={3} />;
  }

  if (payslips.length === 0) {
    return <EmptyState artwork={NO_BILL_ILLUSTRATION} description={emptyDescription} title="No payslips available" />;
  }

  const visible = payslips.slice(0, shown);
  const remaining = payslips.length - visible.length;

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

      {/* The list's foot either way: more to come, or the total. Without it
          the last payslip just stops, and there is no telling a finished list
          from one that has more behind it. */}
      {remaining > 0 ? (
        <AnimatedPressable
          accessibilityLabel={`Show ${Math.min(remaining, PAYSLIPS_PER_PAGE)} more payslips`}
          accessibilityRole="button"
          onPress={() => setShown((current) => current + PAYSLIPS_PER_PAGE)}
          style={{
            alignItems: "center",
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            justifyContent: "center",
            minHeight: 44,
          }}
        >
          <Text style={[type.caption, { color: colors.primary, fontFamily: fonts.sansBold }]}>
            Show {Math.min(remaining, PAYSLIPS_PER_PAGE)} more
          </Text>
        </AnimatedPressable>
      ) : (
        <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
          {payslips.length === 1 ? "1 payslip" : `${payslips.length} payslips`}
        </Text>
      )}
    </View>
  );
}

/**
 * The foot of a growing list.
 *
 * <p>Shared by the payroll months, the payslips and the employee history, so a
 * list that extends looks the same wherever it does — the three used to end in
 * three different controls.
 */
function ListMoreButton({ busy = false, label, onPress }: { busy?: boolean; label: string; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 44,
      }}
    >
      {busy ? (
        <ActivityIndicator color={colors.muted} />
      ) : (
        <Text style={[type.caption, { color: colors.primary, fontFamily: fonts.sansBold }]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

/** Roughly one person card, used to cap a section at five of them. */
const PERSON_CARD_HEIGHT = 96;

/** The same, for a divided list: no border, no gap, so a row is shorter. */
const PERSON_ROW_HEIGHT = 84;

/** How many fit before the section starts scrolling instead of growing. */
const PERSON_CARDS_BEFORE_SCROLL = 5;

/**
 * A section of people that stops growing at five cards and scrolls instead.
 *
 * <p>
 * Managers and tracked staff both sit in one card on a screen that already
 * scrolls, so a property with twenty staff pushed everything below it — the
 * payroll, the history — out of reach behind a wall of near-identical rows.
 * Capped, the screen keeps its shape however many people there are.
 *
 * <p>
 * Below the cap it renders as a plain stack: a ScrollView that never scrolls
 * still swallows the parent's drag on Android, so short lists must not have
 * one at all.
 */
/**
 * People separated by a rule instead of boxed one by one.
 *
 * <p>Between, never after: a trailing rule sits on the card's own padding and
 * reads as the list having one more row that failed to load.
 */
function DividedRows({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  return (
    <>
      {Children.toArray(children).map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <View style={{ backgroundColor: colors.border, height: 1, marginHorizontal: -spacing.md }} />
          ) : null}
          {child}
        </Fragment>
      ))}
    </>
  );
}

function PersonScroller({
  children,
  count,
  divided = false,
}: {
  children: ReactNode;
  count: number;
  /** Separate the people with a rule instead of a gap between cards. */
  divided?: boolean;
}) {
  const rowHeight = divided ? PERSON_ROW_HEIGHT : PERSON_CARD_HEIGHT;
  const content = divided ? <DividedRows>{children}</DividedRows> : children;

  if (count <= PERSON_CARDS_BEFORE_SCROLL) {
    return <View style={{ gap: divided ? 0 : spacing.sm }}>{content}</View>;
  }

  return (
    <ScrollView
      contentContainerStyle={{ gap: divided ? 0 : spacing.sm }}
      nestedScrollEnabled
      showsVerticalScrollIndicator
      style={{ maxHeight: rowHeight * PERSON_CARDS_BEFORE_SCROLL }}
    >
      {content}
    </ScrollView>
  );
}

function monthLabel(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function EmployeeHistory({ property }: { property: OwnerProperty }) {
  const { colors, type } = useTheme();
  const [page, setPage] = useState(0);
  // 10 a page, matching the payslip list — 20 made a single wall of cards.
  const query = useListEmployeeHistoryQuery({ page, propertyId: property.id, size: HISTORY_PER_PAGE });
  const pageData = query.data;

  /**
   * Every page seen so far, appended.
   *
   * <p>The query returns one page keyed on its number, so reading `data` alone
   * shows page three and nothing before it. Page 0 REPLACES rather than
   * appends — that is what a refetch produces, and appending there would list
   * the same people twice.
   */
  const [loadedItems, setLoadedItems] = useState<EmployeeHistoryItem[]>([]);

  useEffect(() => {
    if (!pageData) {
      return;
    }
    setLoadedItems((current) => {
      if (pageData.page === 0) {
        return pageData.items;
      }
      const seen = new Set(current.map((item) => `${item.holderType}-${item.referenceCode}`));
      return [...current, ...pageData.items.filter((item) => !seen.has(`${item.holderType}-${item.referenceCode}`))];
    });
  }, [pageData]);

  const items = loadedItems;
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
          <SkeletonList rows={3} />
        ) : items.length ? (
          <View style={{ gap: spacing.sm }}>
            {items.map((item) => (
              <HistoryCard item={item} key={`${item.holderType}-${item.referenceCode}`} propertyId={property.id} />
            ))}
          </View>
        ) : (
          <EmptyState description="Employees you end will appear here with their service span, settlement, and exit review." artwork={NO_PERSON_ILLUSTRATION} title="No past employees yet" />
        )}
        {/* The list extends rather than pages. A record of past employees is
            read downwards, and arrows made the reader carry which page they
            were on. */}
        {items.length > 0 ? (
          pageData?.hasNext ? (
            <ListMoreButton
              busy={query.isFetching}
              label={`Show ${HISTORY_PER_PAGE} more`}
              onPress={() => setPage((current) => current + 1)}
            />
          ) : (
            <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
              {items.length === 1 ? "1 record" : `${items.length} records`}
            </Text>
          )
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
              artwork={NO_BILL_ILLUSTRATION}
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
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, gap: 3, padding: spacing.md }}>
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
          minHeight: 60,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Filter color={colors.kicker} size={19} strokeWidth={2.2} />
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



/**
 * A manager in the directory.
 *
 * <p>The WHOLE row opens them. It used to carry a pencil beside the chevron,
 * which split the row into two targets for one person and duplicated an action
 * the detail sheet already offers — so a tap near the right edge did something
 * different from a tap in the middle.
 */
function ManagerCard({ entry, onOpen }: { entry: ManagerDirectoryEntry; onOpen: () => void }) {
  const { colors, type } = useTheme();
  const { assignment, employment } = entry;
  return (
    <AnimatedPressable
      accessibilityLabel={`Open ${assignment.managerFullName}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={PERSON_ROW_STYLE}
    >
      <BriefcaseBusiness color={colors.primary} size={30} strokeWidth={2} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>{employment?.referenceCode ?? "Manager"}</Text>
        <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 16 }]} numberOfLines={1}>{assignment.managerFullName}</Text>
        {/* The same line staff carry: what they are paid, then where they are
            in their employment. A manager whose start date has not arrived is
            assigned but not yet working, and nothing on the row said so. */}
        {employment ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Text style={[type.caption, { color: colors.muted, flexShrink: 1 }]} numberOfLines={1}>
              {salaryRateLabel(employment.salaryStructure, employment.salaryRatePaise)}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>·</Text>
            <PersonStatusChip label={employmentStatus(employment)} />
          </View>
        ) : (
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {assignment.managerPhone}
          </Text>
        )}
      </View>
      <View style={staffRoundButtonStyle(colors)}>
        <ChevronRight color={colors.ink} size={18} strokeWidth={2.2} />
      </View>
    </AnimatedPressable>
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
        <View style={{ alignItems: "center", borderRadius: 30, height: 60, justifyContent: "center", width: 60 }}>
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
/**
 * A person as a ROW in a list, not a card in a stack.
 *
 * <p>
 * Full card width: the negative margin cancels `StaffGroupCard`'s padding so the
 * row and the rule under it run edge to edge, while the matching padding keeps
 * the content lined up with the heading above. No border, no fill and no corner
 * of its own — the card it sits in is already the surface, and a box inside a
 * box drew two frames around one person.
 */
/**
 * Where someone is in their employment, as a chip on their row.
 *
 * <p>One treatment for every state on purpose. The word carries the meaning and
 * the chip only says "this is a status" — colouring "Not started" differently
 * from "Active" would rank them, and neither is a problem to be flagged.
 */
function PersonStatusChip({ label }: { label: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.accentSoft, borderRadius: 999, flexShrink: 0, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
      <Text style={[type.caption, { color: colors.warningText, fontSize: 10, fontWeight: "700" }]}>{label}</Text>
    </View>
  );
}

const PERSON_ROW_STYLE = {
  alignItems: "center" as const,
  flexDirection: "row" as const,
  gap: spacing.sm,
  marginHorizontal: -spacing.md,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.md,
};

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

/**
 * The chevron at the end of a person's row.
 *
 * <p>No ring. Once the rows lost their boxes the outlined circle was the only
 * frame left on the line, so it read as a button sitting on a list rather than
 * as the row's own affordance. The size stays: it is the touch target.
 */
function staffRoundButtonStyle(_colors: { surface: string; borderStrong: string }) {
  return {
    alignItems: "center" as const,
    height: 38,
    justifyContent: "center" as const,
    width: 38,
  };
}

function PersonCard({
  divided = false,
  icon: Icon,
  meta,
  onPress,
  salary,
  status,
  subtitle,
  title,
}: {
  /**
   * Render as a row in a divided list rather than as its own card.
   *
   * <p>Opt in, because this component is also the salary-accounts list, which
   * is still a stack of cards. One list changing shape must not drag the other
   * with it.
   */
  divided?: boolean;
  icon: typeof UsersRound;
  meta: string;
  onPress: () => void;
  salary?: string;
  status?: string;
  subtitle?: string;
  title: string;
}) {
  const { colors, type } = useTheme();
  const detail = salary ?? subtitle ?? "";

  return (
    <AnimatedPressable
      onPress={onPress}
      style={divided ? PERSON_ROW_STYLE : [rowCardStyle(colors), { minHeight: 96 }]}
    >
      <Icon color={colors.primary} size={32} strokeWidth={2} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>{meta}</Text>
        <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 16 }]} numberOfLines={1}>{title}</Text>
        {status ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Text style={[type.caption, { color: colors.muted, flexShrink: 1 }]} numberOfLines={1}>{detail}</Text>
            <Text style={[type.caption, { color: colors.muted }]}>·</Text>
            <PersonStatusChip label={status} />
          </View>
        ) : (
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{detail}</Text>
        )}
      </View>
      <View style={staffRoundButtonStyle(colors)}>
        <ChevronRight color={colors.ink} size={18} strokeWidth={2.2} />
      </View>
    </AnimatedPressable>
  );
}
/**
 * One month's pay, as a receipt.
 *
 * <p>Additions and deductions are summed from the month's own adjustments
 * rather than inferred from gross-minus-net: the difference between those two
 * is a single number that cannot say whether it was one deduction or four, and
 * this list is the thing an employee queries.
 */
function PayReceipt({ month }: { month: SalaryMonth }) {
  const { colors, fonts, type } = useTheme();

  const additions = month.adjustments
    .filter((adjustment) => adjustment.adjustmentType === "ADDITION")
    .reduce((total, adjustment) => total + adjustment.amountPaise, 0);
  const deductions = month.adjustments
    .filter((adjustment) => adjustment.adjustmentType !== "ADDITION")
    .reduce((total, adjustment) => total + adjustment.amountPaise, 0);

  return (
    <View style={{ gap: 6 }}>
      <ReceiptLine label="Gross" value={formatMoneyPaise(month.grossAmountPaise)} />
      <ReceiptLine
        label="Additions"
        tone={additions > 0 ? "credit" : undefined}
        value={`${additions > 0 ? "+ " : ""}${formatMoneyPaise(additions)}`}
      />
      <ReceiptLine
        label="Deductions"
        tone={deductions > 0 ? "debit" : undefined}
        value={`${deductions > 0 ? "− " : ""}${formatMoneyPaise(deductions)}`}
      />

      <View style={{ backgroundColor: colors.border, height: 1, marginVertical: 2 }} />

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>Net</Text>
        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 17,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatMoneyPaise(month.netAmountPaise)}
        </Text>
      </View>

    </View>
  );
}

function ReceiptLine({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "credit" | "debit";
  value: string;
}) {
  const { colors, type } = useTheme();
  const amountColor = tone === "credit" ? colors.successText : tone === "debit" ? colors.danger : colors.inkSoft;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text style={[type.caption, { color: amountColor, fontVariant: ["tabular-nums"] }]}>{value}</Text>
    </View>
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
 * cover the screen it just pushed. It STAYS hidden until the grants come back:
 * if the owner saved something, there is nothing left to ask and it closes
 * itself, and only a return with nothing granted brings the question back.
 */
export function ManagerAccessModal({
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
      // Stays hidden until the answer arrives. Clearing `configuring` first
      // painted this modal for however long the refetch took, so an owner who
      // had just finished setting permissions watched the question they had
      // already answered come back before it closed itself.
      void permissionsQuery.refetch().then((result) => {
        const levels = result.data?.levels ?? {};
        if (Object.values(levels).some((level) => level && level !== "NONE")) {
          onClose();
          return;
        }
        // Nothing was granted, so they backed out without saving and the two
        // paths are still the question worth asking.
        setConfiguring(false);
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

function StaffMemberModal({ categories, member, onClose, onEnd, propertyId }: { categories: StaffCategory[]; member: StaffMember | null; onClose: () => void; onEnd?: () => void; propertyId: string }) {
  const toast = useToast();
  const { colors, fonts, type } = useTheme();
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
  /**
   * Whether this member has actually started working.
   *
   * <p>Gates the two fields that decide how their pay is CALCULATED — the start
   * date and the monthly/daily structure. A new record, or one starting next
   * week, has accrued nothing yet and is still free to correct.
   */
  const hasStarted = Boolean(member && member.employmentStartDate <= istToday());
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
      {/* One row: the structure and the rate are one decision read together —
          "daily at ₹150" — and stacked they read as two unrelated questions with
          the answer to the first changing the label of the second.

          A picker rather than the two chips, so the halves are the same kind of
          object at the same height. Two chips squeezed into half a row would sit
          shorter than the field beside them.

          The structure is LOCKED once they have started, like the start date and
          for the same reason: it is not a term, it is the METHOD their pay is
          worked out by, and flipping a started member from monthly to daily
          recomputes every period they have already been paid for on a different
          basis. The rate stays editable either way — a raise is an ordinary
          thing to record and rewrites nothing. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          {hasStarted ? (
            <View style={{ gap: 6 }}>
              <Text style={[type.label, { color: colors.muted }]}>Pay structure</Text>
              <View
                style={{
                  backgroundColor: colors.surfaceSunken,
                  borderColor: colors.border,
                  borderCurve: "continuous",
                  borderRadius: 14,
                  borderWidth: 1.5,
                  justifyContent: "center",
                  minHeight: 50,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 15 }}>
                  {salaryStructure === "DAILY" ? "Daily" : "Monthly"}
                </Text>
              </View>
            </View>
          ) : (
            <SingleOptionPicker
              centered
              label="Pay structure"
              onChange={(next) => setSalaryStructure(next)}
              options={[
                { label: "Monthly", value: "MONTHLY" as const },
                { label: "Daily", value: "DAILY" as const },
              ]}
              showIcon={false}
              value={salaryStructure}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <FormInput error={fieldErrors.errors.salary} keyboardType="decimal-pad" label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"} onChangeText={(next) => { setSalary(next); fieldErrors.clearField("salary"); }} placeholder="0" prefix="₹" value={salary} />
        </View>
      </View>
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
      {/* Locked once they have actually started, not from the moment the record
          exists. Salary accrues FROM this date — SalaryAccountService computes
          each month's earned amount against it — so moving it afterwards
          rewrites what was owed for periods that may already have been paid.
          Before the date arrives nothing has accrued, and a hire date typed a
          day early is an ordinary correction. Shown rather than hidden once
          locked, because it is a term of their employment and the owner still
          needs to read it. */}
      {hasStarted ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>Working start date</Text>
          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              justifyContent: "center",
              minHeight: 52,
              paddingHorizontal: spacing.md,
            }}
          >
            <Text style={[type.body, { color: colors.inkSoft }]}>{startDate}</Text>
          </View>
          <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>
            Fixed now they have started, because salary is worked out from it.
          </Text>
        </View>
      ) : (
        <DatePickerField label="Working start date" onChange={setStartDate} value={startDate} />
      )}
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
  const { colors, fonts, type } = useTheme();
  // The same rule the staff editor uses: what decides how pay is CALCULATED is
  // fixed once it has started calculating. A manager with no start date on
  // record has certainly not started.
  const hasStarted = Boolean(manager.employmentStartDate && manager.employmentStartDate <= istToday());

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
    <Sheet onClose={onClose} title="Edit manager employment">
      {/* The name in the form rather than as the sheet's subtitle. A person's
          record should open with who it is about, in the same column as
          everything else about them.

          Read-only, because it is not stored here: a manager's name lives on
          their USER ACCOUNT, which they may also use as a tenant or an owner
          elsewhere. Editing it from one property's staff screen would rename
          them everywhere, including in agreements and chats they are part of. */}
      <View style={{ gap: 6 }}>
        <Text style={[type.label, { color: colors.muted }]}>Full name</Text>
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 14,
            borderWidth: 1.5,
            justifyContent: "center",
            minHeight: 50,
            paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 15 }}>
            {manager.fullName}
          </Text>
        </View>
        <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>
          Set on their own account, so only they can change it.
        </Text>
      </View>

      <DatePickerField clearable label="Date of birth" onChange={setBirthDate} value={birthDate} />

      {/* Structure and rate on one row — one decision read together, "daily at
          ₹150". The structure locks once they have started, for the same reason
          the start date does. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          {hasStarted ? (
            <View style={{ gap: 6 }}>
              <Text style={[type.label, { color: colors.muted }]}>Pay structure</Text>
              <View
                style={{
                  backgroundColor: colors.surfaceSunken,
                  borderColor: colors.border,
                  borderCurve: "continuous",
                  borderRadius: 14,
                  borderWidth: 1.5,
                  justifyContent: "center",
                  minHeight: 50,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 15 }}>
                  {salaryStructure === "DAILY" ? "Daily" : "Monthly"}
                </Text>
              </View>
            </View>
          ) : (
            <SingleOptionPicker
              centered
              label="Pay structure"
              onChange={(next) => setSalaryStructure(next)}
              options={[
                { label: "Monthly", value: "MONTHLY" as const },
                { label: "Daily", value: "DAILY" as const },
              ]}
              showIcon={false}
              value={salaryStructure}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <FormInput error={empErrors.errors.salary} keyboardType="decimal-pad" label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"} onChangeText={(next) => { setSalary(next); empErrors.clearField("salary"); }} placeholder="0" prefix="₹" value={salary} />
        </View>
      </View>

      <FormInput label="Benefits provided" multiline onChangeText={setBenefits} placeholder="Optional benefits" value={benefits} />

      {hasStarted ? (
        <View style={{ gap: 6 }}>
          <Text style={[type.label, { color: colors.muted }]}>Working start date</Text>
          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: 14,
              borderWidth: 1.5,
              justifyContent: "center",
              minHeight: 50,
              paddingHorizontal: spacing.md,
            }}
          >
            <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 15 }}>{startDate}</Text>
          </View>
          <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>
            Fixed now they have started, because salary is worked out from it.
          </Text>
        </View>
      ) : (
        <>
          <DatePickerField label="Working start date" onChange={(next) => { setStartDate(next); empErrors.clearField("startDate"); }} value={startDate} />
          <FieldError message={empErrors.errors.startDate} />
        </>
      )}
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
/**
 * The two halves of when a payment was recorded, kept apart.
 *
 * <p>Joined with a separator they wrapped mid-date in the corner of a card,
 * which is where the space is tightest. Two lines put the break where it
 * belongs, and the date — the half anyone is actually looking for — stays whole.
 */
function paidDateTimeParts(payment: SalaryPayment) {
  return {
    date: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" })
      .format(new Date(`${payment.paidOn}T00:00:00`)),
    time: new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: true, minute: "2-digit" })
      .format(new Date(payment.recordedAt)),
  };
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

export function DatePickerField({ clearable = false, label, onChange, value }: { clearable?: boolean; label: string; onChange: (value: string) => void; value: string }) {
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
        {clearable && value ? <IconButton accessibilityLabel={`Clear ${label}`} filled icon={X} onPress={() => onChange("")} /> : null}
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
  const keyboardInset = useKeyboardInset();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
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
              marginBottom: keyboardInset,
              maxHeight: "92%",
              paddingBottom: (keyboardInset > 0 ? 0 : insets.bottom) + spacing.md,
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
/**
 * Whether a staff member is working here, from their dates.
 *
 * <p>
 * <b>Not {@code identityVerificationStatus}.</b> The card used to show that,
 * unlabelled, in the slot a reader takes for employment state — so every member
 * read "Not started" for ever, including ones who started months ago. Nothing in
 * the app moves that field either: document verification is shelved with the
 * payments work, and there is no control anywhere that changes it, so it could
 * only ever say one thing.
 *
 * <p>
 * ISO dates compare as strings, and "today" is Indian: the backend's day
 * boundaries are IST, and a device in another zone must not decide someone
 * starts tomorrow when the server says they started today.
 */
function employmentStatus(member: Pick<StaffMember, "active" | "employmentEndDate" | "employmentStartDate">) {
  const todayIst = istToday();
  if (member.employmentStartDate > todayIst) {
    return "Not started";
  }
  if (!member.active || (member.employmentEndDate && member.employmentEndDate < todayIst)) {
    return "Ended";
  }
  return "Active";
}

function istToday() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date());
}

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

/**
 * One category in the picker, with its delete.
 *
 * <p>Renders through the app's shared picker row, so a category list looks like
 * every other list of options. It used to fill the selected row solid ink, which
 * was this screen answering "which one is chosen" in its own private language.
 *
 * <p>The delete is passed as the row's `action`, which places it outside the
 * row's pressable — tapping it cannot also select the category it removes.
 */
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
