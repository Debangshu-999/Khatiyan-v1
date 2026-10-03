import { useState } from "react";
import { Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  useGetEnquiryHandlerSettingsQuery,
  useSaveEnquiryHandlerSettingsMutation,
  type EnquiryHandlerMode,
} from "@/store/services/enquiry-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const MODES: { description: string; label: string; suggested?: boolean; value: EnquiryHandlerMode }[] = [
  {
    description: "Each new enquiry goes to the next manager in turn, so everyone gets an even share.",
    label: "Auto assigned",
    suggested: true,
    value: "SYSTEM_TURNS",
  },
  {
    // The owner is one of them (user, 2026-10-03).
    description: "New enquiries wait for anyone in management, you included. Whoever responds first handles the enquiry.",
    label: "First to respond",
    value: "FIRST_RESPONSE",
  },
  {
    description: "New enquiries wait for you. You give each one to yourself or a manager.",
    label: "Manually assign",
    value: "OWNER_ASSIGNS",
  },
];

/**
 * How enquiries are assigned, from the gear on the owner's Enquiries screen
 * (user, 2026-10-03). Owner only. Save is offered only when the pick differs
 * from what is saved, so switching away and back again leaves it off.
 *
 * <p>The owner's "takes a turn too" setting is kept as it is: this sheet only
 * chooses the mode.
 */
export function HandlerModeSheet({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const settingsQuery = useGetEnquiryHandlerSettingsQuery(propertyId, { refetchOnMountOrArgChange: true });
  const [save, saveState] = useSaveEnquiryHandlerSettingsMutation();
  const [picked, setPicked] = useState<EnquiryHandlerMode | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const settings = settingsQuery.data;
  const chosen = picked ?? settings?.mode ?? null;
  // Dirty only when the pick differs from what is saved.
  const dirty = Boolean(settings && picked && picked !== settings.mode);

  async function submit() {
    if (!settings || !picked || !dirty || saveState.isLoading) {
      return;
    }
    try {
      await save({
        includeOwner: settings.includeOwner,
        mode: picked,
        propertyId,
        version: settings.configured ? settings.version : null,
      }).unwrap();
      toast.show("Saved.", "success");
      onClose();
    } catch (error) {
      setRefusal(errorMessage(error));
    }
  }

  if (refusal) {
    return <AlertModal message={refusal} onClose={onClose} />;
  }

  return (
    <SheetShell onClose={onClose} title="Assigning enquiries">
      <Text style={[type.modalDescription, { color: colors.muted }]}>How each new enquiry finds the person who handles it.</Text>

      {MODES.map((mode) => (
        <ModeRow
          description={mode.description}
          disabled={!settings}
          key={mode.value}
          label={mode.label}
          onPress={() => setPicked(mode.value)}
          selected={chosen === mode.value}
          suggested={mode.suggested}
        />
      ))}

      <Text style={[type.caption, { color: colors.kicker }]}>Enquiries that already have a handler keep them.</Text>

      <ActionButton disabled={!dirty || saveState.isLoading} label={saveState.isLoading ? "Saving" : "Save"} onPress={() => void submit()} />
    </SheetShell>
  );
}

function ModeRow({
  description,
  disabled,
  label,
  onPress,
  selected,
  suggested = false,
}: {
  description: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  suggested?: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "flex-start",
        backgroundColor: colors.neutralSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <CircleCheckbox checked={selected} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{label}</Text>
          {suggested ? <StatusPill label="Suggested" tone="success" /> : null}
        </View>
        <Text style={[type.caption, { color: colors.muted }]}>{description}</Text>
      </View>
    </AnimatedPressable>
  );
}

/** A round checkbox: an empty ring, or a filled disc with a tick when chosen. */
export function CircleCheckbox({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: checked ? colors.primary : colors.surface,
        borderColor: checked ? colors.primary : colors.borderStrong,
        borderRadius: 999,
        borderWidth: 2,
        height: 22,
        justifyContent: "center",
        marginTop: 1,
        width: 22,
      }}
    >
      {checked ? <Check color={colors.onPrimary} size={13} strokeWidth={3} /> : null}
    </View>
  );
}
