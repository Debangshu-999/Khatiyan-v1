package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.money.Money;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.PaymentMethodsResponse;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.api.dto.BookingCashCodeResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingTokenLedgerResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingTokenPayDetailsResponse;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingClaimAnswer;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingRequestAction;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingToken;
import com.khatiyan.d_modules.booking.model.BookingTokenAction;
import com.khatiyan.d_modules.booking.model.BookingTokenCashCode;
import com.khatiyan.d_modules.booking.model.BookingTokenClaim;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.repository.BookingRequestActionRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenCashCodeRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenClaimRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenRepository;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

import lombok.extern.slf4j.Slf4j;

/**
 * The booking token (user's rules, 2026-10-09). <b>The app records it and
 * never collects it.</b> The tenant pays the property directly, by UPI, bank
 * or cash. This service writes down what each side says happened: the
 * tenant's "I've paid", the property's "Received" or "Not received", and a
 * refund sent and confirmed. No gateway, no payment intent, no money.
 *
 * <p><b>Receiving the token is separate from confirming the booking.</b>
 * The owner or handler explicitly confirms afterwards. An owner waiver still confirms directly.
 *
 * <p><b>A claim the property has not answered stops the token clock</b>, so a
 * slow answer never costs the tenant the bed. A refused claim gives the time
 * back. A claim is answered even after the booking has ended, and money
 * received then settles at once by how the booking ended.
 *
 * <p>Which step is allowed is {@link BookingTokenRules}' answer, the same one
 * the booking's screen is shown. Who is acting is established here: the
 * tenant by their own booking, the property by the owner or the booking's
 * handler, and the owner alone for a waiver.
 *
 * <p>Locks as every booking write: the person, then the booking's row. See
 * {@link BookingWrites}.
 */
@Slf4j
@Service
public class BookingTokenService {

    /** How long a sent cash code can be entered. The OTP store expires the code itself at the same point. */
    static final Duration CASH_CODE_LIFETIME = Duration.ofMinutes(10);

    private static final int MAX_REFERENCE_LENGTH = 60;
    private static final int MAX_PROOF_URL_LENGTH = 500;
    private static final int MAX_REASON_LENGTH = 500;

    private final BookingRequestRepository requests;
    private final BookingTokenRepository tokens;
    private final BookingTokenClaimRepository claims;
    private final BookingTokenCashCodeRepository cashCodes;
    private final BookingRequestActionRepository actions;
    private final BookingRequestService requestService;
    private final BookingWrites writes;
    private final BillingModule billing;
    private final AuthModule auth;
    private final PropertyModule properties;
    private final ReferenceCodeGenerator referenceCodes;
    private final Clock clock;
    private final BookingAnnouncer announcer;
    private final BookingHandlerService handlers;

    public BookingTokenService(
            BookingRequestRepository requests,
            BookingTokenRepository tokens,
            BookingTokenClaimRepository claims,
            BookingTokenCashCodeRepository cashCodes,
            BookingRequestActionRepository actions,
            BookingRequestService requestService,
            BookingWrites writes,
            BillingModule billing,
            AuthModule auth,
            PropertyModule properties,
            ReferenceCodeGenerator referenceCodes,
            Clock clock,
            BookingAnnouncer announcer,
            BookingHandlerService handlers) {
        this.requests = requests;
        this.tokens = tokens;
        this.claims = claims;
        this.cashCodes = cashCodes;
        this.actions = actions;
        this.requestService = requestService;
        this.writes = writes;
        this.billing = billing;
        this.auth = auth;
        this.properties = properties;
        this.referenceCodes = referenceCodes;
        this.clock = clock;
        this.announcer = announcer;
        this.handlers = handlers;
    }

    /**
     * Every state a token that arrived can be in. The ledger is of money the
     * property has had in hand, so a token still owed or only claimed is in
     * none of its lists.
     */
    private static final java.util.Set<BookingTokenStatus> RECEIVED_STATUSES = java.util.Set.of(
            BookingTokenStatus.RECEIVED, BookingTokenStatus.DECISION_PENDING, BookingTokenStatus.ADJUSTED,
            BookingTokenStatus.KEPT, BookingTokenStatus.REFUND_DUE);

    // ---- The tenant ----------------------------------------------------------

    /**
     * Where and how much to pay, for a tenant whose token is owed. The
     * property's payment details are shown only once terms are agreed, and
     * only while there is still something to pay.
     */
    @Transactional(readOnly = true)
    public BookingTokenPayDetailsResponse payDetails(UUID tenantUserId, UUID requestId) {
        BookingRequest request = requests.findById(requestId)
                .filter(found -> tenantUserId.equals(found.getProspectUserId()))
                .orElseThrow(() -> new NotFoundException("Booking request", requestId));
        BookingToken token = tokens.findByRequestId(requestId).orElse(null);
        if (token == null || !token.getStatus().isOwed() || request.statusAt(now()) != BookingStatus.AWAITING_TOKEN) {
            throw new ValidationException("There is no token to pay on this booking right now.");
        }
        // Paid to the bill details, or to the token's own where the owner gave some in Payment setup.
        return new BookingTokenPayDetailsResponse(request.getReferenceCode(), token.getAmountPaise(),
                request.isTokenRefundable(), request.getTokenDueAt(),
                billing.bookingTokenPayeeOf(request.getPropertyId()),
                billing.bookingTokenAcceptedMethodsOf(request.getPropertyId()),
                DESK_METHODS);
    }

    /**
     * How a token is handed over at the desk, in the order the pay sheet
     * lists them. Never a bank transfer.
     *
     * <p>All four at every property (user, 2026-10-11, of a property that had
     * not ticked them: "Card and cheque are missing from this"). Payment setup
     * says what a tenant is offered for a bill, not what a desk will take.
     * Whoever answers the claim says whether it arrived.
     */
    private static final List<ManualPaymentMethod> DESK_METHODS = List.of(
            ManualPaymentMethod.CASH, ManualPaymentMethod.CARD, ManualPaymentMethod.UPI, ManualPaymentMethod.CHEQUE);

    /**
     * "I've paid." The bed stops being at risk from the clock until the
     * property answers. Either a reference or a photo is required, except for
     * cash handed over at the desk, whose receipt is optional.
     *
     * <p>Paid from where the tenant is, it is by UPI or a bank transfer, to
     * the details the owner set for tokens. Paid at the desk (user,
     * 2026-10-11: "add a paid at desk option ... cash card UPI cheque"), it
     * is in cash, by card, by UPI or by cheque, at any property.
     * Cash, a card and a cheque are recorded only that way: they change hands
     * at the property.
     */
    @Transactional
    public BookingRequestResponse claimPaid(UUID tenantUserId, UUID requestId, ManualPaymentMethod method,
            String reference, List<String> proofImageUrls) {
        return claimPaid(tenantUserId, requestId, method, false, reference, proofImageUrls);
    }

    @Transactional
    public BookingRequestResponse claimPaid(UUID tenantUserId, UUID requestId, ManualPaymentMethod method,
            boolean paidAtDesk, String reference, List<String> proofImageUrls) {
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        Instant now = now();
        BookingToken token = tokenOf(request);
        next(BookingTokenAction.CLAIM_PAID, request, token, BookingParty.TENANT, now);
        if (method == null) {
            throw new ValidationException("Choose how you paid.");
        }
        if (paidAtDesk) {
            if (!DESK_METHODS.contains(method)) {
                throw new ValidationException("At the desk a token is paid in cash, by card, by UPI or by cheque.");
            }
        } else {
            if (method == ManualPaymentMethod.CASH || method == ManualPaymentMethod.CARD
                    || method == ManualPaymentMethod.CHEQUE) {
                throw new ValidationException(
                        "Cash, a card and a cheque are paid at the property's desk. Record it as paid at desk.");
            }
            if (!billing.bookingTokenMethodsOf(request.getPropertyId()).contains(method)) {
                throw new ValidationException("This property does not take that way of paying.");
            }
        }
        String paidWith = reference(reference);
        List<String> proof = proof(proofImageUrls);
        if (!(paidAtDesk && method == ManualPaymentMethod.CASH) && paidWith == null && proof.isEmpty()) {
            throw new ValidationException("Enter a transaction reference or upload a payment photo.");
        }

        VersionGuard.claim(request);
        int sequence = claims.findByTokenIdOrderBySequenceAsc(token.getId()).size() + 1;
        token.claim();
        request.tokenClaimed();
        claims.save(BookingTokenClaim.raise(
                token.getId(), sequence, method, paidAtDesk, paidWith, proof, tenantUserId, now));
        record(request, BookingActionType.TOKEN_CLAIMED, BookingParty.TENANT, tenantUserId, now);
        log.info("Booking token claimed requestId={} reference={} method={} atDesk={} hasReference={} proofCount={}",
                request.getId(), request.getReferenceCode(), method, paidAtDesk, paidWith != null, proof.size());
        return requestService.forTenant(tenantUserId, requestId);
    }

    // ---- The property --------------------------------------------------------

    /**
     * Sends the tenant a code to read out as they hand over the token in cash,
     * where the property asks for one. The message names the amount and the
     * booking, so the tenant never agrees to a figure they did not see.
     *
     * <p>The number is the account's own, never one from the request: a code
     * sent to a phone the collector chose proves only that the collector has
     * a phone.
     */
    @Transactional
    public BookingCashCodeResponse sendCashCode(UUID actorUserId, UUID propertyId, UUID requestId,
            String requestIpAddress) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        BookingToken token = tokenOf(request);
        next(BookingTokenAction.MARK_RECEIVED, request, token, BookingParty.MANAGEMENT, now);
        if (!token.getStatus().isOwed()) {
            throw new ValidationException("The tenant says they have paid already. Answer that first.");
        }
        // Checked, not bumped: sending a code changes nothing the screen shows,
        // and "Received" on the same screen must still match.
        VersionGuard.verify(request);
        PaymentMethodsResponse methods = billing.paymentMethodsOf(propertyId);
        if (!methods.acceptedMethods().contains(ManualPaymentMethod.CASH)) {
            throw new ValidationException("This property does not take cash. Turn it on in Payment setup.");
        }
        if (!methods.cashOtpRequired()) {
            throw new ValidationException("This property does not ask for a cash code. Record the token as received.");
        }
        String phone = auth.findById(request.getProspectUserId())
                .map(UserSummaryResponse::phone)
                .filter(number -> !number.isBlank())
                .orElseThrow(() -> new ValidationException(
                        "There is no phone number on record for this person, so a code cannot be sent"));

        // The OTP store keeps one live booking code per number, not per booking.
        // A person with two agreed bookings who is sent a code for the second
        // would otherwise have it pass on the first as well.
        cashCodes.findByPhoneAndConsumedAtIsNullAndExpiresAtAfter(phone, now)
                .forEach(outstanding -> outstanding.supersede(now));

        String detail = "Share this code only if you have paid %s in cash as the booking token for %s."
                .formatted(Money.ofPaise(token.getAmountPaise()).formatRupees(), request.getReferenceCode());
        String sentTo = auth.startBookingTokenCashConfirmation(phone, requestIpAddress, detail);
        BookingTokenCashCode code = cashCodes.save(BookingTokenCashCode.sent(
                token.getId(), token.getAmountPaise(), phone, actorUserId, now, CASH_CODE_LIFETIME));
        log.info("Booking token cash code sent requestId={} reference={} actorUserId={} amountPaise={}",
                request.getId(), request.getReferenceCode(), actorUserId, token.getAmountPaise());
        return new BookingCashCodeResponse(sentTo, token.getAmountPaise(), code.getExpiresAt());
    }

    /**
     * "Token received." On a booking still held it awaits final confirmation and
     * gives the receipt its code. It is also the answer to a waiting claim,
     * and the direct path for cash, which arrives with no claim.
     *
     * <p>A claim answered after the booking ended settles at once: kept or
     * owed back, by how the booking ended and the owner's refund rule.
     *
     * @param method    how it was paid. May be left out when answering a
     *                  claim, which already names it
     * @param reference optional. Defaults to the claim's own
     * @param cashCode  the tenant's code, where the property asks for one on cash
     */
    @Transactional
    public BookingRequestResponse markReceived(UUID actorUserId, UUID propertyId, UUID requestId,
            ManualPaymentMethod method, String reference, String cashCode) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        BookingToken token = tokenOf(request);
        BookingStatus status = request.statusAt(now);
        BookingTokenStatus next = next(BookingTokenAction.MARK_RECEIVED, request, token, BookingParty.MANAGEMENT, now);

        BookingTokenClaim waiting = waitingClaimOf(token);
        ManualPaymentMethod paidBy = method != null ? method : waiting == null ? null : waiting.getMethod();
        if (paidBy == null) {
            throw new ValidationException("Choose how the token was paid.");
        }
        PaymentMethodsResponse methods = billing.paymentMethodsOf(propertyId);
        // A claim is answered as it was made: its way of paying was settled when the tenant recorded it, at the
        // desk or to the token's own details. Only a way the property names itself has to be one it takes.
        boolean asClaimed = waiting != null && paidBy == waiting.getMethod();
        if (!asClaimed && !methods.acceptedMethods().contains(paidBy)
                && !billing.bookingTokenMethodsOf(propertyId).contains(paidBy)) {
            throw new ValidationException(
                    "This property does not take that way of paying. Turn it on in Payment setup.");
        }
        String paidWith = reference(reference);
        if (paidWith == null && waiting != null) {
            paidWith = waiting.getReference();
        }

        VersionGuard.claim(request);
        // The code is the payer's own word that the cash changed hands. A tenant who recorded the cash
        // themselves, from their own account, has given that word already, so their claim is answered without one.
        if (paidBy == ManualPaymentMethod.CASH && methods.cashOtpRequired() && waiting == null) {
            spendCashCode(token, cashCode, now);
        }
        if (waiting != null) {
            waiting.answer(BookingClaimAnswer.RECEIVED, null, actorUserId, now);
        }
        token.receive(next, paidBy, paidWith, actorUserId, now, referenceCodes.nextCode("TKN"));
        if (next == BookingTokenStatus.KEPT) {
            // Received after the tenant had already walked away: the owner keeps it from this moment.
            writes.tokenKept(request, token, now);
        }
        request.tokenClaimAnswered();
        if (status == BookingStatus.AWAITING_TOKEN) {
            request.tokenReceived();
        }
        record(request, BookingActionType.TOKEN_RECEIVED, BookingParty.MANAGEMENT, actorUserId, now);
        log.info("Booking token received requestId={} reference={} receipt={} method={} booking={} token={}",
                request.getId(), request.getReferenceCode(), token.getReceiptCode(), paidBy, request.getStatus(), next);
        announcer.changed(request);
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    /**
     * "Not received", the answer to a claim the property cannot find. It needs
     * a reason, which the tenant is shown. On a booking still held the clock
     * runs again, with the time that was left when the claim was raised.
     */
    @Transactional
    public BookingRequestResponse markNotReceived(UUID actorUserId, UUID propertyId, UUID requestId, String reason) {
        String why = BookingTokenRules.requireNotReceivedReason(reason);
        if (why.length() > MAX_REASON_LENGTH) {
            throw new ValidationException("Keep the reason under %d characters.".formatted(MAX_REASON_LENGTH));
        }
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        BookingToken token = tokenOf(request);
        BookingStatus status = request.statusAt(now);
        next(BookingTokenAction.MARK_NOT_RECEIVED, request, token, BookingParty.MANAGEMENT, now);
        BookingTokenClaim waiting = waitingClaimOf(token);
        if (waiting == null) {
            throw new IllegalStateException("A claimed token has no waiting claim: " + token.getId());
        }

        VersionGuard.claim(request);
        waiting.answer(BookingClaimAnswer.NOT_RECEIVED, why, actorUserId, now);
        token.refuseClaim();
        if (status == BookingStatus.AWAITING_TOKEN) {
            request.tokenClaimRefused(
                    BookingPolicy.tokenDueAfterRefusedClaim(request.getTokenDueAt(), waiting.getClaimedAt(), now));
        } else {
            request.tokenClaimAnswered();
        }
        record(request, BookingActionType.TOKEN_NOT_RECEIVED, BookingParty.MANAGEMENT, actorUserId, now);
        log.info("Booking token claim refused requestId={} reference={} newDeadline={}",
                request.getId(), request.getReferenceCode(), request.getTokenDueAt());
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    /**
     * The owner holds this bed without a token after all. That confirms the
     * booking at once. Owner only: a manager cannot give the token away.
     */
    @Transactional
    public BookingRequestResponse waive(UUID ownerUserId, UUID propertyId, UUID requestId) {
        BookingRequest request = writes.lockForOwner(ownerUserId, propertyId, requestId,
                "Only the property owner can waive a booking token");
        Instant now = now();
        BookingToken token = tokenOf(request);
        next(BookingTokenAction.WAIVE, request, token, BookingParty.MANAGEMENT, now);

        VersionGuard.claim(request);
        token.waive(ownerUserId, now);
        request.confirmAwaited(now);
        record(request, BookingActionType.TOKEN_WAIVED, BookingParty.MANAGEMENT, ownerUserId, now);
        log.info("Booking token waived requestId={} reference={}", request.getId(), request.getReferenceCode());
        writes.confirmed(request, now);
        announcer.changed(request);
        return requestService.forProperty(ownerUserId, propertyId, requestId);
    }

    /**
     * The handler's decision on the token of a guest who did not arrive
     * (user, 2026-10-28), made from the token's record: refunded, which only
     * records it as owed back, or kept, which makes it non refundable and the
     * property's income from now. Refunds are not followed: paying one back is
     * the property's own business.
     *
     * @param refund true for "Refund token", false for "Keep token"
     */
    @Transactional
    public BookingRequestResponse decideToken(UUID actorUserId, UUID propertyId, UUID requestId, boolean refund) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        BookingToken token = tokenOf(request);
        BookingTokenAction action = refund ? BookingTokenAction.REFUND_TOKEN : BookingTokenAction.KEEP_TOKEN;
        if (!handlers.teamOf(propertyId).mayAct(actorUserId, request.getHandlerUserId())) {
            throw new ValidationException("Only the owner or this booking's handler can decide its token.");
        }
        BookingTokenStatus next = next(action, request, token, BookingParty.MANAGEMENT, now);

        VersionGuard.claim(request);
        token.settle(next, now);
        if (next == BookingTokenStatus.KEPT) {
            writes.tokenKept(request, token, now);
        }
        record(request, refund ? BookingActionType.TOKEN_REFUND_OWED : BookingActionType.TOKEN_KEPT,
                BookingParty.MANAGEMENT, actorUserId, now);
        log.info("Booking token decided requestId={} reference={} token={}",
                request.getId(), request.getReferenceCode(), next);
        announcer.changed(request);
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    // ---- The ledger ----------------------------------------------------------

    /**
     * Every token the property has received, newest first, and what became of
     * each, with totals across all of them (user's rule, 2026-10-10). For the
     * owner and the managers on the bookings access list.
     *
     * <p>Only money that arrived. A token still owed, or claimed and not yet
     * confirmed, is not money the property has. One read of the page and one
     * of the totals, however many tokens there are.
     */
    @Transactional(readOnly = true)
    public BookingTokenLedgerResponse ledgerForProperty(UUID actorUserId, UUID propertyId, int page, int size) {
        return ledgerForProperty(actorUserId, propertyId, null, null, page, size);
    }

    /**
     * The same ledger, narrowed on the server (user, 2026-10-11: "a filter
     * for token status and a search for token id"). The totals stay those of
     * every token, whatever the page was narrowed to.
     *
     * @param status only tokens that are this now. Null for all of them
     * @param search part of a token's own code or of its booking's, in any case
     */
    @Transactional(readOnly = true)
    public BookingTokenLedgerResponse ledgerForProperty(UUID actorUserId, UUID propertyId, BookingTokenStatus status,
            String search, int page, int size) {
        properties.ensureCanView(actorUserId, propertyId, ManagerResource.BOOKINGS);
        Instant now = now();
        String like = search == null || search.isBlank() ? ""
                : "%" + search.strip().toLowerCase(java.util.Locale.ROOT).replace("%", "").replace("_", "").strip()
                        + "%";
        if (like.equals("%%")) {
            like = "";
        }
        var found = tokens.pageReceivedForProperty(propertyId,
                status == null ? RECEIVED_STATUSES : java.util.Set.of(status), like,
                org.springframework.data.domain.PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50)));
        // Who may act on a booking is one read for the whole page, as on the list of requests.
        BookingHandlerService.Team team = handlers.teamOf(propertyId);
        List<BookingTokenLedgerResponse.Item> items = found.getContent().stream().map(row -> {
            BookingToken token = (BookingToken) row[0];
            BookingRequest request = (BookingRequest) row[1];
            // The very rule the step itself is checked against, so the list never offers what would be refused.
            boolean canDecide = BookingTokenRules.allowedActions(request.statusAt(now), token.getStatus(),
                    BookingParty.MANAGEMENT, team.mayAct(actorUserId, request.getHandlerUserId()))
                    .contains(BookingTokenAction.REFUND_TOKEN);
            return new BookingTokenLedgerResponse.Item(request.getId(), request.getReferenceCode(),
                    token.getReceiptCode(), request.getTenantName(), request.getRoomNumber(),
                    request.getMoveInDate(), token.getAmountPaise(), token.getStatus(), token.getReceivedMethod(),
                    token.getReceivedReference(), token.getReceivedAt(), request.getStatus(), request.getEndCause(),
                    token.getRefundDueSince(), canDecide, request.getVersion());
        }).toList();

        long count = 0;
        long collected = 0;
        java.util.Map<BookingTokenStatus, Long> byStatus = new java.util.EnumMap<>(BookingTokenStatus.class);
        for (Object[] row : tokens.sumReceivedByStatus(propertyId)) {
            long amount = ((Number) row[2]).longValue();
            byStatus.put((BookingTokenStatus) row[0], amount);
            count += ((Number) row[1]).longValue();
            collected += amount;
        }
        return new BookingTokenLedgerResponse(
                new BookingTokenLedgerResponse.Summary(count, collected,
                        byStatus.getOrDefault(BookingTokenStatus.RECEIVED, 0L),
                        byStatus.getOrDefault(BookingTokenStatus.ADJUSTED, 0L),
                        byStatus.getOrDefault(BookingTokenStatus.KEPT, 0L),
                        byStatus.getOrDefault(BookingTokenStatus.REFUND_DUE, 0L),
                        byStatus.getOrDefault(BookingTokenStatus.DECISION_PENDING, 0L)),
                new PageResponse<>(items, found.getNumber(), found.getSize(), found.getTotalElements(),
                        found.getTotalPages(), found.hasNext(), found.hasPrevious()));
    }

    // ---- Shared --------------------------------------------------------------

    /**
     * Asks the rules whether this step is allowed now, and what the token
     * becomes. The booking's status is read with its clocks applied, so a
     * token whose time has run out takes no payment even before the sweep has
     * written the lapse.
     */
    private BookingTokenStatus next(BookingTokenAction action, BookingRequest request, BookingToken token,
            BookingParty party, Instant now) {
        BookingStatus status = request.statusAt(now);
        return BookingTokenRules.next(action, status, token.getStatus(), party, true,
                status == BookingStatus.AWAITING_TOKEN ? null : request.getEndCause(),
                request.isTokenRefundable());
    }

    private BookingToken tokenOf(BookingRequest request) {
        return tokens.findByRequestId(request.getId())
                .orElseThrow(() -> new ValidationException("This booking has no token."));
    }

    private BookingTokenClaim waitingClaimOf(BookingToken token) {
        return claims.findByTokenIdOrderBySequenceAsc(token.getId()).stream()
                .filter(BookingTokenClaim::isWaiting)
                .findFirst()
                .orElse(null);
    }

    private void spendCashCode(BookingToken token, String cashCode, Instant now) {
        if (cashCode == null || cashCode.isBlank()) {
            throw new ValidationException("Ask the tenant for the code sent to their phone");
        }
        BookingTokenCashCode sent = cashCodes.findFirstByTokenIdOrderByRequestedAtDesc(token.getId())
                .filter(code -> code.isUsableAt(now))
                .orElseThrow(() -> new ValidationException("No active code for this booking. Send the tenant a new one."));
        auth.completeBookingTokenCashConfirmation(sent.getPhone(), cashCode.strip());
        sent.consume(now);
    }

    private void record(BookingRequest request, BookingActionType type, BookingParty party, UUID actorUserId,
            Instant now) {
        actions.save(BookingRequestAction.by(request.getId(), type, party, actorUserId, null,
                request.getStatus(), null, now));
    }

    private static String reference(String reference) {
        String trimmed = reference == null ? "" : reference.strip();
        if (trimmed.length() > MAX_REFERENCE_LENGTH) {
            throw new ValidationException("Keep the reference under %d characters.".formatted(MAX_REFERENCE_LENGTH));
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static List<String> proof(List<String> urls) {
        List<String> kept = urls == null ? List.of() : urls.stream()
                .filter(url -> url != null && !url.isBlank())
                .map(String::strip)
                .toList();
        if (kept.size() > BookingTokenClaim.MAX_PROOF_IMAGES) {
            throw new ValidationException("Attach at most %d images.".formatted(BookingTokenClaim.MAX_PROOF_IMAGES));
        }
        if (kept.stream().anyMatch(url -> url.length() > MAX_PROOF_URL_LENGTH)) {
            throw new ValidationException("That image link is too long. Upload the image again.");
        }
        return kept;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }
}
