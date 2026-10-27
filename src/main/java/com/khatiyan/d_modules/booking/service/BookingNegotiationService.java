package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingOffer;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingRequestAction;
import com.khatiyan.d_modules.booking.model.BookingRequestOffer;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.repository.BookingRequestActionRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestOfferRepository;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.property.PropertyModule;

import lombok.extern.slf4j.Slf4j;

/**
 * Answering a booking request: accept, counter, the property's final offer,
 * and ending it (user's rules, 2026-10-09 and 10).
 *
 * <p><b>Accepting touches no bed.</b> The request has held its bed since it was
 * sent. Agreeing terms fixes the rent and starts the token clock, or confirms
 * at once where the property takes no token.
 *
 * <p><b>Whatever ends it frees the bed, in the same transaction.</b> A tenant
 * withdrawing, a property declining, either side cancelling once terms are
 * agreed, and a withdrawal because the person confirmed a booking elsewhere.
 * A token the property holds is settled in that transaction too.
 *
 * <p><b>An answer names the offer it answers.</b> If another offer has gone on
 * the table since the screen loaded, the answer is refused as stale and
 * nothing changes.
 *
 * <p>Locks, in the module's one order: the person the request belongs to, then
 * the request's row, then any other rows of theirs, then inventory. See
 * {@link BookingWrites}.
 */
@Slf4j
@Service
public class BookingNegotiationService {

    private final BookingRequestOfferRepository offers;
    private final BookingRequestActionRepository actions;
    private final BookingRequestService requestService;
    private final BookingWrites writes;
    private final BookingInventoryService inventory;
    private final PropertyModule properties;
    private final EnquiryModule enquiries;
    private final Clock clock;
    private final BookingAnnouncer announcer;

    public BookingNegotiationService(
            BookingRequestOfferRepository offers,
            BookingRequestActionRepository actions,
            BookingRequestService requestService,
            BookingWrites writes,
            BookingInventoryService inventory,
            PropertyModule properties,
            EnquiryModule enquiries,
            Clock clock,
            BookingAnnouncer announcer) {
        this.offers = offers;
        this.actions = actions;
        this.requestService = requestService;
        this.writes = writes;
        this.inventory = inventory;
        this.properties = properties;
        this.enquiries = enquiries;
        this.clock = clock;
        this.announcer = announcer;
    }

    // ---- The tenant ----------------------------------------------------------

    /** The tenant takes the property's offer. */
    @Transactional
    public BookingRequestResponse accept(UUID tenantUserId, UUID requestId, int offerSequence) {
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        agree(request, BookingParty.TENANT, tenantUserId, offerSequence, now());
        return requestService.forTenant(tenantUserId, requestId);
    }

    /** The tenant answers the property's offer with one of their own. Refused where that offer was final. */
    @Transactional
    public BookingRequestResponse counter(UUID tenantUserId, UUID requestId, int offerSequence, Long rentPaise) {
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        putOffer(request, BookingOffer.tenantProposal(rentPaise), tenantUserId, offerSequence, now());
        return requestService.forTenant(tenantUserId, requestId);
    }

    /**
     * The tenant withdraws a request, or cancels a booking, until the stay
     * starts. The bed goes back. Where the property holds a token, the owner's
     * refund rule decides it. Only walking away from a confirmed bed that was
     * held for nothing costs them more: that visit's window closes and the
     * property is closed to them for a while.
     */
    @Transactional
    public BookingRequestResponse cancel(UUID tenantUserId, UUID requestId) {
        return cancel(tenantUserId, requestId, null);
    }

    /** Stores the new client's reason without breaking bodyless cancellations from older clients. */
    @Transactional
    public BookingRequestResponse cancel(UUID tenantUserId, UUID requestId, String reason) {
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        Instant now = now();
        requireAllowed(BookingAction.CANCEL, request, BookingParty.TENANT, now);
        String why = reason == null ? null : reason.strip();
        if (why != null && (why.isEmpty() || why.length() > 500)) {
            throw new ValidationException("Give a cancellation reason within 500 characters.");
        }
        boolean penalised = BookingActionRules.tenantCancellationIsPenalised(
                request.getStatus(), writes.tokenStatusOf(request));
        end(request, BookingEndCause.TENANT_CANCELLED, BookingParty.TENANT, tenantUserId, why, false,
                penalised ? now.plus(BookingPolicy.TENANT_CANCELLATION_COOLDOWN) : null, now);
        if (penalised) {
            enquiries.closeBookingWindowForTenantCancellation(
                    request.getEnquiryId(), tenantUserId, request.getVisitId());
        }
        return requestService.forTenant(tenantUserId, requestId);
    }

    // ---- The property --------------------------------------------------------

    /** The owner or the request's handler takes the tenant's offer. */
    @Transactional
    public BookingRequestResponse acceptForProperty(UUID actorUserId, UUID propertyId, UUID requestId,
            int offerSequence) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        agree(request, BookingParty.MANAGEMENT, actorUserId, offerSequence, now());
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    /** A verified receipt is followed by the handler's explicit booking confirmation. */
    @Transactional
    public BookingRequestResponse confirmForProperty(UUID actorUserId, UUID propertyId, UUID requestId) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        requireAllowed(BookingAction.CONFIRM, request, BookingParty.MANAGEMENT, now);
        if (writes.tokenStatusOf(request) != BookingTokenStatus.RECEIVED) {
            throw new ValidationException("Receive the booking token before confirming this booking.");
        }
        VersionGuard.claim(request);
        request.confirmAwaited(now);
        writes.confirmed(request, now, actorUserId);
        announcer.changed(request);
        log.info("Booking explicitly confirmed requestId={} reference={} actorUserId={}",
                requestId, request.getReferenceCode(), actorUserId);
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    /**
     * The owner or the handler answers the tenant's offer with one of their own.
     *
     * @param rentPaise  the rent offered. Required for an offer the tenant may
     *                   counter. For a final offer it may be left out, and the
     *                   room's rent as it stands now is written down instead
     * @param negotiable false for the property's last word: the tenant may
     *                   take it or leave it, and cannot counter
     */
    @Transactional
    public BookingRequestResponse offer(UUID actorUserId, UUID propertyId, UUID requestId, int offerSequence,
            Long rentPaise, boolean negotiable) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        long roomRentNow = properties.findRoomForDisplay(propertyId, request.getRoomId())
                .map(room -> room.baseRentPaise())
                .orElse(request.getListedRentPaise());
        putOffer(request, BookingOffer.managementOffer(rentPaise, roomRentNow, negotiable), actorUserId,
                offerSequence, now());
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    /**
     * The owner or the handler declines a request, or cancels a booking, until
     * the stay starts. It needs a reason and never costs the tenant anything:
     * a token the property holds is owed back. Cancelling after terms were
     * agreed gives the visit its request back.
     */
    @Transactional
    public BookingRequestResponse cancelForProperty(UUID actorUserId, UUID propertyId, UUID requestId, String reason) {
        String why = BookingActionRules.requireManagementCancellationReason(reason);
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        requireAllowed(BookingAction.CANCEL, request, BookingParty.MANAGEMENT, now);
        boolean afterAgreeing = request.getStatus().isAgreed();
        end(request, BookingEndCause.MANAGEMENT_CANCELLED, BookingParty.MANAGEMENT, actorUserId, why,
                afterAgreeing, null, now);
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    // ---- What an answer does -------------------------------------------------

    private void agree(BookingRequest request, BookingParty party, UUID actorUserId, int offerSequence, Instant now) {
        requireCurrentOffer(request, offerSequence);
        BookingStatus next = BookingActionRules.nextStatus(BookingAction.ACCEPT, request.getStatus(),
                request.timing(), request.currentOffer(), request.tokenHold(), party, true, request.isConverted(), now,
                request.getListedRentPaise());
        VersionGuard.claim(request);
        request.agree(next, now, next == BookingStatus.AWAITING_TOKEN
                ? BookingPolicy.tokenDueAt(now, request.getMoveInDate()) : null);
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.AGREED, party, actorUserId,
                offerSequence, next, null, now));
        log.info("Booking terms agreed requestId={} reference={} by={} rentPaise={} next={}",
                request.getId(), request.getReferenceCode(), party, request.getAgreedRentPaise(), next);
        if (next == BookingStatus.AWAITING_TOKEN) {
            writes.startToken(request);
        } else {
            writes.confirmed(request, now);
        }
        announcer.changed(request);
    }

    private void putOffer(BookingRequest request, BookingOffer offer, UUID actorUserId, int offerSequence,
            Instant now) {
        requireCurrentOffer(request, offerSequence);
        BookingStatus next = BookingActionRules.nextStatus(BookingAction.COUNTER, request.getStatus(),
                request.timing(), request.currentOffer(), request.tokenHold(), offer.madeBy(), true, request.isConverted(), now,
                request.getListedRentPaise());
        VersionGuard.claim(request);
        request.putOffer(offer, next);
        offers.save(BookingRequestOffer.of(request.getId(), request.getCurrentOfferSequence(), offer,
                actorUserId, now));
        actions.save(BookingRequestAction.by(request.getId(),
                offer.negotiable() ? BookingActionType.COUNTERED : BookingActionType.FINAL_OFFER,
                offer.madeBy(), actorUserId, request.getCurrentOfferSequence(), next, null, now));
        log.info("Booking offer made requestId={} reference={} by={} sequence={} rentPaise={} negotiable={}",
                request.getId(), request.getReferenceCode(), offer.madeBy(), request.getCurrentOfferSequence(),
                offer.monthlyRentPaise(), offer.negotiable());
        announcer.changed(request);
    }

    private void end(BookingRequest request, BookingEndCause cause, BookingParty by, UUID byUserId, String reason,
            boolean giveSlotBack, Instant cooldownUntil, Instant now) {
        VersionGuard.claim(request);
        request.cancel(cause, by, byUserId, reason, now, giveSlotBack, cooldownUntil);
        inventory.release(request.getId(), request.getPropertyId());
        writes.settleToken(request, cause, now);
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.CANCELLED, by, byUserId, null,
                BookingStatus.CANCELLED, reason, now));
        log.info("Booking ended requestId={} reference={} cause={} by={} visitSlotGivenBack={} cooldown={}",
                request.getId(), request.getReferenceCode(), cause, by, giveSlotBack, cooldownUntil != null);
        announcer.changed(request);
    }

    // ---- Guards --------------------------------------------------------------

    /** An answer to an offer that is no longer the one on the table is stale: refuse and refresh. */
    private static void requireCurrentOffer(BookingRequest request, int offerSequence) {
        if (offerSequence != request.getCurrentOfferSequence()) {
            throw new StaleVersionException();
        }
    }

    private static void requireAllowed(BookingAction action, BookingRequest request, BookingParty party, Instant now) {
        // Once a stay has been created from it, the way out is the agreement's own decline or withdrawal.
        BookingActionRules.nextStatus(action, request.getStatus(), request.timing(), request.currentOffer(),
                request.tokenHold(), party, true, request.isConverted(), now);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }
}
