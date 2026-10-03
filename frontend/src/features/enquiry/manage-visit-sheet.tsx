import { VisitSheet } from "@/features/enquiry/visit-sheet";
import { useGetEnquiryChatActionsQuery } from "@/store/services/enquiry-chat-api";

/**
 * The chat's visit sheet, opened for a booked visit from somewhere other than
 * the chat: the Enquiries card's "Manage visit".
 *
 * <p>Reads the same chat actions the chat does, so what it offers (move,
 * cancel, or why not) is exactly what the chat would offer the same person.
 */
export function ManageVisitSheet({
  enquiryId,
  onClose,
  personName,
  propertyId,
}: {
  enquiryId: string;
  onClose: () => void;
  /** The enquirer, named in the confirmations. */
  personName?: string | null;
  propertyId: string;
}) {
  const actions = useGetEnquiryChatActionsQuery(enquiryId, { refetchOnMountOrArgChange: true });

  return (
    <VisitSheet
      enquiryId={enquiryId}
      loadingVisit={actions.isLoading}
      notInterestedCloses={actions.data?.notInterestedCloses ?? false}
      onClose={onClose}
      personName={personName}
      propertyId={propertyId}
      viewer={actions.data?.viewer ?? "ACTING_MANAGEMENT"}
      visit={actions.data?.visit ?? null}
    />
  );
}
