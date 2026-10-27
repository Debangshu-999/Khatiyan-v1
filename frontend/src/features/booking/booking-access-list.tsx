import { Text, View } from "react-native";
import { RotateCcw } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { BookingAccessSkeleton } from "@/components/skeletons/booking/settings";
import { Skeleton } from "@/components/skeletons/primitives";
import type { BookingAccessDraft } from "@/features/booking/booking-settings-form";
import { InitialsAvatar } from "@/features/enquiry/enquiry-tags";
import { CircleCheckbox } from "@/features/enquiry/handler-mode-sheet";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
import {
  useGetManagerPermissionsQuery,
  useListPropertyManagersQuery,
  type ManagerPermissions,
  type PropertyManager,
} from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

// The same mark the chat screen's access list shows for a property with no managers.
const NO_PERSON_ILLUSTRATION = require("../../../assets/empty-states/No-Person_512x512.png");

/**
 * The property's active managers, each with a tick: ticked, they can view and
 * handle bookings (user, 2026-10-10). It sits in its own card on the Booking
 * settings screen and is saved by that screen's Save, with everything else.
 *
 * <p>BOOKINGS is the ordinary grant, never a second access list. This list
 * only shows the ticks and says which were changed. The screen writes them.
 *
 * <p>The line saying what a tick does belongs to the list, not to the card
 * around it: with no managers there is nothing to tick, so the card shows an
 * empty state and no instruction (user, 2026-10-10).
 */
export function BookingAccessList({ propertyId, draft, disabled, onChange }: {
  propertyId: string;
  /** Ticks changed and not yet saved, by manager. */
  draft: BookingAccessDraft;
  disabled: boolean;
  onChange: (permissions: ManagerPermissions, enabled: boolean) => void;
}) {
  const { colors, type } = useTheme();
  const managersQuery = useListPropertyManagersQuery(propertyId, { refetchOnMountOrArgChange: true });
  const managers = (managersQuery.currentData ?? []).filter((manager) => manager.active);

  return (
    <View style={{ gap: spacing.sm }}>
      {!managersQuery.currentData && !managersQuery.isError ? <BookingAccessSkeleton /> : null}
      {managersQuery.isError ? (
        <>
          <NoticeBar title="Could not load managers" message={errorMessage(managersQuery.error)} tone="danger" />
          <View style={{ flexDirection: "row" }}>
            <ActionButton compact label="Try again" icon={RotateCcw} onPress={() => void managersQuery.refetch()} variant="secondary" />
          </View>
        </>
      ) : null}
      {managersQuery.currentData && managers.length === 0 ? (
        <EmptyState compact artwork={NO_PERSON_ILLUSTRATION} title="No managers yet" description="Add a manager to this property from Staff, then give them booking access here." />
      ) : null}
      {managers.length > 0 ? (
        <Text style={[type.description, { color: colors.muted }]}>Tick the managers who can view and handle bookings. You always have access.</Text>
      ) : null}
      {managers.map((manager) => (
        <ManagerAccessRow key={manager.managerUserId} manager={manager} propertyId={propertyId} disabled={disabled} override={draft[manager.managerUserId]?.enabled} onChange={onChange} />
      ))}
    </View>
  );
}

/**
 * One manager and their tick.
 *
 * <p>The row owns its own read: how many managers there are is not known until
 * the list lands, and hooks cannot be called in a loop. The tick is not offered
 * until the stored grant is known, or it would invite ticking what is already
 * ticked.
 */
function ManagerAccessRow({ manager, propertyId, disabled, override, onChange }: {
  manager: PropertyManager;
  propertyId: string;
  disabled: boolean;
  /** The tick while it is changed and unsaved. */
  override: boolean | undefined;
  onChange: (permissions: ManagerPermissions, enabled: boolean) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const permissionsQuery = useGetManagerPermissionsQuery({ propertyId, managerUserId: manager.managerUserId }, { refetchOnMountOrArgChange: true });
  const permissions = permissionsQuery.currentData;
  const failed = permissionsQuery.isError && !permissions;
  const ticked = override ?? permissions?.levels.BOOKINGS === "MANAGE";

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityLabel={`Booking access for ${manager.managerFullName}`}
      accessibilityState={{ checked: ticked, disabled: disabled || (!permissions && !failed) }}
      disabled={disabled || (!permissions && !failed)}
      onPress={() => {
        if (permissions) onChange(permissions, !ticked);
        else void permissionsQuery.refetch();
      }}
      style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderCurve: "continuous", borderRadius: radii.card, flexDirection: "row", gap: spacing.md, padding: spacing.md }}
    >
      <InitialsAvatar name={manager.managerFullName} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{manager.managerFullName}</FitText>
        <Text style={[type.description, { color: colors.muted }]}>{formatIndianPhone(manager.managerPhone)}</Text>
        {permissions?.levels.BOOKINGS === "VIEW" && override === undefined ? <Text style={[type.description, { color: colors.muted }]}>View only. Tick to let them handle bookings.</Text> : null}
        {failed ? <Text style={[type.caption, { color: colors.danger }]}>Could not load their access. Tap to try again.</Text> : null}
      </View>
      {failed ? null : permissions ? <CircleCheckbox checked={ticked} /> : <Skeleton height={22} width={22} radius={999} />}
    </AnimatedPressable>
  );
}
