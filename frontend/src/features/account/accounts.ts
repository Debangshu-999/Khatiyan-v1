import { useGetProfileQuery } from "@/store/services/auth-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { useAppSelector } from "@/store/hooks";

// A single phone/user can act in several "accounts". Roles are derived:
// - owner: the user owns properties (role OWNER, or has owned properties)
// - manager: the user is an active manager on a property they do not own
// - tenant: the user has an active tenancy — or a PENDING_ACCEPTANCE one
//   (the auth activeTenant flag is only set at acceptance, but the tenant must
//   reach the tenancy tab to accept, so a pending tenancy also unlocks it)
export type AccountType = "tenant" | "manager" | "owner";

export type AccountAvailability = {
  accounts: AccountType[];
  ownedProperties: OwnerProperty[];
  managedProperties: OwnerProperty[];
  loading: boolean;
};

export function deriveAccounts(params: {
  role: string | undefined;
  activeTenant: boolean;
  userId: string | undefined;
  properties: OwnerProperty[];
}): { accounts: AccountType[]; ownedProperties: OwnerProperty[]; managedProperties: OwnerProperty[] } {
  const owned = params.userId ? params.properties.filter((property) => property.ownerId === params.userId) : [];
  const managed = params.userId ? params.properties.filter((property) => property.ownerId !== params.userId) : [];

  const accounts: AccountType[] = [];
  if (params.role === "OWNER" || owned.length > 0) {
    accounts.push("owner");
  }
  if (managed.length > 0) {
    accounts.push("manager");
  }
  if (params.activeTenant) {
    accounts.push("tenant");
  }
  return { accounts, ownedProperties: owned, managedProperties: managed };
}

/**
 * Resolves which accounts the signed-in phone can act in, plus the owned /
 * managed property split used to scope the owner workspace property picker.
 */
export function useAvailableAccounts(): AccountAvailability {
  const auth = useAppSelector((state) => state.auth);
  const profileQuery = useGetProfileQuery(undefined, { skip: !auth.accessToken });
  const user = profileQuery.data ?? auth.user;
  const propertiesQuery = useListMyPropertiesQuery(undefined, { skip: !auth.accessToken });
  // Pending-acceptance probe: only fires while the auth flag is off, so a
  // freshly onboarded tenant can open the tenancy tab to accept the agreement.
  const myTenancyQuery = useGetMyActiveTenancyQuery(undefined, {
    skip: !auth.accessToken || Boolean(user?.activeTenant),
  });

  const { accounts, managedProperties, ownedProperties } = deriveAccounts({
    activeTenant: Boolean(user?.activeTenant) || Boolean(myTenancyQuery.data),
    properties: propertiesQuery.data ?? [],
    role: user?.role,
    userId: user?.id,
  });

  return {
    accounts,
    // Settle once the first request finishes (success OR error). Using
    // `data === undefined` here would spin forever if the query errors.
    loading: Boolean(auth.accessToken) && (propertiesQuery.isLoading || propertiesQuery.isUninitialized),
    managedProperties,
    ownedProperties,
  };
}

export function accountLabel(account: AccountType): string {
  if (account === "owner") return "Owner";
  if (account === "manager") return "Manager";
  return "Tenant";
}

export function accountDescription(account: AccountType): string {
  if (account === "owner") return "Manage the properties you own.";
  if (account === "manager") return "Operate the properties assigned to you.";
  return "Your current stay, billing and concerns.";
}
