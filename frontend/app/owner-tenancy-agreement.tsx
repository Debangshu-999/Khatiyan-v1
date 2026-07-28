import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Check, Eye, FileSignature, Info, Plus, SlidersHorizontal, Trash2, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import {
  deductionCategories,
  lockInMonths,
  lockInPenaltyFixedPaise,
  lockInPenaltyType,
  rupeesLabel,
  withDeductionCategories,
  withLockIn,
  type LockInPenaltyType,
} from "@/features/compliance/clause-values";
import { AgreementClauseList } from "@/features/compliance/agreement-clause-list";
import { ActionButton, BackButton, ChoiceButton, FormInput, IconButton } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { useGetPropertyExitPoliciesQuery, type OwnerProperty, type PropertyExitPolicy } from "@/store/services/property-api";
import {
  PROPERTY_DERIVED_CLAUSE_TYPES,
  useGetPropertyAgreementSettingsQuery,
  useUpdatePropertyAgreementSettingsMutation,
  type AgreementClause,
  type AgreementMode,
} from "@/store/services/compliance-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const MODE_OPTIONS: { value: AgreementMode; title: string; subtitle: string }[] = [
  {
    value: "OFF",
    title: "Off",
    subtitle: "Monthly tenancies start immediately with no agreement.",
  },
  {
    value: "SELECTIVE",
    title: "Per tenancy",
    subtitle: "You choose during onboarding whether a tenancy needs an agreement.",
  },
  {
    value: "ALL_MONTHLY",
    title: "All monthly tenancies",
    subtitle: "Every monthly tenancy requires the tenant to accept the agreement before it starts.",
  },
];

const DEDUCTION_OPTIONS: { value: string; label: string }[] = [
  { label: "Damage", value: "DAMAGE" },
  { label: "Unpaid dues", value: "UNPAID_DUES" },
  { label: "Cleaning", value: "CLEANING" },
];

export default function OwnerTenancyAgreementScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [addClauseOpen, setAddClauseOpen] = useState(false);
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const settingsQuery = useGetPropertyAgreementSettingsQuery(propertyId, { skip: !propertyId });
  // Damage schedule + move-out checklist are property exit policies now; the
  // preview reads them so it matches the assembled agreement the tenant sees.
  const exitPoliciesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const [saveSettings, saveState] = useUpdatePropertyAgreementSettingsMutation();

  // Editable draft, initialized from the server copy once it arrives.
  const [mode, setMode] = useState<AgreementMode | null>(null);
  const [clauses, setClauses] = useState<AgreementClause[] | null>(null);

  useEffect(() => {
    if (settingsQuery.data && mode === null && clauses === null) {
      setMode(settingsQuery.data.mode);
      // Strip clause types no longer stored here: CLEANING_FEE (dropped from
      // authoring) and the property-derived rules (damage charges, move-out
      // checklist) that moved to the property's exit policies. Old rows seeded
      // before those moves still carry them; the next save cleans the stored set.
      setClauses(
        settingsQuery.data.defaultClauses.filter(
          (clause) =>
            clause.systemType !== "CLEANING_FEE" &&
            (clause.systemType == null || !PROPERTY_DERIVED_CLAUSE_TYPES.includes(clause.systemType)),
        ),
      );
    }
  }, [clauses, mode, settingsQuery.data]);

  const systemClauses = useMemo(() => (clauses ?? []).filter((clause) => clause.kind === "SYSTEM"), [clauses]);
  const customClauses = useMemo(() => (clauses ?? []).filter((clause) => clause.kind === "CUSTOM"), [clauses]);

  function updateSystemClause(systemType: string, updater: (clause: AgreementClause) => AgreementClause) {
    setClauses((current) =>
      (current ?? []).map((clause) =>
        clause.kind === "SYSTEM" && clause.systemType === systemType ? updater(clause) : clause,
      ),
    );
  }

  function updateCustomClause(index: number, patch: Partial<AgreementClause>) {
    setClauses((current) => {
      const next = [...(current ?? [])];
      let seen = -1;
      for (let position = 0; position < next.length; position += 1) {
        if (next[position].kind === "CUSTOM") {
          seen += 1;
          if (seen === index) {
            next[position] = { ...next[position], ...patch };
            break;
          }
        }
      }
      return next;
    });
  }

  function removeCustomClause(index: number) {
    setClauses((current) => {
      const next: AgreementClause[] = [];
      let seen = -1;
      for (const clause of current ?? []) {
        if (clause.kind === "CUSTOM") {
          seen += 1;
          if (seen === index) {
            continue;
          }
        }
        next.push(clause);
      }
      return next;
    });
  }

  // Called from the add-clause modal, so a clause always arrives with data —
  // no empty placeholder cards.
  function addCustomClause(heading: string, body: string) {
    setClauses((current) => [
      ...(current ?? []),
      { body, displayOrder: current?.length ?? 0, heading, kind: "CUSTOM", systemType: null, value: null },
    ]);
  }

  // Persists only the mode choice, leaving the stored clause set untouched —
  // in-progress clause edits stay local until the main save button.
  async function saveMode() {
    if (!propertyId || mode === null || !settingsQuery.data) {
      return;
    }
    try {
      await saveSettings({ defaultClauses: settingsQuery.data.defaultClauses, mode, propertyId }).unwrap();
      toast.success("Agreement mode saved.");
    } catch {
      toast.error("Could not save the agreement mode.");
    }
  }

  async function save() {
    if (!propertyId || mode === null || clauses === null) {
      return;
    }
    // Clauses are created through the add-clause modal (never empty), but an
    // existing card can still be edited down to blank — block the save and say
    // which one, instead of silently dropping it.
    const invalidIndex = customClauses.findIndex((clause) => !clause.heading.trim() || !clause.body.trim());
    if (invalidIndex >= 0) {
      toast.error(`Clause ${invalidIndex + 1} needs both a heading and a body.`);
      return;
    }
    const trimmedCustoms = customClauses.map((clause) => ({
      ...clause,
      body: clause.body.trim(),
      heading: clause.heading.trim(),
    }));
    const ordered = [...systemClauses, ...trimmedCustoms].map((clause, index) => ({ ...clause, displayOrder: index }));
    try {
      await saveSettings({ defaultClauses: ordered, mode, propertyId }).unwrap();
      toast.success("Agreement settings saved.");
    } catch {
      toast.error("Could not save the agreement settings.");
    }
  }

  const ready = Boolean(property) && !settingsQuery.isLoading && mode !== null && clauses !== null;

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      {/* Extra bottom clearance: the fixed two-row footer is taller than the
          default stack-screen padding assumes, and clipped the last card. */}
      <ScreenScrollView safeAreaEdges={["top"]} contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.lg, paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />
      <ScreenHeader
        title="Tenancy"
        italicTail="agreement."
        subtitle={
          property
            ? `The default terms every new monthly tenancy at ${property.name} starts from.`
            : "Select a property from Home to manage its agreement."
        }
      />

      {!property ? (
        <EmptyState
          icon={FileSignature}
          eyebrow="Property required"
          title="No property selected"
          description="Choose an active property from Home before managing its tenancy agreement."
        />
      ) : settingsQuery.isLoading || mode === null || clauses === null ? (
        <>
          <SkeletonCard />
          <SkeletonList />
        </>
      ) : (
        <>
          <Section eyebrow="Applies to" title="Agreement mode">
            <Card>
              {MODE_OPTIONS.map((option) => (
                <ModeRow
                  key={option.value}
                  selected={mode === option.value}
                  subtitle={option.subtitle}
                  title={option.title}
                  onPress={() => setMode(option.value)}
                />
              ))}
              <ActionButton
                disabled={saveState.isLoading || mode === settingsQuery.data?.mode}
                label={mode === settingsQuery.data?.mode ? "Mode saved" : "Save mode"}
                onPress={() => void saveMode()}
                variant="secondary"
              />
            </Card>
          </Section>

          <Section eyebrow="Locked" title="Rent & property policy">
            <Card>
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                <Info color={colors.muted} size={15} strokeWidth={2.2} style={{ marginTop: 2 }} />
                <Text style={[type.body, { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 19 }]} selectable>
                  Rent comes from the room chosen at onboarding, the deposit from this property's standard deposit
                  {property ? ` (${rupeesLabel(property.standardDepositPaise ?? 0)})` : ""}, and the notice period,
                  grace days and late fee from your property policy. The damage schedule and move-out checklist come
                  from the property's exit policies. Edit those in the property settings — they are locked inside every
                  agreement for uniformity.
                </Text>
              </View>
            </Card>
          </Section>

          <Section eyebrow="From exit policies" title="Damage & move-out">
            <ExitPolicyCard
              heading="Damage charges"
              body={
                (exitPoliciesQuery.data?.damageCharges.length ?? 0) > 0
                  ? `${exitPoliciesQuery.data?.damageCharges.length} item${(exitPoliciesQuery.data?.damageCharges.length ?? 0) === 1 ? "" : "s"} in the property's damage schedule: ${exitPoliciesQuery.data?.damageCharges.map((item) => `${item.name} (${rupeesLabel(item.chargePaise)})`).join(", ")}.`
                  : "No damage schedule configured — any damage charge must be evidenced at move-out."
              }
              onConfigure={() => router.push("/owner-exit-policies")}
            />
            <ExitPolicyCard
              heading="Move-out checklist"
              body={
                (exitPoliciesQuery.data?.exitChecklist.length ?? 0) > 0
                  ? `Verified before the deposit is settled: ${exitPoliciesQuery.data?.exitChecklist.join(", ")}.`
                  : "No move-out checklist configured."
              }
              onConfigure={() => router.push("/owner-exit-policies")}
            />
          </Section>

          <Section eyebrow="Uniform per property" title="Agreement rules">
            {systemClauses.map((clause) => (
              <SystemRuleEditor
                key={clause.systemType ?? clause.heading}
                clause={clause}
                onChange={(updater) => updateSystemClause(clause.systemType ?? "", updater)}
              />
            ))}
          </Section>

          <Section eyebrow="Your own terms" title="House rules & other clauses">
            {customClauses.map((clause, index) => (
              <Card key={`custom-${index}`}>
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                    Clause {index + 1}
                  </Text>
                  <AnimatedPressable
                    accessibilityLabel={`Remove clause ${index + 1}`}
                    onPress={() => removeCustomClause(index)}
                    style={{ padding: 4 }}
                  >
                    <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
                  </AnimatedPressable>
                </View>
                <FormInput
                  label="Clause Heading"
                  onChangeText={(text) => updateCustomClause(index, { heading: text })}
                  placeholder="e.g. Liability, Guests, Parking"
                  value={clause.heading}
                />
                <FormInput
                  label="Clause Body"
                  multiline
                  onChangeText={(text) => updateCustomClause(index, { body: text })}
                  placeholder="Write the rule exactly as the tenant should read it"
                  value={clause.body}
                />
              </Card>
            ))}
          </Section>
        </>
      )}
      </ScreenScrollView>

      {/* Fixed footer, matching register-property: the three actions stay
          reachable no matter how long the clause list scrolls. */}
      {ready ? (
        <View
          style={{
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            gap: spacing.sm,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton icon={Plus} label="Add clause" onPress={() => setAddClauseOpen(true)} variant="secondary" />
            <ActionButton icon={Eye} label="Preview Agreement" onPress={() => setPreviewOpen(true)} variant="secondary" />
          </View>
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              disabled={saveState.isLoading}
              label={saveState.isLoading ? "Saving…" : "Save agreement settings"}
              onPress={() => void save()}
            />
          </View>
        </View>
      ) : null}

      {previewOpen && property && clauses ? (
        <AgreementPreviewSheet
          clauses={[...derivedPreviewClauses(property, exitPoliciesQuery.data), ...clauses]}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      {addClauseOpen ? (
        <AddClauseSheet
          onAdd={(heading, body) => {
            addCustomClause(heading, body);
            setAddClauseOpen(false);
          }}
          onClose={() => setAddClauseOpen(false)}
        />
      ) : null}
    </View>
  );
}

// Modal for authoring a new custom clause: the card is only added once both
// fields are filled, so no empty placeholder cards ever appear in the list.
// The body scrolls and the bottom edge is measured natively inside the modal
// window (SafeAreaView), so the button clears the nav bar and stays reachable
// when the keyboard resizes the window.
function AddClauseSheet({ onAdd, onClose }: { onAdd: (heading: string, body: string) => void; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!heading.trim() || !body.trim()) {
      setError("Fill in both the heading and the body to add the clause.");
      return;
    }
    onAdd(heading.trim(), body.trim());
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      {/* Expo 56 Android is edge-to-edge, where adjustResize no longer resizes
          the modal window — KeyboardAvoidingView with "padding" is what lifts
          the sheet above the keyboard on BOTH platforms. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} numberOfLines={1} selectable>
                New clause
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>
            <ScrollView
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
                <FormInput
                  label="Clause Heading"
                  onChangeText={(text) => {
                    setHeading(text);
                    setError(null);
                  }}
                  placeholder="e.g. Liability, Guests, Parking"
                  value={heading}
                />
                <FormInput
                  label="Clause Body"
                  multiline
                  onChangeText={(text) => {
                    setBody(text);
                    setError(null);
                  }}
                  placeholder="Write the rule exactly as the tenant should read it"
                  value={body}
                />
                {error ? (
                  <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]} selectable>
                    {error}
                  </Text>
                ) : null}
                <ActionButton icon={Plus} label="Add clause" onPress={submit} />
            </ScrollView>
            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The property-derived rules as the TENANT will read them, composed from the
// property's current policy and exit policies. Rent is room-dependent, so the
// preview states the source rather than a number. Bodies mirror the backend
// assembler's wording.
function derivedPreviewClauses(property: OwnerProperty, exitPolicy?: PropertyExitPolicy): AgreementClause[] {
  const lateFeePaise = property.rentLateFeePerDayPaise ?? 0;
  const damageItems = exitPolicy?.damageCharges ?? [];
  const checklist = exitPolicy?.exitChecklist ?? [];
  return [
    {
      body: "Monthly rent as agreed at onboarding (from the selected room), payable each billing cycle.",
      displayOrder: 0,
      heading: "Monthly rent",
      kind: "SYSTEM",
      systemType: "RENT",
      value: null,
    },
    {
      body:
        property.standardDepositPaise > 0
          ? `A refundable security deposit of ${rupeesLabel(property.standardDepositPaise)} is payable at the start of the tenancy.`
          : "No security deposit is collected for this tenancy.",
      displayOrder: 1,
      heading: "Security deposit",
      kind: "SYSTEM",
      systemType: "SECURITY_DEPOSIT",
      value: null,
    },
    {
      body: `Either party may end this tenancy by giving ${property.noticePeriodDays} days' notice.`,
      displayOrder: 2,
      heading: "Notice period",
      kind: "SYSTEM",
      systemType: "NOTICE_PERIOD",
      value: null,
    },
    {
      body: `Rent carries a grace period of ${property.rentGraceDays} days after the cycle due date.`,
      displayOrder: 3,
      heading: "Rent grace period",
      kind: "SYSTEM",
      systemType: "GRACE_DAYS",
      value: null,
    },
    {
      body:
        lateFeePaise > 0
          ? `A late fee of ${rupeesLabel(lateFeePaise)} per day applies to rent unpaid after the grace period.`
          : "No late fee is charged on delayed rent.",
      displayOrder: 4,
      heading: "Late fee",
      kind: "SYSTEM",
      systemType: "LATE_FEE",
      value: null,
    },
    {
      body:
        damageItems.length > 0
          ? `Damage beyond normal wear is charged per the property's damage schedule (${damageItems.length} item${damageItems.length === 1 ? "" : "s"}).`
          : "No pre-agreed damage charges; any damage charge must be evidenced at move-out.",
      displayOrder: 5,
      heading: "Damage charges",
      kind: "SYSTEM",
      systemType: "DAMAGE_CATALOG",
      value: { items: damageItems },
    },
    {
      body:
        checklist.length > 0
          ? `Before the deposit is settled: ${checklist.join(", ")}.`
          : "No exit prerequisites are required before the deposit is settled.",
      displayOrder: 6,
      heading: "Move-out checklist",
      kind: "SYSTEM",
      systemType: "EXIT_PREREQUISITES",
      value: { checklist },
    },
  ];
}

// Bottom sheet showing the assembled agreement exactly as the tenant's
// acceptance screen renders it (same AgreementClauseList component). Mirrors
// the nearby-places form sheet structure, the app's proven modal recipe.
function AgreementPreviewSheet({ clauses, onClose }: { clauses: AgreementClause[]; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            maxHeight: "92%",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
          }}
        >
          {/* Title fixed, ScrollView shrinkable, SafeAreaView demoted to a pure
              bottom SPACER: wrapping the ScrollView in it broke the maxHeight
              constraint chain and clipped the sheet's bottom. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} numberOfLines={1} selectable>
                Agreement preview
              </Text>
              <Text style={[type.caption, { color: colors.muted }]} selectable>
                Exactly what the tenant sees before accepting.
              </Text>
            </View>
            <IconButton accessibilityLabel="Close preview" icon={X} onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs }} showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            <AgreementClauseList clauses={clauses} />
          </ScrollView>
          <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
        </View>
      </View>
    </Modal>
  );
}

// Read-only view of a property exit policy inside the agreement screen, with a
// jump to the exit-policies screen where the values are actually edited.
function ExitPolicyCard({
  body,
  heading,
  onConfigure,
}: {
  body: string;
  heading: string;
  onConfigure: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
        {heading}
      </Text>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
        {body}
      </Text>
      <View style={{ flexDirection: "row" }}>
        <ActionButton icon={SlidersHorizontal} label="Configure" onPress={onConfigure} variant="secondary" />
      </View>
    </Card>
  );
}

function ModeRow({
  onPress,
  selected,
  subtitle,
  title,
}: {
  onPress: () => void;
  selected: boolean;
  subtitle: string;
  title: string;
}) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.primarySoft : colors.surfaceRaised,
        borderColor: selected ? colors.primary : colors.border,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        gap: 2,
        padding: spacing.md,
      }}
    >
      <Text style={[type.bodyStrong, { color: selected ? colors.primary : colors.ink }]} selectable={false}>
        {title}
      </Text>
      <Text style={[type.caption, { color: colors.muted }]} selectable={false}>
        {subtitle}
      </Text>
    </AnimatedPressable>
  );
}

// One editor card per compliance-owned system rule, with an include/exclude
// checkbox: unselecting clears the rule's value, so its body reads the same
// "none" message a zero value produces. The rendered body regenerates on every
// value change so what tenants read never drifts from what the settlement
// engine will enforce.
function SystemRuleEditor({
  clause,
  onChange,
}: {
  clause: AgreementClause;
  onChange: (updater: (clause: AgreementClause) => AgreementClause) => void;
}) {
  const { colors, type } = useTheme();
  const [included, setIncluded] = useState(ruleHasValue(clause));
  // Unchecking clears the clause value (the agreement must read "none"), but
  // the entered data is stashed here so rechecking restores it instead of
  // making the owner retype a whole damage catalog or checklist.
  const [stashedValue, setStashedValue] = useState<Record<string, unknown> | null>(null);

  function toggleIncluded() {
    if (included) {
      setStashedValue(clause.value);
      onChange(clearRuleValue);
      setIncluded(false);
    } else {
      if (stashedValue) {
        onChange((current) => restoreRuleValue(current, stashedValue));
      }
      setIncluded(true);
    }
  }

  return (
    <Card>
      <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
        {clause.heading}
      </Text>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
        {clause.body}
      </Text>
      <CheckRow checked={included} label="Apply this rule" onToggle={toggleIncluded} />
      {included ? (
        <>
          {clause.systemType === "LOCK_IN" ? <LockInEditor clause={clause} onChange={onChange} /> : null}
          {clause.systemType === "ALLOWED_DEDUCTIONS" ? <DeductionsEditor clause={clause} onChange={onChange} /> : null}
        </>
      ) : null}
    </Card>
  );
}

// A rule counts as "applied" when it carries a non-empty value.
function ruleHasValue(clause: AgreementClause): boolean {
  switch (clause.systemType) {
    case "LOCK_IN":
      return lockInMonths(clause) > 0;
    case "ALLOWED_DEDUCTIONS":
      return deductionCategories(clause).length > 0;
    default:
      return true;
  }
}

// Unselecting a rule empties its value; the body regenerates to the "none"
// wording, identical to entering zero.
function clearRuleValue(clause: AgreementClause): AgreementClause {
  switch (clause.systemType) {
    case "LOCK_IN":
      return withLockIn(clause, 0, "REMAINING_TERM", 0);
    case "ALLOWED_DEDUCTIONS":
      return withDeductionCategories(clause, []);
    default:
      return clause;
  }
}

// Re-applies a stashed value through the same transforms editing uses, so the
// body text regenerates to match the restored data.
function restoreRuleValue(clause: AgreementClause, stashed: Record<string, unknown>): AgreementClause {
  switch (clause.systemType) {
    case "LOCK_IN":
      return withLockIn(
        clause,
        Number(stashed.months) || 0,
        stashed.penaltyType === "FIXED" ? "FIXED" : "REMAINING_TERM",
        Number(stashed.penaltyFixedPaise) || 0,
      );
    case "ALLOWED_DEDUCTIONS":
      return withDeductionCategories(clause, Array.isArray(stashed.categories) ? (stashed.categories as string[]) : []);
    default:
      return clause;
  }
}

function CheckRow({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
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
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} selectable={false}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

type EditorProps = {
  clause: AgreementClause;
  onChange: (updater: (clause: AgreementClause) => AgreementClause) => void;
};

const PENALTY_OPTIONS: { value: LockInPenaltyType; label: string }[] = [
  { label: "Remaining term's rent", value: "REMAINING_TERM" },
  { label: "Fixed amount", value: "FIXED" },
];

function LockInEditor({ clause, onChange }: EditorProps) {
  const { colors, type } = useTheme();
  const months = lockInMonths(clause);
  const penaltyType = lockInPenaltyType(clause);
  const fixedPaise = lockInPenaltyFixedPaise(clause);
  return (
    <View style={{ gap: spacing.sm }}>
      <FormInput
        keyboardType="number-pad"
        label="Lock-in (months, 0 = none)"
        onChangeText={(text) => onChange((current) => withLockIn(current, toCount(text), penaltyType, fixedPaise))}
        placeholder="0"
        value={months > 0 ? String(months) : ""}
      />
      {months > 0 ? (
        <>
          <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
            Early-exit penalty
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {PENALTY_OPTIONS.map((option) => (
              <ChoiceButton
                active={penaltyType === option.value}
                key={option.value}
                label={option.label}
                onPress={() => onChange((current) => withLockIn(current, months, option.value, fixedPaise))}
              />
            ))}
          </View>
          {penaltyType === "REMAINING_TERM" ? (
            <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
              A leaving tenant pays rent for the days remaining in the lock-in (prorated), on top of the notice period.
            </Text>
          ) : (
            <FormInput
              keyboardType="number-pad"
              label="Fixed penalty"
              onChangeText={(text) => onChange((current) => withLockIn(current, months, "FIXED", toCount(text) * 100))}
              placeholder="0"
              prefix="₹"
              value={fixedPaise > 0 ? String(Math.round(fixedPaise / 100)) : ""}
            />
          )}
        </>
      ) : null}
    </View>
  );
}

function DeductionsEditor({ clause, onChange }: EditorProps) {
  const { colors, fonts } = useTheme();
  const selected = deductionCategories(clause);
  const customs = selected.filter((value) => !DEDUCTION_OPTIONS.some((option) => option.value === value));
  const [draft, setDraft] = useState("");

  function addCustom() {
    const trimmed = draft.trim();
    if (!trimmed || selected.some((value) => value.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    onChange((current) => withDeductionCategories(current, [...selected, trimmed]));
    setDraft("");
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {DEDUCTION_OPTIONS.map((option) => (
          <ChoiceButton
            active={selected.includes(option.value)}
            key={option.value}
            label={option.label}
            onPress={() =>
              onChange((current) =>
                withDeductionCategories(
                  current,
                  selected.includes(option.value)
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value],
                ),
              )
            }
          />
        ))}
        {customs.map((value) => (
          <View
            key={value}
            style={{
              alignItems: "center",
              backgroundColor: colors.primarySoft,
              borderRadius: 999,
              flexDirection: "row",
              gap: spacing.xs,
              paddingHorizontal: spacing.md,
              paddingVertical: 9,
            }}
          >
            <Text style={{ color: colors.primary, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" }} selectable>
              {value}
            </Text>
            <AnimatedPressable
              accessibilityLabel={`Remove ${value}`}
              onPress={() =>
                onChange((current) => withDeductionCategories(current, selected.filter((item) => item !== value)))
              }
            >
              <X color={colors.primary} size={14} strokeWidth={2.6} />
            </AnimatedPressable>
          </View>
        ))}
      </View>
      <FormInput
        label="Add a custom deduction type"
        onChangeText={setDraft}
        placeholder="e.g. Parking damage, Key replacement"
        value={draft}
      />
      <ActionButton icon={Plus} label="Add deduction type" onPress={addCustom} variant="secondary" />
    </View>
  );
}

function toCount(text: string) {
  const value = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
