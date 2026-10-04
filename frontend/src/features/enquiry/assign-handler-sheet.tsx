import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { CircleCheckbox } from "@/features/enquiry/handler-mode-sheet";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import { useAssignEnquiryHandlerMutation, type EnquiryDetail } from "@/store/services/enquiry-api";
import { useListPropertyManagersQuery } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The Staff screen's no-managers artwork. */
const NO_PERSON_ILLUSTRATION = require("../../../assets/empty-states/No-Person_512x512.png");

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
  const { colors } = useTheme();
  const toast = useToast();
  const managersQuery = useListPropertyManagersQuery(propertyId);
  const [assign, assignState] = useAssignEnquiryHandlerMutation();
  const [picked, setPicked] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const managers = (managersQuery.data ?? []).filter((manager) => manager.active);
  const pickedManager = managers.find((manager) => manager.managerUserId === picked) ?? null;

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
      {managersQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
      ) : managers.length === 0 ? (
        // The Staff screen's own empty state (user, 2026-10-03).
        <EmptyState
          artwork={NO_PERSON_ILLUSTRATION}
          compact
          description="Assign a real app user as a manager for this property."
          title="No managers assigned"
        />
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

      {managers.length > 0 ? (
        <ActionButton
          disabled={!pickedManager || assignState.isLoading}
          label={assignState.isLoading ? "Assigning" : "Assign"}
          onPress={() => void submit()}
        />
      ) : null}
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
