import { useCallback } from "react";

import { AlertModal } from "@/components/alert-modal";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import type { ManagerResource } from "@/store/services/property-api";

/**
 * Guards navigation into a screen the manager may not open.
 *
 * <p>
 * Used for screens that sit INSIDE a module the manager can see. The module
 * being visible has already told them the screen exists, so silently removing
 * the row would be confusing — a refusal that says why is better. Whole modules
 * they have no access to are removed instead, and never reach this.
 *
 * <p>
 * This is a courtesy, not the gate. The API refuses these calls regardless; all
 * this does is fail fast with an explanation instead of opening a screen that
 * loads nothing.
 *
 * <p>
 * Returns the refusal modal with the guard. The caller mounts {@code dialog}
 * once; without it the refusal is computed and never seen.
 */
export function useScreenAccessGuard(propertyId: string | null | undefined) {
  const { canView, isReady } = usePropertyPermissions(propertyId);
  const refusal = useFormErrors<never>();
  const { failFromServer } = refusal;

  const guard = useCallback(
    (resource: ManagerResource, label: string, open: () => void) => {
      // Before the server has answered, let it through rather than blocking on a
      // guess — the API is the real gate and a false refusal is worse than a
      // screen that briefly loads empty.
      if (!isReady || canView(resource)) {
        open();
        return;
      }

      failFromServer(`${label} is not available to you. Ask the property owner for access.`);
    },
    [canView, failFromServer, isReady],
  );

  return {
    dialog: refusal.serverError ? (
      <AlertModal message={refusal.serverError} onClose={refusal.dismissServerError} />
    ) : null,
    guard,
  };
}
