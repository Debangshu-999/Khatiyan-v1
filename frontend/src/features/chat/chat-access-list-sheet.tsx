import { useState } from "react";
import { Switch, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { EmptyState } from "@/components/empty-state";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { formatIndianPhone } from "@/features/owner/phone-display";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  useGetManagerPermissionsQuery,
  useLazyGetManagerPermissionsQuery,
  useListPropertyManagersQuery,
  useReplaceManagerPermissionsMutation,
  type PropertyManager,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_PERSON_ILLUSTRATION = require("../../../assets/workspace/No-Person_512x512.png");

/**
 * Who on the team may work the property's tenant conversations.
 *
 * <p>
 * <b>Chat is not a module on the permission screen and never will be.</b> An
 * owner deciding who reads their tenants' messages is thinking about this
 * screen, not about a matrix of resources — so the decision lives here, beside
 * the conversations it governs.
 *
 * <p>
 * It still writes the ordinary `CHATS` grant underneath, which is what the
 * server already checks. Two ways to store the same permission is how the two
 * end up disagreeing.
 *
 * <p>
 * Owner only. Granting is owner-only everywhere in the app, so a manager who has
 * chat access cannot hand it to anyone else.
 */
export function ChatAccessListSheet({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  // Refusals only — there is no field to correct on a list of switches.
  const errors = useFormErrors<never>();

  const managersQuery = useListPropertyManagersQuery(propertyId, { skip: !propertyId });
  const managers = (managersQuery.data ?? []).filter((manager) => manager.active);

  /**
   * Switches the owner has flipped, keyed by manager.
   *
   * <p>Absent means untouched, so the row shows what the server holds. A key
   * flipped twice lands back on its stored value and the save skips it rather
   * than writing a no-op.
   */
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  // It is the whole map that matters: the PUT replaces wholesale, so sending
  // CHATS alone would revoke every other grant the manager holds.
  const [fetchPermissions] = useLazyGetManagerPermissionsQuery();
  const [replacePermissions] = useReplaceManagerPermissionsMutation();

  /**
   * Busy for the WHOLE save, not just the write.
   *
   * <p>
   * The mutation state is not enough. A save begins by reading each manager
   * map, so between the tap and the first PUT there is a window where the
   * mutation has not started — the button sat there saying "Save changes",
   * enabled, and a second tap started a second run of the loop.
   */
  const [saving, setSaving] = useState(false);

  const changed = Object.keys(draft).length > 0;

  async function save() {
    if (!changed || saving) {
      return;
    }
    setSaving(true);

    try {
      for (const [managerUserId, wanted] of Object.entries(draft)) {
        // `true` is preferCacheValue, and it is not an optimisation to skip.
        // The rows have already fetched these maps and are subscribed to them,
        // but a lazy trigger REFETCHES by default — so every save went back to
        // the server for data already on screen, once per changed manager.
        const permissions = await fetchPermissions({ managerUserId, propertyId }, true).unwrap();
        const current = permissions.levels.CHATS === "MANAGE";
        if (current === wanted) {
          continue;
        }
        await replacePermissions({
          levels: { ...permissions.levels, CHATS: wanted ? "MANAGE" : "NONE" },
          managerUserId,
          propertyId,
        }).unwrap();
      }
      onClose();
      toast.success("Chat access updated.");
    } catch (caught) {
      errors.failFromServer(errorMessage(caught) || "Could not update chat access. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SheetShell onClose={onClose} title="Access list">
        {/* One line, said once. Which managers can read tenant messages is the
            question, and the sentence a reader needs is what it does NOT
            touch — their own conversations are not the owner's to hand out. */}
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
          Managers you add can read and reply in Tenants. Their own chats and enquiries are not affected.
        </Text>

        {managersQuery.isLoading ? <SkeletonList rows={3} /> : null}

        {!managersQuery.isLoading && managers.length === 0 ? (
          <EmptyState
            artwork={NO_PERSON_ILLUSTRATION}
            description="Add a manager to this property from Staff, then come back to give them the tenant conversations."
            title="No managers yet"
          />
        ) : null}

        {managers.map((manager) => (
          <ManagerAccessRow
            key={manager.managerUserId}
            manager={manager}
            onChange={(next) =>
              setDraft((current) => ({ ...current, [manager.managerUserId]: next }))
            }
            override={draft[manager.managerUserId]}
            propertyId={propertyId}
          />
        ))}

        {managers.length > 0 ? (
          <ActionButton
            disabled={!changed || saving}
            label={saving ? "Saving…" : "Save changes"}
            onPress={() => void save()}
          />
        ) : null}
      </SheetShell>

      {errors.serverError ? (
        <AlertModal message={errors.serverError} onClose={errors.dismissServerError} />
      ) : null}
    </>
  );
}

/**
 * One manager, with their current grant.
 *
 * <p>The row owns the query rather than the sheet, because the number of
 * managers is not known until the list lands and hooks cannot be called in a
 * loop. It also puts each row's loading state where the row is.
 */
function ManagerAccessRow({
  manager,
  onChange,
  override,
  propertyId,
}: {
  manager: PropertyManager;
  onChange: (next: boolean) => void;
  /** The switch's position while the owner has it flipped but unsaved. */
  override: boolean | undefined;
  propertyId: string;
}) {
  const { colors, fonts, type } = useTheme();
  const permissions = useGetManagerPermissionsQuery({ managerUserId: manager.managerUserId, propertyId });
  const granted = permissions.data?.levels.CHATS === "MANAGE";
  const on = override ?? granted;

  return (
    <View
      style={{
        alignItems: "center",
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: 999,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <Text style={{ color: colors.primaryDeep, fontFamily: fonts.sansBold, fontSize: 12 }}>
          {initials(manager.managerFullName)}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 14 }}>
          {manager.managerFullName}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
          {formatIndianPhone(manager.managerPhone)}
        </Text>
      </View>

      <Switch
        accessibilityLabel={`Tenant conversations for ${manager.managerFullName}`}
        // Not while the stored value is unknown: a switch that reads "off"
        // before the answer arrives invites the owner to turn on something that
        // was already on, and the save would then write a no-op over it.
        disabled={permissions.isLoading}
        onValueChange={onChange}
        thumbColor={colors.surface}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        value={on}
      />
    </View>
  );
}

/** Up to two letters, for the avatar bubble. */
function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}
