import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Check, ChevronRight, Eye, FileSignature, Info, Plus, SlidersHorizontal, Trash2, X } from "lucide-react-native";

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
  earlyExitRule,
  MAX_VALIDITY_MONTHS,
  validityMonths,
  rupeesLabel,
  withDeductionCategories,
  withValidity,
} from "@/features/compliance/clause-values";
import { SegmentedChoice } from "@/components/segmented-choice";
import { AgreementClauseList } from "@/features/compliance/agreement-clause-list";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { ActionButton, ChoiceButton, FormInput, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  NOTICE_PERIOD_LABELS,
  useGetPropertyExitPoliciesQuery,
  type OwnerProperty,
  type PropertyExitPolicy,
} from "@/store/services/property-api";
import {
  PROPERTY_DERIVED_CLAUSE_TYPES,
  useGetPropertyAgreementSettingsQuery,
  useUpdatePropertyAgreementSettingsMutation,
  type AgreementClause,
} from "@/store/services/compliance-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";


const DEDUCTION_OPTIONS: { value: string; label: string }[] = [
  { label: "Damage", value: "DAMAGE" },
  { label: "Unpaid dues", value: "UNPAID_DUES" },
  { label: "Cleaning", value: "CLEANING" },
];

// Read-only is needed by clause editors several levels down, so it travels by
// context rather than through every intermediate component's props.
const AgreementReadOnlyContext = createContext(false);

function useAgreementReadOnly() {
  return useContext(AgreementReadOnlyContext);
}

/**
 * A comparison key for the clause draft.
 *
 * <p>Keys are sorted because clause values are plain objects rebuilt on every
 * edit; JSON.stringify would otherwise report a change for a value that only
 * had its key order shuffled, and the Save button would light up on its own.
 */
function stableClauseKey(clauses: AgreementClause[]): string {
  return JSON.stringify(clauses, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

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
  const [clauses, setClauses] = useState<AgreementClause[] | null>(null);
  // The draft as it was first loaded, to tell an edited agreement from an
  // untouched one. Saving an unchanged agreement is not harmless here: every
  // save rewrites the property's stored clause set, and the screen offers no
  // undo.
  const [baseline, setBaseline] = useState<string | null>(null);
  // Set when the load itself dropped stale clauses. That makes the draft already
  // differ from what is stored, so the save that cleans them up must stay
  // available even though the user has not typed anything.
  const [needsCleanup, setNeedsCleanup] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && clauses === null) {
      // Strip clause types no longer stored here: CLEANING_FEE (dropped from
      // authoring) and the property-derived rules (damage charges, move-out
      // checklist) that moved to the property's exit policies. Old rows seeded
      // before those moves still carry them; the next save cleans the stored set.
      const kept = settingsQuery.data.defaultClauses.filter(
        (clause) =>
          clause.systemType !== "CLEANING_FEE" &&
          (clause.systemType == null || !PROPERTY_DERIVED_CLAUSE_TYPES.includes(clause.systemType)),
      );
      setClauses(kept);
      setBaseline(stableClauseKey(kept));
      setNeedsCleanup(kept.length !== settingsQuery.data.defaultClauses.length);
    }
  }, [clauses, settingsQuery.data]);

  const dirty = needsCleanup || (clauses != null && baseline != null && stableClauseKey(clauses) !== baseline);

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



  async function save() {
    if (!propertyId || clauses === null) {
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
      await saveSettings({ defaultClauses: ordered, propertyId }).unwrap();
      // What was just persisted becomes the new baseline, so the button falls
      // back to disabled rather than inviting an identical second save. The
      // draft is re-seeded from `ordered` because saving also renumbers
      // displayOrder, which would otherwise read as an unsaved change.
      setClauses(ordered);
      setBaseline(stableClauseKey(ordered));
      setNeedsCleanup(false);
      toast.success("Agreement settings saved.");
    } catch {
      toast.error("Could not save the agreement settings.");
    }
  }

  const ready = Boolean(property) && !settingsQuery.isLoading && clauses !== null;
  // Read off the LOCAL draft, not the saved settings — the preview has to follow
  // the toggle immediately, or picking "Fixed term" leaves the notice clause on
  // screen until the owner saves and reloads.
  const previewHasFixedTerm = (clauses ?? []).some(
    (clause) =>
      clause.kind === "SYSTEM"
      && (clause.systemType === "VALIDITY" || clause.systemType === "LOCK_IN")
      && validityMonths(clause) != null,
  );
  // Shares TENANCY_RULES with exit policies — both are the rules a stay runs
  // under, so they are one decision for the owner.
  const { canManage } = usePropertyPermissions(propertyId);
  const readOnly = !canManage("TENANCY_RULES");

  return (
    <AgreementReadOnlyContext.Provider value={readOnly}>
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      {/* Extra bottom clearance: the fixed two-row footer is taller than the
          default stack-screen padding assumes, and clipped the last card. */}
      <ScreenScrollView safeAreaEdges={["top"]} contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.lg, paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Tenancy"
        onBack={() => router.back()}
        badge={readOnly ? <ViewOnlyChip /> : null}
        title="Tenancy"
        italicTail="agreement."
        subtitle={
          property
            ? `Every monthly tenancy at ${property.name} runs on these terms. The tenant accepts them before the stay begins.`
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
      ) : settingsQuery.isLoading || clauses === null ? (
        <>
          <SkeletonCard />
          <SkeletonList />
        </>
      ) : (
        <>

          <Section eyebrow="Locked" title="Rent & property policy">
            <Card>
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                <Info color={colors.muted} size={15} strokeWidth={2.2} style={{ marginTop: 2 }} />
                <Text style={[type.body, { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 19 }]}>
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
                  <Text style={[type.eyebrow, { color: colors.kicker }]}>
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
          reachable no matter how long the clause list scrolls.

          Kept as a solid bar rather than the faded PinnedFooter used elsewhere:
          this footer stacks two rows of buttons, and a gradient behind that much
          height reads as a smear instead of a fade. A hard edge is the honest
          treatment when the bar is genuinely tall. */}
      {ready ? (
        <View
          style={{
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            gap: spacing.sm,
            paddingBottom: insets.bottom + spacing.md,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={readOnly} icon={Plus} label="Add clause" onPress={() => setAddClauseOpen(true)} variant="secondary" />
            <ActionButton icon={Eye} label="Preview Agreement" onPress={() => setPreviewOpen(true)} variant="secondary" />
          </View>
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              disabled={readOnly || saveState.isLoading || !dirty}
              label={
                saveState.isLoading
                  ? "Saving…"
                  : readOnly
                    ? "View only"
                    : dirty
                      ? "Save agreement settings"
                      : "No changes to save"
              }
              onPress={() => void save()}
            />
          </View>
        </View>
      ) : null}

      {previewOpen && property && clauses ? (
        <AgreementPreviewSheet
          clauses={[...derivedPreviewClauses(property, exitPoliciesQuery.data, previewHasFixedTerm), ...clauses]}
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
    </AgreementReadOnlyContext.Provider>
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
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }} numberOfLines={1}>
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
                  <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]}>
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
function derivedPreviewClauses(
  property: OwnerProperty,
  exitPolicy?: PropertyExitPolicy,
  fixedTerm = false,
): AgreementClause[] {
  const lateFeePaise = property.rentLateFeePerDayPaise ?? 0;
  const damageItems = exitPolicy?.damageCharges ?? [];
  const checklist = exitPolicy?.exitChecklist ?? [];
  // Mirrors AgreementAssembler, including its omissions: a fixed term drops the
  // notice clause entirely, so the preview must drop it too. The signed
  // agreement is content-hashed — a preview listing a clause the assembler will
  // not produce is not a cosmetic difference, it shows terms that never existed.
  const noticeClause: AgreementClause[] = fixedTerm
    ? []
    : [
        {
          // Word for word with the server.
          body: `Either party may end this tenancy by giving notice of ${NOTICE_PERIOD_LABELS[property.noticePeriod]}.`,
          displayOrder: 2,
          heading: "Notice period",
          kind: "SYSTEM",
          systemType: "NOTICE_PERIOD",
          value: null,
        },
      ];

  // Rides with the notice clause and for the same reason: both belong to an
  // open-ended stay. A fixed term prices an early departure through its own
  // validity rule, so showing this alongside it would offer the tenant two
  // different answers to one question.
  const prematureClause: AgreementClause[] =
    !fixedTerm && exitPolicy?.prematureExitPolicy?.trim()
      ? [
          {
            body: exitPolicy.prematureExitPolicy.trim(),
            displayOrder: 3,
            heading: "Leaving without notice",
            kind: "SYSTEM",
            systemType: "PREMATURE_EXIT",
            value: null,
          },
        ]
      : [];

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
    ...noticeClause,
    ...prematureClause,
    {
      body:
        property.rentGraceDays > 0
          ? `Rent carries a grace period of ${property.rentGraceDays} days after the cycle due date.`
          : "Rent is due on the cycle due date, with no grace period.",
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
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }} numberOfLines={1}>
                Agreement preview
              </Text>
              <Text style={[type.caption, { color: colors.muted }]}>
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
  const readOnly = useAgreementReadOnly();
  return (
    <Card>
      <Text style={[type.bodyStrong, { color: colors.ink }]}>
        {heading}
      </Text>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        {body}
      </Text>
      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={readOnly} icon={SlidersHorizontal} label="Configure" onPress={onConfigure} variant="secondary" />
      </View>
    </Card>
  );
}

function SystemRuleEditor({
  clause,
  onChange,
}: {
  clause: AgreementClause;
  onChange: (updater: (clause: AgreementClause) => AgreementClause) => void;
}) {
  const { colors, type } = useTheme();
  const [included, setIncluded] = useState(ruleHasValue(clause));
  // Validity is not optional, so it shows no opt-out.
  const alwaysApplies = clause.systemType === "VALIDITY" || clause.systemType === "LOCK_IN";
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
      <Text style={[type.bodyStrong, { color: colors.ink }]}>
        {clause.heading}
      </Text>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        {clause.body}
      </Text>
      {alwaysApplies ? null : (
        <CheckRow checked={included} label="Apply this rule" onToggle={toggleIncluded} />
      )}
      {included ? (
        <>
          {clause.systemType === "VALIDITY" || clause.systemType === "LOCK_IN" ? (
            <ValidityEditor clause={clause} onChange={onChange} />
          ) : null}
          {clause.systemType === "ALLOWED_DEDUCTIONS" ? <DeductionsEditor clause={clause} onChange={onChange} /> : null}
        </>
      ) : null}
    </Card>
  );
}

// A rule counts as "applied" when it carries a non-empty value.
function ruleHasValue(clause: AgreementClause): boolean {
  switch (clause.systemType) {
    case "VALIDITY":
    case "LOCK_IN":
      // Always applied. Every agreement has a validity — indefinite is a real
      // answer, not the rule being switched off. Treating "no term" as "not
      // applied" left the editor collapsed behind an unchecked box on every
      // property carrying the old months=0 default.
      return true;
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
    case "VALIDITY":
    case "LOCK_IN":
      return withValidity(clause, null, "");
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
    case "VALIDITY":
    case "LOCK_IN":
      return withValidity(
        clause,
        Number(stashed.validityMonths) > 0 ? Number(stashed.validityMonths) : null,
        typeof stashed.earlyExitRule === "string" ? stashed.earlyExitRule : "",
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
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

type EditorProps = {
  clause: AgreementClause;
  onChange: (updater: (clause: AgreementClause) => AgreementClause) => void;
};


/**
 * The agreement's validity, and what an early departure costs.
 *
 * <p>Two buttons rather than a months field where 0 secretly meant "none" —
 * the choice is categorical, so the control is, and there is no invalid value
 * left to type. Indefinite comes first because it is the right shape for most
 * PG stays; a fixed term is the deliberate exception.
 *
 * <p>The derived end date is shown because it is the most consequential fact
 * here and the one an owner would otherwise have to work out: a fixed term ends
 * the tenancy, not just the paperwork.
 */
function ValidityEditor({ clause, onChange }: EditorProps) {
  const { colors, type } = useTheme();
  const months = validityMonths(clause);
  const rule = earlyExitRule(clause);
  const fixed = months != null;

  return (
    <View style={{ gap: spacing.sm }}>
      <SegmentedChoice
        onChange={(next) =>
          onChange((current) =>
            next === "FIXED"
              ? withValidity(current, months ?? 11, rule)
              : withValidity(current, null, rule),
          )
        }
        options={[
          { label: "Indefinite", value: "INDEFINITE" },
          { label: "Fixed term", value: "FIXED" },
        ]}
        value={fixed ? "FIXED" : "INDEFINITE"}
      />
      {fixed ? (
        // The notice clause is dropped from a fixed-term agreement entirely, so
        // say why here — otherwise a rule the owner set on the property silently
        // stops appearing and they are left wondering where it went.
        <Text style={[type.caption, { color: colors.danger, lineHeight: 18 }]}>
          * Notice period does not apply to agreements with a fixed term.
        </Text>
      ) : null}

      {fixed ? (
        <>
          <FormInput
            keyboardType="number-pad"
            label="Length (months)"
            onChangeText={(text) => {
              const next = Math.min(Math.max(toCount(text), 1), MAX_VALIDITY_MONTHS);
              onChange((current) => withValidity(current, next, rule));
            }}
            placeholder="11"
            value={months != null ? String(months) : ""}
          />
          <Text style={[type.caption, { color: colors.muted }]}>
            Min 1, max {MAX_VALIDITY_MONTHS} months.
          </Text>

          <FormInput
            label="If the tenant leaves early"
            multiline
            onChangeText={(text) => onChange((current) => withValidity(current, months, text))}
            placeholder="e.g. One month's rent, deducted from the deposit."
            required
            value={rule}
          />
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            Your words, shown to whoever ends the tenancy. Nothing is charged automatically.
          </Text>
        </>
      ) : (
        <PrematureExitSummary />
      )}
    </View>
  );
}

/**
 * The indefinite counterpart to the fixed term's early-exit rule.
 *
 * <p>Read-only here, with a link out, because it lives on the property's exit
 * policies rather than in this clause set — the same treatment the damage
 * schedule and move-out checklist get. Editing it inline would put one value in
 * two places and let them drift.
 */
function PrematureExitSummary() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const exitPoliciesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const policy = exitPoliciesQuery.data?.prematureExitPolicy?.trim() ?? "";

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        Runs until the tenancy ends. The notice period applies.
      </Text>

      <View
        style={{
          borderColor: colors.borderStrong,
          borderRadius: 0,
          borderWidth: 1,
          gap: spacing.xs,
          padding: spacing.md,
        }}
      >
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          Premature exit
        </Text>
        <Text selectable style={[type.body, { color: policy ? colors.ink : colors.kicker, lineHeight: 20 }]}>
          {policy || "Not set — nothing is shown to the tenant for leaving without notice."}
        </Text>
      </View>

      <ActionButton
        icon={ChevronRight}
        label={policy ? "Configure premature exit" : "Set premature exit policy"}
        onPress={() => router.push("/owner-exit-policies")}
        variant="secondary"
      />
    </View>
  );
}

function DeductionsEditor({ clause, onChange }: EditorProps) {
  const { colors, fonts } = useTheme();
  const readOnly = useAgreementReadOnly();
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
            <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13, }}>
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
      <ActionButton disabled={readOnly} icon={Plus} label="Add deduction type" onPress={addCustom} variant="secondary" />
    </View>
  );
}

function toCount(text: string) {
  const value = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
