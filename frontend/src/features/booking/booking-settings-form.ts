import type { BookingSettings, SaveBookingSettingsPayload } from "@/store/services/booking-api";
import type { ManagerPermissions } from "@/store/services/property-api";

export type BookingSettingsDraft = {
  tokenRequired: boolean;
  tokenAmount: string;
  tokenRefundable: boolean | null;
  showFutureVacancies: boolean;
  assignmentMode: BookingSettings["assignmentMode"];
  includeOwnerInTurns: boolean;
};

export function bookingSettingsDraft(settings: BookingSettings): BookingSettingsDraft {
  return {
    tokenRequired: settings.tokenRequired,
    tokenAmount: settings.tokenAmountPaise == null ? "" : String(settings.tokenAmountPaise / 100),
    tokenRefundable: settings.tokenRefundable,
    showFutureVacancies: settings.showFutureVacancies,
    assignmentMode: settings.assignmentMode,
    includeOwnerInTurns: settings.includeOwnerInTurns,
  };
}

/** Rupees as typed, to whole paise. No floating point, and nothing rounded away. */
function paiseOf(value: string) {
  const money = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  return money ? Number(money[1]) * 100 + Number((money[2] ?? "").padEnd(2, "0")) : NaN;
}

/**
 * Validate presentation fields. Booking eligibility and dates remain server-owned.
 *
 * <p>How far ahead a tenant may book is not here (user, 2026-10-10). It is
 * fixed, so the form has no field for it and sends nothing about it. Nor
 * is a charge for bookings further ahead: the 28 days a booking can reach is
 * enough for v1 (user, 2026-10-18).
 */
export function validateBookingSettings(draft: BookingSettingsDraft) {
  const errors: Partial<Record<"tokenAmount" | "tokenRefundable", string>> = {};
  // Parse as integer paise: no floating-point rounding or silently truncated money.
  const tokenAmountPaise = paiseOf(draft.tokenAmount);
  if (draft.tokenRequired && (!Number.isSafeInteger(tokenAmountPaise) || tokenAmountPaise <= 0)) {
    errors.tokenAmount = "Enter an amount greater than zero, with up to two decimal places.";
  }
  if (draft.tokenRequired && draft.tokenRefundable == null) {
    errors.tokenRefundable = "Choose whether the token is refundable when the tenant cancels.";
  }
  const body: SaveBookingSettingsPayload = {
    tokenRequired: draft.tokenRequired,
    tokenAmountPaise: draft.tokenRequired ? tokenAmountPaise : null,
    tokenRefundable: draft.tokenRequired ? draft.tokenRefundable : null,
    showFutureVacancies: draft.showFutureVacancies,
    assignmentMode: draft.assignmentMode,
    // The owner always takes a turn (user, 2026-10-11). There is no switch for it, so nothing stored can say otherwise.
    includeOwnerInTurns: true,
  };
  return { errors, body, valid: Object.keys(errors).length === 0 };
}

/** A manager's access as the owner has ticked it and not yet saved, with the grants they were looking at. */
export type BookingAccessChange = { permissions: ManagerPermissions; enabled: boolean };
export type BookingAccessDraft = Record<string, BookingAccessChange>;

/**
 * The unsaved ticks after one more. Ticking a manager back to what the server
 * holds drops them from the draft, so Save has nothing to write for them.
 *
 * <p>The grants first looked at are kept for as long as the tick is unsaved. A
 * refetch in the background must not let an old choice be written over newer
 * grants.
 */
export function bookingAccessDraftAfter(current: BookingAccessDraft, permissions: ManagerPermissions, enabled: boolean): BookingAccessDraft {
  const next = { ...current };
  const original = current[permissions.managerUserId]?.permissions ?? permissions;
  if (original.levels.BOOKINGS === (enabled ? "MANAGE" : "NONE")) delete next[permissions.managerUserId];
  else next[permissions.managerUserId] = { permissions: original, enabled };
  return next;
}

/** Full-map replacement, using the version the owner actually saw. */
export function bookingAccessReplacement(permissions: ManagerPermissions, enabled: boolean) {
  return {
    propertyId: permissions.propertyId,
    managerUserId: permissions.managerUserId,
    version: permissions.version,
    levels: { ...permissions.levels, BOOKINGS: enabled ? "MANAGE" as const : "NONE" as const },
  };
}
