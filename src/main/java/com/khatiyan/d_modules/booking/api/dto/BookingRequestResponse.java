package com.khatiyan.d_modules.booking.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingBedOffer;
import com.khatiyan.d_modules.booking.model.BookingClaimAnswer;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingMoveInAction;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingRequestAction;
import com.khatiyan.d_modules.booking.model.BookingRequestOffer;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingToken;
import com.khatiyan.d_modules.booking.model.BookingTokenAction;
import com.khatiyan.d_modules.booking.model.BookingTokenClaim;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.service.BookingPolicy;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.RoomAmenity;
import com.khatiyan.d_modules.property.model.RoomConditioning;

/**
 * One booking request in full, for the person who sent it or for the property.
 *
 * <p>{@code status} is the status at the moment of reading: a request whose
 * time ran out reads EXPIRED before the hourly sweep has written it.
 *
 * <p>{@code allowedActions} is worked out for whoever is reading. The screen
 * shows a button for each and decides nothing itself.
 *
 * @param dueAtMoveInPaise deposit plus the first month at the rent on the
 *                         table, less the token. What the tenant will still
 *                         owe on the day, as it stands now.
 * @param handlerUserId    who handles it today, or null while nobody does. A
 *                         handler who has since lost access is not shown.
 * @param tokenPaise       the token owed: fixed once terms are agreed, and
 *                         before that what it would be at the rent on the table.
 *                         Zero once the owner has waived it
 * @param tokenDueAt       when the token must have arrived, once terms are
 *                         agreed at a property that takes one
 * @param endCause         why a cancelled booking ended
 * @param cancelledBy      which side cancelled it, or null where the system did
 * @param token            the token's record, once terms are agreed at a
 *                         property that takes one. Null before that and where
 *                         none is taken
 * @param allowedTokenActions what the reader may do about the token, worked
 *                         out for them like {@code allowedActions}
 * @param tenancyId        the stay created from it when the tenant arrived,
 *                         or null until then
 * @param bedReady         whether the booked bed is free for this person now.
 *                         Null except on a confirmed booking whose move-in
 *                         day has come and that has not been converted
 * @param allowedMoveInActions what the reader may do about moving in
 * @param moveInDatePushed whether the tenant has used their one date push.
 *                         {@code originalMoveInDate} is the date first asked for
 * @param latestPushDate   the latest day the move-in date may be pushed to
 * @param bedOffer         another bed the property has offered and the tenant
 *                         has not answered, or null
 */
public record BookingRequestResponse(
        UUID id,
        String referenceCode,
        UUID propertyId,
        String propertyName,
        UUID roomId,
        String roomNumber,
        /** The booked room type's current photos, in owner order. Empty when none exist. */
        List<String> roomImageUrls,
        /** Current display metadata only; it never changes the frozen booking terms. */
        RoomConditioning roomConditioning,
        Integer roomCapacity,
        String roomFloor,
        Set<RoomAmenity> roomAmenities,
        Set<String> roomCustomAmenities,
        boolean futureBed,
        BookingStatus status,
        LocalDate bookingDate,
        LocalDate earliestMoveInDate,
        LocalDate latestMoveInDate,
        LocalDate originalMoveInDate,
        LocalDate moveInDate,
        Instant submittedAt,
        Instant expiresAt,
        Instant closedAt,
        Instant agreedAt,
        Long agreedRentPaise,
        Instant tokenDueAt,
        Instant confirmedAt,
        BookingEndCause endCause,
        BookingParty cancelledBy,
        String cancelReason,
        Integer agreementMonths,
        long listedRentPaise,
        long currentRentPaise,
        int currentOfferSequence,
        BookingParty currentOfferBy,
        boolean currentOfferNegotiable,
        long depositPaise,
        boolean tokenRequired,
        long tokenPaise,
        boolean tokenRefundable,
        long dueAtMoveInPaise,
        String tenantName,
        String tenantPhone,
        String tenantEmail,
        Gender tenantGender,
        LocalDate tenantDateOfBirth,
        UUID handlerUserId,
        String handlerName,
        Set<BookingAction> allowedActions,
        Token token,
        Set<BookingTokenAction> allowedTokenActions,
        UUID tenancyId,
        Instant convertedAt,
        Boolean bedReady,
        Set<BookingMoveInAction> allowedMoveInActions,
        boolean moveInDatePushed,
        LocalDate latestPushDate,
        BedOffer bedOffer,
        List<Offer> offers,
        List<HistoryItem> history,
        long version) {

    /**
     * Where the token stands. It names no person: which side did what is in
     * the history.
     *
     * @param claimWaiting   the tenant says they paid and the property has not
     *                       answered. The bed is not at risk from the clock
     *                       while this is true
     * @param refundDueSince since when it has been refundable, owed back. The
     *                       refund itself is not followed (2026-10-28)
     */
    public record Token(
            BookingTokenStatus status,
            long amountPaise,
            boolean refundableOnTenantCancel,
            Instant dueAt,
            boolean claimWaiting,
            String receiptCode,
            ManualPaymentMethod receivedMethod,
            String receivedReference,
            Instant receivedAt,
            Instant waivedAt,
            Instant refundDueSince,
            List<TokenClaim> claims) {
        static Token from(BookingRequest request, BookingToken token, List<BookingTokenClaim> claims) {
            return new Token(token.getStatus(), token.getAmountPaise(), request.isTokenRefundable(),
                    request.getTokenDueAt(), request.isTokenClaimWaiting(), token.getReceiptCode(),
                    token.getReceivedMethod(), token.getReceivedReference(), token.getReceivedAt(),
                    token.getWaivedAt(), token.getRefundDueSince(),
                    claims.stream().map(TokenClaim::from).toList());
        }
    }

    /** Another bed, offered in place of one that is still occupied. Taking it changes the room and the rent. */
    public record BedOffer(int sequence, UUID roomId, String roomNumber, long monthlyRentPaise, Instant offeredAt) {
        static BedOffer from(BookingBedOffer offer) {
            return new BedOffer(offer.getSequence(), offer.getRoomId(), offer.getRoomNumber(),
                    offer.getMonthlyRentPaise(), offer.getOfferedAt());
        }
    }

    /** One "I've paid", and the property's answer once it has given one. */
    public record TokenClaim(int sequence, ManualPaymentMethod method, boolean paidAtDesk, String reference,
            List<String> proofImageUrls, Instant claimedAt, BookingClaimAnswer answer, String answerReason,
            Instant answeredAt) {
        static TokenClaim from(BookingTokenClaim claim) {
            return new TokenClaim(claim.getSequence(), claim.getMethod(), claim.isPaidAtDesk(), claim.getReference(),
                    claim.proofUrls(),
                    claim.getClaimedAt(), claim.getAnswer(), claim.getAnswerReason(), claim.getAnsweredAt());
        }
    }

    public record Offer(int sequence, BookingParty madeBy, long monthlyRentPaise, boolean negotiable, Instant madeAt) {
        static Offer from(BookingRequestOffer offer) {
            return new Offer(offer.getSequence(), offer.getMadeBy(), offer.getMonthlyRentPaise(),
                    offer.isNegotiable(), offer.getMadeAt());
        }
    }

    /** Which side did it, never who: names are not copied into the history. */
    public record HistoryItem(BookingActionType type, BookingParty party, Integer offerSequence,
            BookingStatus statusAfter, String note, Instant occurredAt) {
        static HistoryItem from(BookingRequestAction action) {
            return new HistoryItem(action.getType(), action.getParty(), action.getOfferSequence(),
                    action.getStatusAfter(), action.getNote(), action.getOccurredAt());
        }
    }

    public static BookingRequestResponse of(BookingRequest request, Instant now, Set<BookingAction> allowedActions,
            List<BookingRequestOffer> offers, List<BookingRequestAction> history, UUID handlerUserId,
            String handlerName, BookingToken token, List<BookingTokenClaim> tokenClaims,
            Set<BookingTokenAction> allowedTokenActions, Boolean bedReady,
            Set<BookingMoveInAction> allowedMoveInActions, BookingBedOffer bedOffer, List<String> roomImageUrls,
            RoomResponse room) {
        // A waived token is no longer owed, so nothing comes off what is due at move-in.
        boolean waived = token != null && token.getStatus() == BookingTokenStatus.NOT_REQUIRED;
        long tokenPaise = waived ? 0 : request.getTokenDuePaise() != null
                ? request.getTokenDuePaise() : request.tokenTerms().dueFor(request.getCurrentRentPaise());
        return new BookingRequestResponse(
                request.getId(), request.getReferenceCode(), request.getPropertyId(), request.getPropertyName(),
                request.getRoomId(), request.getRoomNumber(), List.copyOf(roomImageUrls),
                room == null ? null : room.conditioning(), room == null ? null : room.capacity(), room == null ? null : room.floor(),
                room == null ? Set.of() : Set.copyOf(room.amenities()),
                room == null ? Set.of() : Set.copyOf(room.customAmenities()),
                request.isFutureBed(), request.statusAt(now),
                request.getBookingDate(), request.getEarliestMoveInDate(), request.getLatestMoveInDate(),
                request.getOriginalMoveInDate(), request.getMoveInDate(), request.getSubmittedAt(),
                request.getExpiresAt(), request.getClosedAt(), request.getAgreedAt(), request.getAgreedRentPaise(),
                request.getTokenDueAt(), request.getConfirmedAt(), request.getEndCause(), request.getCancelledBy(),
                request.getCancelReason(), request.getAgreementMonths(),
                request.getListedRentPaise(), request.getCurrentRentPaise(), request.getCurrentOfferSequence(),
                request.getCurrentOfferBy(), request.isCurrentOfferNegotiable(), request.getDepositPaise(),
                request.isTokenRequired(), tokenPaise, request.isTokenRefundable(),
                request.getDepositPaise() + request.getCurrentRentPaise() - tokenPaise,
                request.getTenantName(), request.getTenantPhone(), request.getTenantEmail(),
                request.getTenantGender(), request.getTenantDateOfBirth(), handlerUserId, handlerName,
                allowedActions,
                token == null ? null : Token.from(request, token, tokenClaims),
                allowedTokenActions,
                request.getTenancyId(), request.getConvertedAt(), bedReady, allowedMoveInActions,
                request.isDatePushed(), BookingPolicy.latestPushDate(request.getOriginalMoveInDate()),
                bedOffer == null ? null : BedOffer.from(bedOffer),
                offers.stream().map(Offer::from).toList(),
                history.stream().map(HistoryItem::from).toList(),
                request.getVersion());
    }
}
