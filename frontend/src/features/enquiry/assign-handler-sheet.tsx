import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { CircleCheckbox } from "@/features/enquiry/handler-mode-sheet";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import { useAssignEnquiryHandlerMutation, type EnquiryDetail } from "@/store/services/enquiry-api";
import { useListPropertyManagersQuery } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Assign: the owner gives an unassigned enquiry to a manager, when enquiries
 * are assigned by hand (user, 2026-10-03). Each manager shows how many open
 * enquiries they hold right now, so the work can be spread. Assign turns on
 * once one is picked.
 *
 * @param openCounts open enquiries per manager's user id, counted by the screen from its list
 */
export function AssignHandlerSheet({
  enquiry,
  onClose,
  openCounts,
  propertyId,
}: {
  enquiry: EnquiryDetail;
  onClose: () => void;
  openCounts: Record<string, number>;
  propertyId: string;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const managersQuery = useListPropertyManagersQuery(propertyId);
  const [assign, assignState] = useAssignEnquiryHandlerMutation();
  const [picked, setPicked] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const managers = (managersQuery.data ?? []).filter((manager) => manager.active);
  const pickedManager = managers.find((manager) => manager.managerUserId === picked) ?? null;
  const who = enquiry.enquirerName?.trim() || "this person";

  async function submit() {
    if (!pickedManager || assignState.isLoading) {
      return;
    }
    try {
      await assign({ enquiryId: enquiry.id, handlerUserId: pickedManager.managerUserId, version: enquiry.version }).unwrap();
      toast.show(`Assigned to ${pickedManager.managerFullName}.`, "success");
      onClose();
    } catch (error) {
      setRefusal(errorMessage(error));
    }
  }

  if (refusal) {
    return <AlertModal message={refusal} onClose={onClose} />;
  }

  return (
    <SheetShell onClose={onClose} title="Assign enquiry">
      <Text style={[type.modalDescription, { color: colors.muted }]}>Choose a manager to handle {who}'s enquiry.</Text>

      {managersQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
      ) : managers.length === 0 ? (
        <Text style={[type.description, { color: colors.muted }]}>
          No managers yet. Add one from the Property screen, or respond to it yourself.
        </Text>
      ) : (
        managers.map((manager) => {
          const open = openCounts[manager.managerUserId] ?? 0;
          return (
            <ManagerRow
              key={manager.managerUserId}
              name={manager.managerFullName}
              onPress={() => setPicked(manager.managerUserId)}
              openLine={open === 1 ? "1 open enquiry" : `${open} open enquiries`}
              selected={picked === manager.managerUserId}
            />
          );
        })
      )}

      <ActionButton
        disabled={!pickedManager || assignState.isLoading}
        label={assignState.isLoading ? "Assigning" : "Assign"}
        onPress={() => void submit()}
      />
    </SheetShell>
  );
}

function ManagerRow({
  name,
  onPress,
  openLine,
  selected,
}: {
  name: string;
  onPress: () => void;
  openLine: string;
  selected: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <CircleCheckbox checked={selected} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
          {name}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>{openLine}</Text>
      </View>
    </AnimatedPressable>
  );
}
