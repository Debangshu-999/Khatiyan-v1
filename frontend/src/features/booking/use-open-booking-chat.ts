import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useOpenMyBookingChatMutation, useOpenPropertyBookingChatMutation } from "@/store/services/booking-api";

/**
 * Opens the chat about a booking made in the app (user, 2026-10-27): asks the
 * server for its thread, creating it the first time, then goes to it. The
 * property's side opens it from a booking's card, the person who booked from
 * theirs. The header names the other side, and the booking's code under it.
 */
export function useOpenBookingChat(side: "property" | "booker") {
  const router = useGuardedRouter();
  const toast = useToast();
  const [openForProperty] = useOpenPropertyBookingChatMutation();
  const [openForBooker] = useOpenMyBookingChatMutation();

  return async function openBookingChat({
    propertyId,
    referenceCode,
    requestId,
    title,
  }: {
    propertyId?: string;
    referenceCode: string;
    requestId: string;
    title: string;
  }) {
    try {
      const { threadId } = side === "property" && propertyId
        ? await openForProperty({ propertyId, requestId }).unwrap()
        : await openForBooker({ requestId }).unwrap();
      router.push({ params: { subtitle: `Booking ${referenceCode}`, threadId, title }, pathname: "/chat/[threadId]" });
    } catch (error) {
      toast.error(errorMessage(error) || "Could not open this chat.");
    }
  };
}
