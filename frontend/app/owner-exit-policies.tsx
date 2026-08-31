import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Check, DoorOpen, Plus, Trash2 } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { isUnchanged } from "@/features/forms/unchanged";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  useGetPropertyExitPoliciesQuery,
  useUpdatePropertyExitPoliciesMutation,
  type PropertyDamageCharge,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Property-level exit policies: the damage-charge schedule and move-out
// checklist. These apply to EVERY monthly tenancy at deposit settlement (with or
// without an agreement) and are read into agreements by the compliance module.
export default function OwnerExitPoliciesScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  // Exit policies and the tenancy agreement share one permission: both are the
  // rules a stay runs under. View-only keeps the screen fully legible and
  // disables the controls rather than removing them — on a settings screen the
  // shape of what is configurable is itself the information.
  const { canManage } = usePropertyPermissions(propertyId);
  const readOnly = !canManage("TENANCY_RULES");
  const policiesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const [savePolicies, saveState] = useUpdatePropertyExitPoliciesMutation();

  // Editable draft, seeded from the server copy once it arrives.
  const [damageCharges, setDamageCharges] = useState<PropertyDamageCharge[] | null>(null);
  const [checklist, setChecklist] = useState<string[] | null>(null);
  // The premature-exit policy is NOT edited here any more. It moved to the
  // agreement screen, under the indefinite term it qualifies — the two halves of
  // "how does this tenancy end" were split across two screens, so neither read
  // as a whole rule.
  useEffect(() => {
    if (policiesQuery.data && damageCharges === null && checklist === null) {
      setDamageCharges(policiesQuery.data.damageCharges);
      setChecklist(policiesQuery.data.exitChecklist);
    }
  }, [checklist, damageCharges, policiesQuery.data]);

  // Server refusal — no field owns it, so it takes a modal.
  const opErrors = useFormErrors<never>();

  async function save() {
    if (!propertyId || damageCharges === null || checklist === null) {
      return;
    }

    // Compared against the server copy, so returning a field to its original
    // value counts as no change rather than arming the save forever.
    const saved = policiesQuery.data;
    if (
      saved &&
      isUnchanged(
        {
          checklist: saved.exitChecklist,
          damages: saved.damageCharges.map(damageKey),
        },
        {
          checklist,
          damages: damageCharges.map(damageKey),
        },
      )
    ) {
      toast.warning("No changes have been made.");
      return;
    }

    try {
      await savePolicies({
        propertyId,
        payload: {
          damageCharges,
          exitChecklist: checklist,
          permittedDeductions: policiesQuery.data?.permittedDeductions ?? [],
        },
      }).unwrap();
      toast.success("Exit policies saved.");
    } catch (caught) {
      opErrors.failFromServer(errorMessage(caught));
    }
  }

  const ready = Boolean(property) && !policiesQuery.isLoading && damageCharges !== null && checklist !== null;

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        safeAreaEdges={["top"]}
        contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: 0 }}
      >
        <ScreenHeader
        eyebrow="Tenancy"
        onBack={() => router.back()}
        badge={readOnly ? <ViewOnlyChip /> : null}
          title="Exit"
          italicTail="policies."
          subtitle={
            property
              ? `The damage charges and move-out checklist used when a tenancy at ${property.name} ends.`
              : "Select a property from Home to manage its exit policies."
          }
        />

        {!property ? (
          <EmptyState
            icon={DoorOpen}
            title="No property selected"
            description="Choose an active property from Home before managing its exit policies."
          />
        ) : policiesQuery.isLoading || damageCharges === null || checklist === null ? (
          <>
            <SkeletonCard />
            <SkeletonList />
          </>
        ) : (
          <>
            <Section title="Damage charges">
              <Card>
                <DamageChargesEditor charges={damageCharges} onChange={setDamageCharges} readOnly={readOnly} />
              </Card>
            </Section>

            <Section title="Move-out checklist">
              <Card>
                <ChecklistEditor checklist={checklist} onChange={setChecklist} readOnly={readOnly} />
              </Card>
            </Section>
          </>
        )}

      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
      </ScreenScrollView>

      {ready ? (
        <PinnedFooter>
          <ActionButton
            disabled={readOnly || saveState.isLoading}
            label={saveState.isLoading ? "Saving…" : readOnly ? "View only" : "Save exit policies"}
            onPress={() => void save()}
          />
        </PinnedFooter>
      ) : null}
    </View>
  );
}

function DamageChargesEditor({
  charges,
  onChange,
  readOnly,
}: {
  charges: PropertyDamageCharge[];
  onChange: (next: PropertyDamageCharge[]) => void;
  readOnly: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  function addItem() {
    const trimmed = name.trim();
    const chargePaise = toRupeesCount(amount) * 100;
    if (!trimmed || chargePaise <= 0) {
      return;
    }
    onChange([...charges, { chargePaise, name: trimmed }]);
    setName("");
    setAmount("");
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        A flat charge per item for considerable damage. At settlement you pick which items apply.
      </Text>
      {charges.map((item, index) => (
        <View
          key={`${item.name}-${index}`}
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 10,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13, }}>
            {item.name}
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontVariant: ["tabular-nums"] }]}>
            {formatMoneyPaise(item.chargePaise)}
          </Text>
          <AnimatedPressable
            accessibilityLabel={`Remove ${item.name}`}
            onPress={() => onChange(charges.filter((_, i) => i !== index))}
            style={{ padding: 2 }}
          >
            <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
          </AnimatedPressable>
        </View>
      ))}

      <FormInput label="Item" onChangeText={setName} placeholder="e.g. Mattress, Study chair, Door lock" value={name} />
      <FormInput keyboardType="number-pad" label="Damage charge" onChangeText={setAmount} placeholder="0" prefix="₹" value={amount} />
      <ActionButton disabled={readOnly} icon={Plus} label="Add item" onPress={addItem} variant="secondary" />
    </View>
  );
}

function ChecklistEditor({
  checklist,
  onChange,
  readOnly,
}: {
  checklist: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const [draft, setDraft] = useState("");

  function addEntry() {
    const trimmed = draft.trim();
    if (!trimmed || checklist.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    onChange([...checklist, trimmed]);
    setDraft("");
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        Verified before the deposit is settled.
      </Text>

      {/* A list, not chips. These are things to tick off one by one at move-out,
          and a wrapped row of pills reads as tags — unordered, decorative, and
          impossible to scan against the item in front of you. */}
      {checklist.length === 0 ? (
        <Text style={[type.caption, { color: colors.kicker }]}>
          No items yet.
        </Text>
      ) : (
        checklist.map((entry, index) => (
          <View
            key={`${entry}-${index}`}
            style={{
              alignItems: "center",
              borderBottomColor: colors.border,
              borderBottomWidth: index === checklist.length - 1 ? 0 : 1,
              flexDirection: "row",
              gap: spacing.sm,
              paddingVertical: spacing.sm,
            }}
          >
            <View
              style={{
                alignItems: "center",
                borderColor: colors.borderStrong,
                borderCurve: "continuous",
                borderRadius: 6,
                borderWidth: 1.5,
                height: 22,
                justifyContent: "center",
                width: 22,
              }}
            >
              <Check color={colors.kicker} size={13} strokeWidth={3} />
            </View>
            <Text selectable style={[type.body, { color: colors.ink, flex: 1 }]}>
              {entry}
            </Text>
            {readOnly ? null : (
              <AnimatedPressable
                accessibilityLabel={`Remove ${entry}`}
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => onChange(checklist.filter((_, i) => i !== index))}
              >
                <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
              </AnimatedPressable>
            )}
          </View>
        ))
      )}

      <FormInput label="Add a checklist item" onChangeText={setDraft} placeholder="e.g. Keys returned" value={draft} />
      <ActionButton disabled={readOnly} icon={Plus} label="Add to checklist" onPress={addEntry} variant="secondary" />
    </View>
  );
}

function toRupeesCount(text: string) {
  const value = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * One damage charge flattened to a comparable string.
 *
 * <p>`isUnchanged` compares arrays element by element; a list of objects would
 * compare by identity and every reload would read as an edit.
 */
function damageKey(charge: PropertyDamageCharge) {
  return `${charge.name}::${charge.chargePaise}`;
}
