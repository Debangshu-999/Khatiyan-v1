package com.khatiyan.d_modules.booking.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomType;

/**
 * Everything the booking form needs for one attended visit: whether a request
 * can be sent, the dates it may ask for, the terms the tenant should see
 * before asking, and the rooms.
 *
 * <p>{@code canBook} is worked out by the same person-level rules a request
 * is checked against when it is sent, so the form does not offer what would
 * be refused: an open request here already, a confirmed booking anywhere, the
 * cooldown, the visit's two requests, and a current stay that has not ended.
 *
 * <p>The terms shown here are the ones a request freezes when it is sent:
 * the token and whether it comes back, the deposit, and the latest date.
 *
 * <p>A bed listed here is not held. It is taken when the request is sent, if
 * it is still free.
 *
 * @param whyNot             what is in the way when {@code canBook} is false,
 *                           as one sentence
 * @param propertyArea       where the property is, for the card that names it
 * @param visitedOn          the day of the attended visit this form is for
 * @param requestsLeft       how many of the visit's two requests are unused,
 *                           counted as sending one would count them
 * @param existingRequestId  the tenant's open request or booking at this
 *                           property, if they have one
 * @param earliestMoveInDate the first day that may be asked for. Later than
 *                           three days out where the person's current stay
 *                           elsewhere ends after that
 * @param latestMoveInDate   the last day, 21 days out
 * @param currentStayEndsOn  the last day of the person's stay elsewhere, where
 *                           they have one that ends. It is why the first day
 *                           can be later than three days out, and the form
 *                           says so in words
 * @param tokenAmountPaise   what the property asks for. What is owed is fixed
 *                           when terms are agreed, and is never more than one
 *                           month of the agreed rent
 */
public record BookingFormOptionsResponse(
        boolean canBook,
        String whyNot,
        UUID enquiryId,
        UUID propertyId,
        String propertyName,
        String propertyArea,
        String propertyCity,
        LocalDate visitedOn,
        LocalDate windowEndsOn,
        int requestsLeft,
        UUID existingRequestId,
        LocalDate earliestMoveInDate,
        LocalDate latestMoveInDate,
        LocalDate currentStayEndsOn,
        long depositPaise,
        boolean tokenRequired,
        long tokenAmountPaise,
        boolean tokenRefundable,
        PgFor pgFor,
        List<Room> rooms) {

    /**
     * One of the property's rooms. Every active room is listed, so the form
     * can show one that cannot be booked as such and not leave it out.
     *
     * @param capacity          how many beds the room has. Never inferred from
     *                          its sharing type
     * @param amenities         the room's own amenities, by name
     * @param customAmenities   ones the owner typed in
     * @param freeBeds          beds free today, which take any date inside
     *                          the bounds
     * @param futureBeds        beds being vacated, each with the dates it can
     *                          be asked for. Who is leaving is never sent
     * @param available         whether any bed in it can be asked for
     * @param unavailableReason FULL or MAINTENANCE where none can, else null
     * @param imageUrls         photos of the room's type, in the owner's order.
     *                          Empty for a type with none, or a room cut from
     *                          no type
     */
    public record Room(UUID roomId, String roomNumber, String floor, RoomType roomType,
            RoomConditioning conditioning, int capacity, long listedRentPaise, List<String> amenities,
            List<String> customAmenities, int freeBeds, List<FutureBed> futureBeds, boolean available,
            String unavailableReason, List<String> imageUrls) {
    }

    /**
     * @param checkoutDate the day the bed is left. A date and nothing else:
     *                     who is leaving is never sent
     */
    public record FutureBed(UUID exitRequestId, LocalDate checkoutDate, LocalDate earliestMoveInDate,
            LocalDate latestMoveInDate) {
    }

    /** No request can be sent on this visit at all, so there is nothing to choose from. */
    public static BookingFormOptionsResponse closed(UUID enquiryId, UUID propertyId, LocalDate windowEndsOn,
            String whyNot) {
        return new BookingFormOptionsResponse(false, whyNot, enquiryId, propertyId, null, null, null, null,
                windowEndsOn, 0, null, null, null, null, 0, false, 0, false, null, List.of());
    }
}
