import { useMemo } from "react";

import {
  useGetMyPropertyPermissionsQuery,
  type ManagerAccessLevel,
  type ManagerResource,
} from "@/store/services/property-api";

/**
 * What the signed-in user may see and do on a property.
 *
 * <p>
 * Owners always come back as MANAGE on everything, so callers never need to ask
 * "am I the owner" — they ask about the resource.
 */
export function usePropertyPermissions(propertyId: string | null | undefined) {
  const query = useGetMyPropertyPermissionsQuery(propertyId ?? "", { skip: !propertyId });

  return useMemo(() => {
    const levels = query.data?.levels;

    function levelOf(resource: ManagerResource): ManagerAccessLevel {
      // While loading, and for any resource the server did not mention, assume
      // MANAGE. Assuming NONE would blank the workspace on every cold load and
      // flash sections back in — and the API is the real gate regardless, so a
      // hopeful client cannot grant anything the server will not allow.
      return levels?.[resource] ?? "MANAGE";
    }

    return {
      canManage: (resource: ManagerResource) => levelOf(resource) === "MANAGE",
      canView: (resource: ManagerResource) => levelOf(resource) !== "NONE",
      isLoading: query.isLoading,
      // True once the server has actually answered — use it before hiding
      // anything destructive-looking, so a slow network never reads as a revoke.
      isReady: Boolean(levels),
      levelOf,
      owner: query.data?.owner ?? false,
    };
  }, [query.data, query.isLoading]);
}
