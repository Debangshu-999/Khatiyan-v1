package com.khatiyan.d_modules.booking.service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.expense.ExpenseModule;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingRequestAction;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingToken;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.repository.BookingRequestActionRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

import lombok.extern.slf4j.Slf4j;

/**
 * What every write to a booking shares, whichever service starts it: taking
 * its locks in the module's one order, confirming it, and settling its token
 * when it ends.
 *
 * <p>Locks: the person the booking belongs to, then the booking's row. A
 * token has no lock of its own, because nothing writes one without first
 * holding its booking's row.
 *
 * <p>Call these inside the caller's transaction. They open none.
 */
@Slf4j
@Component
class BookingWrites {

    private final BookingRequestRepository requests;
    private final BookingRequestActionRepository actions;
    private final BookingTokenRepository tokens;
    private final BookingRequestService requestService;
    private final BookingHandlerService handlers;
    private final BookingProspectLock prospectLock;
    private final BookingInventoryService inventory;
    private final PropertyModule properties;
    private final BillingModule billing;
    private final ExpenseModule finance;
    private final BookingAnnouncer announcer;

    BookingWrites(
            BookingRequestRepository requests,
            BookingRequestActionRepository actions,
            BookingTokenRepository tokens,
            BookingRequestService requestService,
            BookingHandlerService handlers,
            BookingProspectLock prospectLock,
            BookingInventoryService inventory,
            PropertyModule properties,
            BillingModule billing,
            ExpenseModule finance,
            BookingAnnouncer announcer) {
        this.requests = requests;
        this.actions = actions;
        this.tokens = tokens;
        this.requestService = requestService;
        this.handlers = handlers;
        this.prospectLock = prospectLock;
        this.inventory = inventory;
        this.properties = properties;
        this.billing = billing;
        this.finance = finance;
        this.announcer = announcer;
    }

    // ---- Locks ---------------------------------------------------------------

    /** The tenant's own booking, locked. */
    BookingRequest lockForTenant(UUID tenantUserId, UUID requestId) {
        prospectLock.acquire(tenantUserId);
        // Not found, rather than forbidden: nobody learns that another person's request exists.
        return requests.findByIdForUpdate(requestId)
                .filter(found -> tenantUserId.equals(found.getProspectUserId()))
                .orElseThrow(() -> new NotFoundException("Booking request", requestId));
    }

    /**
     * A booking at this property, locked, for someone answering it: the owner,
     * the manager who handles it, or, where the first to respond handles a
     * request and nobody does yet, a manager with the grant. That first answer
     * makes whoever gives it the handler (user, 2026-10-11).
     */
    BookingRequest lockForProperty(UUID actorUserId, UUID propertyId, UUID requestId) {
        BookingRequest request = lockAtProperty(actorUserId, propertyId, requestId);
        BookingHandlerService.Team team = handlers.teamOf(propertyId);
        if (!team.mayAct(actorUserId, request.getHandlerUserId())) {
            throw new ValidationException(team.effectiveHandler(request.getHandlerUserId()) != null
                    ? "Someone else is handling this booking request."
                    : "This booking request has not been assigned to you.");
        }
        handlers.onRespond(request, actorUserId, team);
        return request;
    }

    /** A booking at this property, locked, for the owner alone. An owner answering one nobody has takes it too. */
    BookingRequest lockForOwner(UUID actorUserId, UUID propertyId, UUID requestId, String refusal) {
        BookingRequest request = lockAtProperty(actorUserId, propertyId, requestId);
        BookingHandlerService.Team team = handlers.teamOf(propertyId);
        if (!actorUserId.equals(team.ownerUserId())) {
            throw new ForbiddenException(refusal);
        }
        handlers.onRespond(request, actorUserId, team);
        return request;
    }

    /**
     * A booking at this property, locked, for anyone who may onboard tenants
     * there. Converting a booking is onboarding, so it asks for that right
     * and not for handling the booking (user, 2026-10-10).
     */
    BookingRequest lockForOnboarding(UUID actorUserId, UUID propertyId, UUID requestId) {
        properties.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_CREATE);
        return lock(propertyId, requestId);
    }

    private BookingRequest lockAtProperty(UUID actorUserId, UUID propertyId, UUID requestId) {
        properties.ensureCanView(actorUserId, propertyId, ManagerResource.BOOKINGS);
        return lock(propertyId, requestId);
    }

    private BookingRequest lock(UUID propertyId, UUID requestId) {
        // The person first, read without loading the row, then the row. A row
        // loaded before the wait would be a stale copy after it.
        UUID prospect = requests.findProspectOf(requestId, propertyId)
                .orElseThrow(() -> new NotFoundException("Booking request", requestId));
        prospectLock.acquire(prospect);
        return requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new NotFoundException("Booking request", requestId));
    }

    // ---- The token -----------------------------------------------------------

    /** Where a booking's token stands. A booking whose terms are not agreed yet has none to speak of. */
    BookingTokenStatus tokenStatusOf(BookingRequest request) {
        if (!request.isTokenRequired()) {
            return BookingTokenStatus.NOT_REQUIRED;
        }
        return tokens.findByRequestId(request.getId()).map(BookingToken::getStatus).orElse(BookingTokenStatus.DUE);
    }

    /** Terms were just agreed at a property that takes a token. Its record starts here. */
    void startToken(BookingRequest request) {
        tokens.save(BookingToken.due(request.getId(), request.getPropertyId(), request.getTokenDuePaise()));
    }

    /**
     * A booking that held a bed has ended. Only money the property actually
     * holds is settled: the owner's refund rule where the tenant walked away,
     * owed back where the property did. A claim still waiting keeps waiting,
     * and is settled when the property answers it.
     */
    void settleToken(BookingRequest request, BookingEndCause cause, Instant now) {
        if (!request.isTokenRequired()) {
            return;
        }
        tokens.findByRequestId(request.getId()).ifPresent(token -> {
            BookingTokenStatus next = BookingTokenRules.onBookingEnd(
                    token.getStatus(), cause, request.isTokenRefundable());
            if (next != token.getStatus()) {
                token.settle(next, now);
                if (next == BookingTokenStatus.KEPT) {
                    tokenKept(request, token, now);
                }
                log.info("Booking token settled requestId={} reference={} cause={} token={}",
                        request.getId(), request.getReferenceCode(), cause, next);
            }
        });
    }

    /**
     * The stay has started. A token the property holds comes off its first
     * bill, as a line of its own, and is adjusted from here. Billing takes it
     * off only as far as the bill allows: never below its deposit or ₹1.
     */
    void adjustTokenAtMoveIn(BookingRequest request, UUID tenancyId, Instant now) {
        tokens.findByRequestId(request.getId())
                // Non refundable since onboarding (2026-10-28), or received before that rule.
                .filter(token -> token.getStatus() == BookingTokenStatus.KEPT
                        || token.getStatus() == BookingTokenStatus.RECEIVED)
                .ifPresent(token -> {
                    boolean incomeAlready = token.getStatus() == BookingTokenStatus.KEPT;
                    long takenOff = billing.applyBookingTokenToFirstBill(
                            tenancyId, token.getAmountPaise(), token.getReceiptCode());
                    token.settle(BookingTokenStatus.ADJUSTED, now);
                    // The bill is smaller by the token, so the rent it counts is too. The token's income
                    // puts it back: recorded at onboarding since 2026-10-28, else here.
                    if (!incomeAlready) {
                        recordTokenIncome(request, token, "Booking token adjusted against rent", now);
                    }
                    if (takenOff < token.getAmountPaise()) {
                        log.warn("Booking token only partly taken off the first bill requestId={} reference={}"
                                + " tokenPaise={} takenOffPaise={}", request.getId(), request.getReferenceCode(),
                                token.getAmountPaise(), takenOff);
                    }
                    log.info("Booking token adjusted at move-in requestId={} reference={} takenOffPaise={}",
                            request.getId(), request.getReferenceCode(), takenOff);
                });
    }

    /**
     * The booking was onboarded as a tenant: a token received is non
     * refundable from here, and the property's income from now (user,
     * 2026-10-28). It still comes off the first bill when the stay starts, and
     * is adjusted then, without counting the income a second time.
     */
    void tokenOnboarded(BookingRequest request, Instant now) {
        tokens.findByRequestId(request.getId())
                .filter(token -> token.getStatus() == BookingTokenStatus.RECEIVED)
                .ifPresent(token -> {
                    token.settle(BookingTokenStatus.KEPT, now);
                    recordTokenIncome(request, token, "Booking token non refundable", now);
                    log.info("Booking token non refundable at onboarding requestId={} reference={}",
                            request.getId(), request.getReferenceCode());
                });
    }

    /**
     * An onboarded stay fell through before it started. The token is not part
     * of that (user, 2026-10-28): it was the booking's until onboarding and is
     * the property's income since, whoever ended the agreement. Only a token
     * still RECEIVED, onboarded before that rule, is made non refundable now.
     */
    void settleOnboardedToken(BookingRequest request, Instant now) {
        tokenOnboarded(request, now);
    }

    /**
     * The owner keeps this token: the tenant walked away and the owner's rule
     * is that it does not come back. Money the owner keeps is income (user,
     * 2026-10-10).
     */
    void tokenKept(BookingRequest request, BookingToken token, Instant now) {
        recordTokenIncome(request, token, "Booking token kept", now);
    }

    private void recordTokenIncome(BookingRequest request, BookingToken token, String source, Instant now) {
        finance.recordIncome(request.getPropertyId(), source, request.getTenantName(), token.getAmountPaise(),
                java.time.LocalDate.ofInstant(now, BookingPolicy.ZONE),
                "Booking " + request.getReferenceCode()
                        + (token.getReceiptCode() == null ? "" : ", receipt " + token.getReceiptCode()));
    }

    // ---- Confirming ----------------------------------------------------------

    /**
     * A booking is confirmed. One confirmed booking per person across the app:
     * everything else they still have open, anywhere, is withdrawn and its bed
     * freed. Nobody is penalised for it.
     */
    void confirmed(BookingRequest request, Instant now) {
        confirmed(request, now, null);
    }

    void confirmed(BookingRequest request, Instant now, UUID actorUserId) {
        actions.save(actorUserId == null
                ? BookingRequestAction.bySystem(request.getId(), BookingActionType.CONFIRMED, BookingStatus.CONFIRMED, null, now)
                : BookingRequestAction.by(request.getId(), BookingActionType.CONFIRMED, BookingParty.MANAGEMENT,
                        actorUserId, null, BookingStatus.CONFIRMED, null, now));
        // An external booking's person has no app, so nothing else of theirs is open anywhere.
        List<BookingRequest> others = request.getProspectUserId() == null ? List.of()
                : requests.findStoredOpenOfProspectForUpdate(request.getProspectUserId())
                .stream()
                .filter(other -> !other.getId().equals(request.getId()))
                // Beds are freed property by property in one order, so two people
                // confirming at once cannot take the properties' locks crosswise.
                .sorted(Comparator.comparing(BookingRequest::getPropertyId).thenComparing(BookingRequest::getId))
                .toList();
        for (BookingRequest other : others) {
            if (requestService.expire(other, now)) {
                continue;
            }
            // Another property's token may have been received without final confirmation yet.
            other.cancel(BookingEndCause.BOOKED_ELSEWHERE, null, null, null, now, false, null);
            settleToken(other, BookingEndCause.BOOKED_ELSEWHERE, now);
            inventory.release(other.getId(), other.getPropertyId());
            actions.save(BookingRequestAction.bySystem(other.getId(), BookingActionType.WITHDRAWN,
                    BookingStatus.CANCELLED, null, now));
            log.info("Booking request withdrawn, the person confirmed elsewhere requestId={} reference={}",
                    other.getId(), other.getReferenceCode());
            announcer.changed(other);
        }
    }
}
