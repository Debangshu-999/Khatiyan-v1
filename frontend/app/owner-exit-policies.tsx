import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { DoorOpen, Plus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { rupeesLabel } from "@/features/compliance/clause-values";
import { ActionButton, BackButton, FormInput } from "@/features/owner/owner-ui";
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const policiesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const [savePolicies, saveState] = useUpdatePropertyExitPoliciesMutation();

  // Editable draft, seeded from the server copy once it arrives.
  const [damageCharges, setDamageCharges] = useState<PropertyDamageCharge[] | null>(null);
  const [checklist, setChecklist] = useState<string[] | null>(null);

  useEffect(() => {
    if (policiesQuery.data && damageCharges === null && checklist === null) {
      setDamageCharges(policiesQuery.data.damageCharges);
      setChecklist(policiesQuery.data.exitChecklist);
    }
  }, [checklist, damageCharges, policiesQuery.data]);

  async function save() {
    if (!propertyId || damageCharges === null || checklist === null) {
      return;
    }
    try {
      await savePolicies({
        propertyId,
        payload: { damageCharges, exitChecklist: checklist },
      }).unwrap();
      toast.success("Exit policies saved.");
    } catch {
      toast.error("Could not save the exit policies.");
    }
  }

  const ready = Boolean(property) && !policiesQuery.isLoading && damageCharges !== null && checklist !== null;

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        safeAreaEdges={["top"]}
        contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.lg, paddingTop: 0 }}
      >
        <BackButton onPress={() => router.back()} />
        <ScreenHeader
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
            eyebrow="Property required"
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
            <Section eyebrow="Deposit settlement" title="Damage charges">
              <Card>
                <DamageChargesEditor charges={damageCharges} onChange={setDamageCharges} />
              </Card>
            </Section>

            <Section eyebrow="Before settlement" title="Move-out checklist">
              <Card>
                <ChecklistEditor checklist={checklist} onChange={setChecklist} />
              </Card>
            </Section>
          </>
        )}
      </ScreenScrollView>

      {ready ? (
        <View
          style={{
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            flexDirection: "row",
            paddingBottom: Math.max(insets.bottom, spacing.md),
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
          }}
        >
          <ActionButton
            disabled={saveState.isLoading}
            label={saveState.isLoading ? "Saving…" : "Save exit policies"}
            onPress={() => void save()}
          />
        </View>
      ) : null}
    </View>
  );
}

function DamageChargesEditor({
  charges,
  onChange,
}: {
  charges: PropertyDamageCharge[];
  onChange: (next: PropertyDamageCharge[]) => void;
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
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
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
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" }} selectable>
            {item.name}
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontVariant: ["tabular-nums"] }]} selectable>
            {rupeesLabel(item.chargePaise)}
          </Text>
          <AnimatedPressable
            accessibilityLabel={`Remove ${item.name}`}
            onPress={() => onChange(charges.filter((_, i) => i !== index))}
            style={{ padding: 2 }}
          >
            <X color={colors.danger} size={15} strokeWidth={2.4} />
          </AnimatedPressable>
        </View>
      ))}

      <FormInput label="Item" onChangeText={setName} placeholder="e.g. Mattress, Study chair, Door lock" value={name} />
      <FormInput keyboardType="number-pad" label="Damage charge" onChangeText={setAmount} placeholder="0" prefix="₹" value={amount} />
      <ActionButton icon={Plus} label="Add item" onPress={addItem} variant="secondary" />
    </View>
  );
}

function ChecklistEditor({ checklist, onChange }: { checklist: string[]; onChange: (next: string[]) => void }) {
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
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
        The owner verifies these before settling the deposit when a tenancy ends.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {checklist.map((entry, index) => (
          <View
            key={`${entry}-${index}`}
            style={{
              alignItems: "center",
              backgroundColor: colors.primarySoft,
              borderRadius: 999,
              flexDirection: "row",
              gap: spacing.xs,
              paddingHorizontal: spacing.md,
              paddingVertical: 7,
            }}
          >
            <Text style={{ color: colors.primary, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" }} selectable>
              {entry}
            </Text>
            <AnimatedPressable
              accessibilityLabel={`Remove ${entry}`}
              onPress={() => onChange(checklist.filter((_, i) => i !== index))}
            >
              <X color={colors.primary} size={14} strokeWidth={2.6} />
            </AnimatedPressable>
          </View>
        ))}
      </View>
      <FormInput label="Add a checklist item" onChangeText={setDraft} placeholder="e.g. Keys returned" value={draft} />
      <ActionButton icon={Plus} label="Add to checklist" onPress={addEntry} variant="secondary" />
    </View>
  );
}

function toRupeesCount(text: string) {
  const value = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
