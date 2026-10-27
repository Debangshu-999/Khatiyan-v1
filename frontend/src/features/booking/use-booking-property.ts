import { useAppSelector } from "@/store/hooks";
import { useGetMyPropertyPermissionsQuery, useListMyPropertiesQuery } from "@/store/services/property-api";

/** Fail closed while a property-specific grant is unknown; no hopeful fallback. */
export function useBookingProperty() {
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const hydrated = useAppSelector((state) => state.auth.hydrated);
  const properties = useListMyPropertiesQuery(undefined, { skip: !hydrated });
  const property = propertyId ? properties.currentData?.find((item) => item.id === propertyId && item.active) : properties.currentData?.find((item) => item.active);
  const permissions = useGetMyPropertyPermissionsQuery(property?.id ?? "", { skip: !property, refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const bookingLevel = permissions.currentData?.levels.BOOKINGS;
  const canView = bookingLevel === "VIEW" || bookingLevel === "MANAGE";
  return {
    property,
    canView,
    owner: permissions.currentData?.owner === true,
    loading: !hydrated || (!properties.currentData && !properties.isError) || Boolean(property && !permissions.currentData && !permissions.isError),
    error: properties.isError ? properties.error : permissions.isError ? permissions.error : null,
    retry: () => { if (properties.isError) void properties.refetch(); else if (property) void permissions.refetch(); },
  };
}
