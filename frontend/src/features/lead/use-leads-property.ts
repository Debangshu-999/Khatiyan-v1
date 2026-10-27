import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery } from "@/store/services/property-api";

/**
 * The property the Leads screens read: the one chosen on Home, or the only
 * one there is. Leads are open to everyone who manages the property, by the
 * owner's decision, so no grant is asked for here.
 */
export function useLeadsProperty() {
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const hydrated = useAppSelector((state) => state.auth.hydrated);
  const properties = useListMyPropertiesQuery(undefined, { skip: !hydrated });
  const list = properties.currentData ?? [];
  const property = selectedPropertyId
    ? list.find((item) => item.id === selectedPropertyId) ?? null
    : list.length === 1
      ? list[0]
      : null;
  return {
    property,
    loading: !hydrated || (!properties.currentData && !properties.isError),
    error: properties.isError ? properties.error : null,
    retry: () => void properties.refetch(),
  };
}
