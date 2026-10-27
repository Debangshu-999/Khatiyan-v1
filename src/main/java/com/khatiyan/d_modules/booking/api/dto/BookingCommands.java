package com.khatiyan.d_modules.booking.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * The bodies of the booking actions. Each is small, so they sit together.
 *
 * <p>None names who is acting or which property a booking is at: the person is
 * the session and the property is the path. Numbers are boxed, because a
 * missing primitive is refused before the service can say what is wrong.
 */
public final class BookingCommands {

    private BookingCommands() {
    }

    /** Accepting the offer on the table. It names the offer, so one built on an older offer is refused. */
    public record AcceptOffer(@NotNull(message = "Refresh and try again.") Integer offerSequence) {
    }

    /** The tenant's own rent in answer to the property's offer. */
    public record CounterOffer(
            @NotNull(message = "Refresh and try again.") Integer offerSequence,
            @NotNull(message = "Enter the monthly rent you are offering.") @Positive Long rentPaise) {
    }

    /**
     * The property's answer with a rent of its own.
     *
     * @param rentPaise  required for an offer the tenant may counter. Left out
     *                   on a final offer, the room's rent as it stands is used
     * @param negotiable false for the property's last word. Left out, it is true
     */
    public record PropertyOffer(
            @NotNull(message = "Refresh and try again.") Integer offerSequence,
            @Positive Long rentPaise,
            Boolean negotiable) {

        public boolean mayBeCountered() {
            return negotiable == null || negotiable;
        }
    }

    /** The property declining a request or cancelling a booking. The tenant is shown the reason. */
    public record CancelByProperty(@Size(max = 500) String reason) {
    }

    /** A tenant's withdrawal/cancellation reason; older clients may still send no body. */
    public record CancelByTenant(@Size(max = 500) String reason) {
    }

    /**
     * "I've paid." {@code paidAtDesk} says it was handed over at the property,
     * which is the only way cash, a card or a cheque is recorded. Left out, it
     * was paid from where the tenant is, by UPI or a bank transfer. Either a
     * reference or a proof image is required unless this is cash paid at desk.
     */
    public record ClaimToken(
            @NotNull(message = "Choose how you paid.") ManualPaymentMethod method,
            @Size(max = 60) String reference,
            @Size(max = 2, message = "Attach at most 2 images.") List<String> proofImageUrls,
            Boolean paidAtDesk) {
    }

    /**
     * "Token received."
     *
     * @param method   may be left out when answering a claim, which names it
     * @param cashCode the tenant's code, where the property asks for one on cash
     */
    public record RecordToken(ManualPaymentMethod method, @Size(max = 60) String reference, String cashCode) {
    }

    public record TokenNotReceived(@Size(max = 500) String reason) {
    }

    public record PushMoveInDate(@NotNull(message = "Choose the new move-in date.") LocalDate moveInDate) {
    }

    public record OfferAnotherBed(
            @NotNull(message = "Choose the bed to offer.") UUID roomId,
            @NotNull(message = "Enter the monthly rent for that bed.") @Positive Long monthlyRentPaise) {
    }
}
