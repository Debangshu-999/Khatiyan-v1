import { useState } from "react";
import { Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Plus, Trash2, UserRoundPlus } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import {
  useAddPropertyContactManagerMutation,
  useListPropertyContactsQuery,
  useRemovePropertyContactManagerMutation,
  type PropertyContact,
} from "@/store/services/discovery-api";
import { useListPropertyManagersQuery } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Who the listing tells a prospect to call.
 *
 * <p>The owner is always here and has no remove control — every listing needs
 * one reachable person, and the one state this must never allow is a property
 * nobody can contact. Managers are chosen from the property's own managers, so
 * there is no free-text phone field to keep in step with anything.
 *
 * <p>Each change is written the moment it is made, like the gallery above it:
 * there is no submit to batch it into.
 */
export function PropertyContactsSection({ canManage, propertyId }: { canManage: boolean; propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const opErrors = useFormErrors<never>();
  const contactsQuery = useListPropertyContactsQuery(propertyId, { skip: !propertyId });
  const [addContact, addState] = useAddPropertyContactManagerMutation();
  const [removeContact, removeState] = useRemovePropertyContactManagerMutation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PropertyContact | null>(null);

  const contacts = contactsQuery.data ?? [];
  const busy = addState.isLoading || removeState.isLoading;

  async function add(managerUserId: string, name: string | null) {
    setPickerOpen(false);
    try {
      await addContact({ managerUserId, propertyId }).unwrap();
      toast.success(`${name?.trim() || "Manager"} added to contacts.`);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error) || "Could not add the contact. Try again.");
    }
  }

  async function remove(contact: PropertyContact) {
    setPendingRemoval(null);
    try {
      await removeContact({ managerUserId: contact.userId, propertyId }).unwrap();
      toast.success(`${contact.name?.trim() || "Manager"} removed from contacts.`);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error) || "Could not remove the contact.");
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      {contactsQuery.isLoading ? <SkeletonList rows={2} /> : null}

      {!contactsQuery.isLoading ? (
        <View style={{ borderColor: colors.border, borderRadius: 14, borderWidth: 1, overflow: "hidden" }}>
          {contacts.map((contact, index) => (
            <ContactRow
              contact={contact}
              disabled={busy || !canManage}
              key={contact.userId}
              onRemove={() => setPendingRemoval(contact)}
              showDivider={index < contacts.length - 1}
            />
          ))}
        </View>
      ) : null}

      {canManage ? (
        <View style={{ flexDirection: "row" }}>
          <ActionButton
            disabled={busy}
            icon={UserRoundPlus}
            label="Add manager contact"
            onPress={() => setPickerOpen(true)}
            variant="secondary"
          />
        </View>
      ) : null}

      <Text style={[type.caption, { color: colors.muted }]}>
        The owner is always listed and cannot be removed. Managers you add here appear on the public listing.
      </Text>

      {pickerOpen ? (
        <ManagerPickerSheet
          alreadyListed={contacts.map((contact) => contact.userId)}
          onClose={() => setPickerOpen(false)}
          onPick={(manager) => void add(manager.managerUserId, manager.managerFullName)}
          propertyId={propertyId}
        />
      ) : null}

      {pendingRemoval ? (
        <ConfirmDialog
          confirmLabel="Remove"
          destructive
          message={`Remove ${pendingRemoval.name?.trim() || "this manager"} from listing contacts?`}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => void remove(pendingRemoval)}
          title="Remove this contact?"
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </View>
  );
}

function ContactRow({
  contact,
  disabled,
  onRemove,
  showDivider,
}: {
  contact: PropertyContact;
  disabled: boolean;
  onRemove: () => void;
  showDivider: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        borderBottomColor: colors.border,
        borderBottomWidth: showDivider ? 1 : 0,
        flexDirection: "row",
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.ink,
          borderRadius: 14,
          borderWidth: 1,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <MaterialCommunityIcons
          color={colors.ink}
          name={contact.owner ? "account-tie-outline" : "account-outline"}
          size={20}
        />
      </View>

      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
          {contact.name?.trim() || "Unnamed"}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
          {contact.phone || "No phone on record"}
        </Text>
      </View>

      {/* The owner has no remove control at all rather than a disabled one: a
          greyed bin invites the question "why not", and the answer is that this
          is not a choice anyone gets to make. */}
      {contact.owner ? (
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          Owner
        </Text>
      ) : (
        <AnimatedPressable
          accessibilityLabel={`Remove ${contact.name?.trim() || "manager"} from contacts`}
          accessibilityRole="button"
          disabled={disabled}
          hitSlop={8}
          onPress={onRemove}
          style={{
            alignItems: "center",
            height: 36,
            justifyContent: "center",
            opacity: disabled ? 0.5 : 1,
            width: 36,
          }}
        >
          <Trash2 color={colors.danger} size={18} strokeWidth={2.2} />
        </AnimatedPressable>
      )}
    </View>
  );
}

/**
 * The property's managers, minus the ones already listed.
 *
 * <p>Filtered rather than shown as disabled rows: a picker that offers a choice
 * and then refuses it is a worse explanation than not offering it, and the empty
 * state below says the same thing in words when nothing is left.
 */
function ManagerPickerSheet({
  alreadyListed,
  onClose,
  onPick,
  propertyId,
}: {
  alreadyListed: string[];
  onClose: () => void;
  onPick: (manager: { managerFullName: string | null; managerUserId: string }) => void;
  propertyId: string;
}) {
  const { colors, fonts, type } = useTheme();
  const managersQuery = useListPropertyManagersQuery(propertyId, { skip: !propertyId });

  const available = (managersQuery.data ?? []).filter(
    (manager) => manager.active && !alreadyListed.includes(manager.managerUserId),
  );

  return (
    <SheetShell onClose={onClose} title="Add manager contact">
      {managersQuery.isLoading ? <SkeletonList rows={3} /> : null}

      {!managersQuery.isLoading && available.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No managers to add"
          description="Every manager on this property is already listed, or the property has none yet."
        />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {available.map((manager) => (
          <AnimatedPressable
            accessibilityRole="button"
            key={manager.managerUserId}
            onPress={() => onPick(manager)}
            style={{
              alignItems: "center",
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              flexDirection: "row",
              gap: spacing.md,
              padding: spacing.md,
            }}
          >
            <View
              style={{
                alignItems: "center",
                borderColor: colors.ink,
                borderRadius: 14,
                borderWidth: 1,
                height: 40,
                justifyContent: "center",
                width: 40,
              }}
            >
              <MaterialCommunityIcons color={colors.ink} name="account-outline" size={20} />
            </View>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                {manager.managerFullName?.trim() || "Unnamed manager"}
              </Text>
              <Text style={[type.caption, { color: colors.muted }]}>
                {manager.managerPhone || "No phone on record"}
              </Text>
            </View>
            <Plus color={colors.primary} size={18} strokeWidth={2.4} />
          </AnimatedPressable>
        ))}
      </View>
    </SheetShell>
  );
}
