package com.khatiyan.d_modules.verification.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionTemplate;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserIdentityResponse;
import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.servicebalance.ServiceBalanceModule;
import com.khatiyan.d_modules.servicebalance.model.ServiceCode;
import com.khatiyan.d_modules.verification.model.VerificationAttempt;
import com.khatiyan.d_modules.verification.model.VerificationAttemptStatus;
import com.khatiyan.d_modules.verification.model.VerificationGrant;
import com.khatiyan.d_modules.verification.model.VerificationGrantStatus;
import com.khatiyan.d_modules.verification.provider.AadhaarAppProvider;
import com.khatiyan.d_modules.verification.provider.AadhaarCredentialParser;
import com.khatiyan.d_modules.verification.provider.AadhaarOkycProvider;
import com.khatiyan.d_modules.verification.provider.CredentialOutcome;
import com.khatiyan.d_modules.verification.provider.SessionHandle;
import com.khatiyan.d_modules.verification.provider.StartSessionCommand;
import com.khatiyan.d_modules.verification.provider.OkycOutcome;
import com.khatiyan.d_modules.verification.provider.OtpChallenge;
import com.khatiyan.d_modules.verification.provider.StartOtpCommand;
import com.khatiyan.d_modules.verification.provider.SubmitOtpCommand;
import com.khatiyan.d_modules.verification.repository.VerificationAttemptRepository;
import com.khatiyan.d_modules.verification.repository.VerificationGrantRepository;

import tools.jackson.databind.JsonNode;

/**
 * Ordering checks, running them, and paying for them.
 *
 * <p><b>Where the money moves.</b> Khatiyan prepays the provider, so a check is
 * never blocked by an owner's balance — every limit that can refuse an owner is
 * enforced when they ORDER, in {@link #order}. By the time a tenant is typing
 * an OTP the cost is already ours, and refusing there would strand a person and
 * lose us the money anyway.
 *
 * <p><b>One charge per attempt, at the moment a code is actually sent.</b> A
 * request the provider refused outright costs nothing, because they did no
 * work. A code that was sent and never used still costs, because they sent a
 * text message. Which of their two calls a vendor puts on the invoice does not
 * change this: the attempt is the unit, and the total per attempt is the same
 * either way.
 */
@Service
public class VerificationService {

    private static final Logger log = LoggerFactory.getLogger(VerificationService.class);

    /** The age below which somebody cannot hold a tenancy. */
    private static final int ADULT_AGE = 18;

    /** Everything in this app reckons a date in India. */
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final VerificationGrantRepository grantRepository;
    private final VerificationAttemptRepository attemptRepository;
    private final AadhaarOkycProvider provider;
    private final AadhaarAppProvider appProvider;
    private final VerificationProperties properties;
    private final ServiceBalanceModule serviceBalance;
    private final AuthModule authModule;
    private final Clock clock;
    private final ApplicationEventPublisher eventPublisher;
    /**
     * Explicit transaction boundaries, because this class deliberately has gaps
     * between them.
     *
     * <p>Every provider call sits OUTSIDE a transaction. A blocking HTTP call to
     * a third party inside one pins a pooled database connection for as long as
     * they take to answer, which turns their slow day into our outage — in
     * every module, not just this one.
     */
    private final TransactionTemplate transactions;

    public VerificationService(
            VerificationGrantRepository grantRepository,
            VerificationAttemptRepository attemptRepository,
            AadhaarOkycProvider provider,
            AadhaarAppProvider appProvider,
            VerificationProperties properties,
            ServiceBalanceModule serviceBalance,
            AuthModule authModule,
            Clock clock,
            ApplicationEventPublisher eventPublisher,
            PlatformTransactionManager transactionManager) {
        this.grantRepository = grantRepository;
        this.attemptRepository = attemptRepository;
        this.provider = provider;
        this.appProvider = appProvider;
        this.properties = properties;
        this.serviceBalance = serviceBalance;
        this.authModule = authModule;
        this.clock = clock;
        this.eventPublisher = eventPublisher;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    // ---- the owner orders ---------------------------------------------------

    /**
     * Records what an owner wants checked on a tenancy.
     *
     * <p>The only place a paid check can be refused. Everything the owner's
     * balance has to say is said here — the account lock, the dues ceiling, and
     * how far ahead they have already committed — because this is the one
     * moment where "no" costs nobody a half-finished verification.
     */
    @Transactional
    public List<VerificationGrant> order(
            UUID tenancyId,
            UUID ownerUserId,
            UUID propertyId,
            UUID tenantUserId,
            Map<ServiceCode, Integer> attemptsByService,
            UUID actorUserId) {

        if (attemptsByService == null || attemptsByService.isEmpty()) {
            return List.of();
        }
        requireEnabled();
        if (attemptsByService.containsKey(ServiceCode.AADHAAR_OKYC)) {
            // Superseded by the Aadhaar App (2026-09-27). Checks already
            // ordered still run: only new orders are turned away.
            throw new BusinessException(
                    "VERIFICATION_SERVICE_RETIRED", "The OTP identity check has been replaced by the Aadhaar App check.");
        }

        long newOrderPaise = attemptsByService.entrySet().stream()
                .mapToLong(entry -> serviceBalance.priceOf(entry.getKey()) * entry.getValue())
                .sum();
        serviceBalance.ensureCanOrder(ownerUserId, committedPaiseFor(ownerUserId), newOrderPaise);

        List<VerificationGrant> grants = attemptsByService.entrySet().stream()
                .map(entry -> VerificationGrant.order(
                        tenancyId,
                        ownerUserId,
                        propertyId,
                        tenantUserId,
                        entry.getKey(),
                        entry.getValue(),
                        actorUserId))
                .map(grantRepository::save)
                .toList();

        log.info(
                "Verification ordered tenancyId={} ownerUserId={} checks={} estimatedPaise={}",
                tenancyId,
                ownerUserId,
                grants.size(),
                newOrderPaise);
        return grants;
    }

    /**
     * The owner gives a pending stay's tenant more tries (owner's decision,
     * 2026-09-27): the tenant who runs out is told to contact the owner, and the
     * owner adds them from the stay's card. No request flow.
     *
     * <p>Only for a check given to this tenant at onboarding, not yet passed,
     * with no attempts left: a top-up for someone who ran out, never a new order
     * and never extra tries on top of unused ones. Same balance limits as
     * ordering. The exhausted check opens again.
     */
    @Transactional
    public List<VerificationGrant> addAttempts(
            UUID tenancyId,
            UUID ownerUserId,
            UUID propertyId,
            UUID tenantUserId,
            Map<ServiceCode, Integer> attemptsByService,
            UUID actorUserId) {
        if (attemptsByService == null || attemptsByService.isEmpty()) {
            throw new BusinessException("VERIFICATION_NOTHING_CHOSEN", "Choose a check and how many attempts to add.");
        }
        requireEnabled();
        if (attemptsByService.containsKey(ServiceCode.AADHAAR_OKYC)) {
            throw new BusinessException(
                    "VERIFICATION_SERVICE_RETIRED", "The OTP identity check has been replaced by the Aadhaar App check.");
        }

        List<VerificationGrant> existing = grantRepository.findByTenancyIdOrderByCreatedAtAsc(tenancyId);
        Map<ServiceCode, VerificationGrant> toTopUp = new java.util.LinkedHashMap<>();
        for (ServiceCode service : attemptsByService.keySet()) {
            VerificationGrant grant = existing.stream()
                    .filter(candidate -> candidate.getServiceCode() == service)
                    .filter(candidate -> candidate.getStatus() != VerificationGrantStatus.CANCELLED)
                    .reduce((first, second) -> second)
                    .orElseThrow(() -> new BusinessException(
                            "VERIFICATION_NOT_ORDERED", "That check was not given to this tenant."));
            if (grant.getStatus() == VerificationGrantStatus.VERIFIED) {
                throw new BusinessException("VERIFICATION_ALREADY_DONE", "This tenant has already passed that check.");
            }
            if (grant.attemptsRemaining() > 0) {
                throw new BusinessException(
                        "VERIFICATION_ATTEMPTS_LEFT", "This tenant still has attempts left for that check.");
            }
            toTopUp.put(service, grant);
        }

        long addedPaise = attemptsByService.entrySet().stream()
                .mapToLong(entry -> serviceBalance.priceOf(entry.getKey()) * entry.getValue())
                .sum();
        serviceBalance.ensureCanOrder(ownerUserId, committedPaiseFor(ownerUserId), addedPaise);

        List<VerificationGrant> touched = new java.util.ArrayList<>();
        toTopUp.forEach((service, grant) -> {
            grant.addAttempts(attemptsByService.get(service));
            touched.add(grantRepository.save(grant));
        });

        log.info("Verification attempts added tenancyId={} actorUserId={} checks={} addedPaise={}",
                tenancyId, actorUserId, attemptsByService.keySet(), addedPaise);
        // The tenant is told, so they can try again without reopening the screen.
        Map<String, Integer> added = new java.util.LinkedHashMap<>();
        attemptsByService.forEach((service, attempts) -> added.put(service.name(), attempts));
        eventPublisher.publishEvent(
                new com.khatiyan.d_modules.verification.event.VerificationAttemptsAddedEvent(
                        tenancyId, tenantUserId, propertyId, added));
        return touched;
    }

    /**
     * What this owner has ordered and not yet spent, at today's prices.
     *
     * <p>Ordered attempts become dues only when a tenant runs them, so nothing
     * else in the system can see this queue building up behind the ceiling.
     */
    public long committedPaiseFor(UUID ownerUserId) {
        // Each grant at its own service's price: there are two Aadhaar services
        // now, and pricing every open grant as the OTP one would be wrong for
        // the other the day their prices differ.
        return grantRepository.findByOwnerUserIdAndStatus(ownerUserId, VerificationGrantStatus.PENDING).stream()
                .mapToLong(grant -> (long) grant.attemptsRemaining() * serviceBalance.priceOf(grant.getServiceCode()))
                .sum();
    }

    // ---- the tenant performs ------------------------------------------------

    /**
     * Asks the provider to text the tenant a code.
     *
     * <p>The attempt is consumed here rather than on success, because a code
     * that was sent has cost somebody money whether or not it is ever typed.
     */
    public VerificationAttempt startOtp(UUID grantId, UUID tenantUserId, String aadhaarNumber) {
        requireEnabled();

        // PHASE 1, in a transaction: decide whether this may run, and spend the
        // attempt. Committed before anybody is called, so a provider that hangs
        // cannot hold a database connection while it does.
        VerificationAttempt attempt = inTransaction(() -> openAttempt(grantId, tenantUserId));

        // PHASE 2, in NO transaction. This is a blocking call to somebody
        // else's server over the internet, and it is the whole reason this
        // method is split. Inside a transaction it pinned a pooled connection
        // for the length of their timeout, which is how a slow provider became
        // a connection leak and then an outage in modules that have nothing to
        // do with verification.
        OtpChallenge challenge;
        try {
            challenge = provider.startOtp(new StartOtpCommand(
                    attempt.getProviderReference(), aadhaarNumber, properties.getPurpose(), true));
        } catch (BusinessException e) {
            // The provider refused before doing anything, so nothing is
            // charged. The attempt is still spent: it is the tenant's try, and
            // an unlimited supply of refused requests is its own problem.
            inTransaction(() -> failAttempt(attempt.getId(), e.getMessage()));
            // WARN, not INFO. A provider refusing is not routine, and the
            // adapter has already logged their own codes beside this.
            log.warn(
                    "Verification attempt refused attemptId={} provider={} code={} reason={}",
                    attempt.getId(),
                    provider.name(),
                    e.getCode(),
                    e.getMessage());
            throw e;
        } catch (RuntimeException e) {
            // A timeout or anything else unforeseen. The attempt must not be
            // left open: nobody is coming back to finish it, and an open
            // attempt blocks the next one on the cooldown check.
            inTransaction(() -> failAttempt(attempt.getId(), "The verification service did not answer"));
            log.warn(
                    "Verification attempt failed attemptId={} provider={} error={}",
                    attempt.getId(),
                    provider.name(),
                    e.getClass().getSimpleName());
            throw e;
        }

        // PHASE 3, in a transaction: they sent the message, so record it and
        // charge for it.
        return inTransaction(() -> recordChallenge(attempt.getId(), challenge));
    }

    /**
     * Spends one attempt and opens a row for it, before anybody is called.
     *
     * <p>Committed on its own so the provider call that follows holds no
     * database connection. The cost of that is an attempt row that exists
     * before we know the provider will answer — which is the right way round:
     * the tenant has asked for a code, and a row saying so is what stops them
     * asking fifty more times while the first is in flight.
     */
    private VerificationAttempt openAttempt(UUID grantId, UUID tenantUserId) {
        VerificationGrant grant = ownGrant(grantId, tenantUserId);

        requireCanStart(grant);

        grant.useAttempt();
        grantRepository.save(grant);

        return attemptRepository.save(VerificationAttempt.start(
                grant.getId(),
                "khatiyan-" + UUID.randomUUID(),
                serviceBalance.priceOf(grant.getServiceCode()),
                Instant.now(clock)));
    }

    /** Everything that can stop a tenant starting an attempt, OTP or Aadhaar App. */
    private void requireCanStart(VerificationGrant grant) {
        if (!grant.isOpen()) {
            throw new BusinessException("VERIFICATION_CLOSED", "This check is already finished.");
        }
        if (grant.attemptsRemaining() <= 0) {
            throw new BusinessException(
                    "VERIFICATION_NO_ATTEMPTS", "No attempts left. Ask the property owner for more.");
        }
        requireWithinDailyCap(grant);
        requireCooldownElapsed(grant);
    }

    /**
     * Closes an attempt the provider never carried out, and gives the try back.
     *
     * <p>Nothing was charged, because they did no work. The tenant should not
     * pay for that in tries either — a misconfiguration on our side or an
     * outage on theirs is not their mistake, and this is the difference between
     * a bad afternoon and a tenant locked out until tomorrow.
     */
    private VerificationAttempt failAttempt(UUID attemptId, String reason) {
        VerificationAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new NotFoundException("Verification attempt", attemptId.toString()));
        if (!attempt.isOpen()) {
            return attempt;
        }

        attempt.markFailed(reason, Instant.now(clock));
        attemptRepository.save(attempt);

        if (!attempt.isCharged()) {
            grantRepository.findById(attempt.getGrantId()).ifPresent(grant -> {
                grant.restoreAttempt();
                grantRepository.save(grant);
            });
        }
        return attempt;
    }

    /** The code is on its way, so the owner is billed for it. */
    private VerificationAttempt recordChallenge(UUID attemptId, OtpChallenge challenge) {
        VerificationAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new NotFoundException("Verification attempt", attemptId.toString()));
        VerificationGrant grant = grantRepository.findById(attempt.getGrantId())
                .orElseThrow(() -> new NotFoundException("Verification", attempt.getGrantId().toString()));

        attempt.otpSent(
                challenge.providerTransactionId(), challenge.linkedMobileHint(), challenge.expiresAt());
        attemptRepository.save(attempt);

        // They sent the message, so we have been billed for it. This is the
        // only place an attempt is charged.
        chargeFor(grant, attempt, Instant.now(clock));

        log.info(
                "Verification OTP sent attemptId={} grantId={} provider={}",
                attempt.getId(),
                grant.getId(),
                provider.name());
        return attempt;
    }

    /**
     * Submits the code and, if everything agrees, settles who this person is.
     *
     * <p>Three things have to hold: the provider confirms the holder, the name
     * on the record is the name on the tenancy, and they are an adult. The date
     * of birth is not compared with what anybody typed — UIDAI's is simply
     * adopted, because the government's record is the better one and a
     * hand-entered date only ever produced failures about typing.
     */
    public VerificationResult submitOtp(UUID attemptId, UUID tenantUserId, String otp) {
        requireEnabled();

        // PHASE 1: may this code be submitted at all? Read and committed before
        // the provider is called, for the same reason startOtp is split.
        VerificationAttempt attempt = inTransaction(() -> readyAttempt(attemptId, tenantUserId));
        if (!attempt.isOpen()) {
            // Expired during phase 1, which already recorded it.
            return VerificationResult.failed(
                    "The code expired. Start the check again.",
                    grantRepository.findById(attempt.getGrantId()).orElse(null));
        }

        // PHASE 2, in NO transaction. See the note in startOtp: this is a
        // blocking call to somebody else's server, and holding a pooled
        // connection across it is what caused the leak.
        OkycOutcome outcome = provider.submitOtp(new SubmitOtpCommand(
                attempt.getProviderReference(),
                attempt.getProviderTransactionId(),
                otp,
                properties.getPurpose()));

        // PHASE 3: apply whatever they said.
        return inTransaction(() -> applyOutcome(attemptId, tenantUserId, outcome));
    }

    /**
     * The attempt, if it is still open, with expiry recorded if it is not.
     *
     * <p>Returns the attempt either way rather than throwing on expiry: an
     * expired code is an ordinary thing to have, and the caller turns it into a
     * result the tenant can read.
     */
    private VerificationAttempt readyAttempt(UUID attemptId, UUID tenantUserId) {
        VerificationAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new NotFoundException("Verification attempt", attemptId.toString()));
        // Authorisation before anything else: this proves the attempt is theirs.
        ownGrant(attempt.getGrantId(), tenantUserId);

        if (!attempt.isOpen()) {
            throw new BusinessException("VERIFICATION_ATTEMPT_CLOSED", "Start this check again.");
        }

        Instant now = Instant.now(clock);
        if (attempt.otpHasExpired(now)) {
            attempt.markExpired(now);
            attemptRepository.save(attempt);
        }
        return attempt;
    }

    /** Records what the provider said, and settles the identity if it passed. */
    private VerificationResult applyOutcome(UUID attemptId, UUID tenantUserId, OkycOutcome outcome) {
        VerificationAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new NotFoundException("Verification attempt", attemptId.toString()));
        VerificationGrant grant = ownGrant(attempt.getGrantId(), tenantUserId);
        Instant now = Instant.now(clock);

        if (!outcome.succeeded()) {
            attempt.markFailed(outcome.failureReason(), now);
            attemptRepository.save(attempt);
            return VerificationResult.failed(outcome.failureReason(), grant);
        }

        UserIdentityResponse tenant = authModule.findIdentity(tenantUserId)
                .orElseThrow(() -> new NotFoundException("User", tenantUserId.toString()));

        BigDecimal nameScore = NameMatcher.score(tenant.fullName(), outcome.name());
        if (!NameMatcher.matches(tenant.fullName(), outcome.name())) {
            // The most useful thing we can tell an owner, so it survives the
            // failure rather than leaving them with a bare "did not pass".
            grant.recordFailedMatch(outcome.name(), nameScore);
            grantRepository.save(grant);
            attempt.markFailed("The name on this Aadhaar does not match the name on the tenancy", now);
            attemptRepository.save(attempt);
            return VerificationResult.failed(
                    "The name on your Aadhaar does not match the name on this tenancy. "
                            + "Ask the property owner to correct it before trying again.",
                    grant);
        }

        boolean adult = isAdultOn(outcome.dateOfBirth(), LocalDate.now(clock.withZone(IST)));
        if (!adult) {
            attempt.markFailed("Under 18", now);
            attemptRepository.save(attempt);
            return VerificationResult.failed("A tenancy cannot be held by someone under 18.", grant);
        }

        Boolean phoneMatched = phoneMatches(tenant.phone(), outcome);

        grant.markVerified(
                outcome.name(),
                outcome.dateOfBirth(),
                outcome.maskedLastFour(),
                nameScore,
                // Not kept: the address is not part of verification (2026-09-27).
                null,
                null,
                phoneMatched,
                true,
                now);
        grantRepository.save(grant);
        attempt.markSucceeded(now);
        attemptRepository.save(attempt);

        // The record replaces what was typed, and the fields close behind it.
        // The OTP record carries no gender, so none is locked.
        authModule.applyVerifiedIdentity(
                tenantUserId,
                outcome.name(),
                outcome.dateOfBirth(),
                null,
                grant.getServiceCode().name(),
                now);

        log.info("Verification passed grantId={} tenantUserId={}", grant.getId(), tenantUserId);
        return VerificationResult.verified(grant);
    }

    // ---- the tenant performs: Aadhaar App (offline verification) ------------
    //
    // Spec: docs/superpowers/specs/2026-09-27-aadhaar-app-ovse-design.md.
    // The app has already checked the Aadhaar App is installed on this phone
    // and that the tenant says they have signed up in it, before this is
    // called: opening a session is what charges the owner.

    /**
     * Opens an Aadhaar App session, or hands back the one still open.
     *
     * <p>A tenant who comes back to the screen gets the same session again
     * rather than a new, separately charged one. Three phases, like the OTP
     * start: decide and spend the attempt, call the provider holding no
     * database connection, then record the session and charge for it.
     */
    public VerificationAttempt startAadhaarSession(UUID grantId, UUID tenantUserId) {
        requireEnabled();

        VerificationAttempt open = inTransaction(() -> reusableSession(grantId, tenantUserId));
        if (open != null) {
            return open;
        }

        String token = newCallbackToken();
        SessionStart start = inTransaction(() -> openSessionAttempt(grantId, tenantUserId, sha256(token)));
        VerificationAttempt attempt = start.attempt();

        SessionHandle handle;
        try {
            handle = appProvider.startSession(new StartSessionCommand(
                    attempt.getProviderReference(),
                    start.tenantName(),
                    properties.getPurpose(),
                    properties.getPublicBaseUrl() + "/api/v1/verification/callbacks/" + token,
                    properties.getReturnUrl() + "?attempt=" + attempt.getId(),
                    properties.isFaceAuthentication()));
        } catch (BusinessException e) {
            // Refused before a session existed: nothing charged, try given back.
            inTransaction(() -> failAttempt(attempt.getId(), e.getMessage()));
            log.warn("Aadhaar App session refused attemptId={} provider={} code={} reason={}",
                    attempt.getId(), appProvider.name(), e.getCode(), e.getMessage());
            throw e;
        } catch (RuntimeException e) {
            inTransaction(() -> failAttempt(attempt.getId(), "The verification service did not answer"));
            log.warn("Aadhaar App session failed attemptId={} provider={} error={}",
                    attempt.getId(), appProvider.name(), e.getClass().getSimpleName());
            throw e;
        }

        return inTransaction(() -> recordSession(attempt.getId(), handle));
    }

    /** What phase one hands to phase two. */
    private record SessionStart(VerificationAttempt attempt, String tenantName) {}

    /** The grant's session still open, if any. An expired one is closed on the way. */
    private VerificationAttempt reusableSession(UUID grantId, UUID tenantUserId) {
        VerificationGrant grant = ownGrant(grantId, tenantUserId);
        Instant now = Instant.now(clock);
        for (VerificationAttempt attempt : attemptRepository.findByGrantIdOrderByStartedAtDesc(grant.getId())) {
            if (attempt.getStatus() != VerificationAttemptStatus.AWAITING_CONSENT) {
                continue;
            }
            if (attempt.sessionHasExpired(now) || !appProvider.isSessionLive(attempt.getProviderSessionId())) {
                // Expired, or forgotten by the provider (the DEV stand-in
                // forgets on every restart). Handing it back would send the
                // tenant to a dead page, so it closes like an expiry.
                expireSession(attempt, grant, now);
                continue;
            }
            if (attempt.getIntentUrl() != null) {
                return attempt;
            }
        }
        return null;
    }

    private SessionStart openSessionAttempt(UUID grantId, UUID tenantUserId, String callbackTokenHash) {
        VerificationGrant grant = ownGrant(grantId, tenantUserId);
        if (grant.getServiceCode() != ServiceCode.AADHAAR) {
            throw new BusinessException("VERIFICATION_WRONG_METHOD", "This check is done a different way.");
        }
        requireCanStart(grant);

        UserIdentityResponse tenant = authModule.findIdentity(tenantUserId)
                .orElseThrow(() -> new NotFoundException("User", tenantUserId.toString()));

        grant.useAttempt();
        grantRepository.save(grant);
        VerificationAttempt attempt = attemptRepository.save(VerificationAttempt.startSession(
                grant.getId(),
                "khatiyan-" + UUID.randomUUID(),
                serviceBalance.priceOf(grant.getServiceCode()),
                Instant.now(clock),
                callbackTokenHash));
        return new SessionStart(attempt, tenant.fullName());
    }

    /** The session is open, so the owner is charged for it (owner's rule, 2026-09-27). */
    private VerificationAttempt recordSession(UUID attemptId, SessionHandle handle) {
        VerificationAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new NotFoundException("Verification attempt", attemptId.toString()));
        VerificationGrant grant = grantRepository.findById(attempt.getGrantId())
                .orElseThrow(() -> new NotFoundException("Verification", attempt.getGrantId().toString()));

        attempt.sessionOpened(handle.providerSessionId(), handle.intentUrl(), handle.expiresAt());
        attemptRepository.save(attempt);
        chargeFor(grant, attempt, Instant.now(clock));

        log.info("Aadhaar App session opened attemptId={} grantId={} provider={}",
                attempt.getId(), grant.getId(), appProvider.name());
        return attempt;
    }

    /**
     * A result posted to our callback.
     *
     * <p>The token in the URL is what makes it this attempt's: only its hash is
     * stored, and nothing else about the request is trusted. Idempotent, since
     * delivery is at least once: a second post for a closed attempt is ignored.
     *
     * @return false when the token matches no attempt
     */
    public boolean handleCallback(String token, JsonNode body) {
        if (token == null || token.isBlank()) {
            return false;
        }
        String hash = sha256(token);
        return Boolean.TRUE.equals(inTransaction(() -> {
            VerificationAttempt attempt = attemptRepository.findByCallbackTokenHash(hash).orElse(null);
            if (attempt == null) {
                log.warn("Aadhaar App callback for an unknown token");
                return false;
            }
            // Field names and status words only, never a value: what the
            // provider really sends is still being learned (spec §9).
            log.info("Aadhaar App callback attemptId={} status={} shape={}",
                    attempt.getId(), attempt.getStatus(), AadhaarCredentialParser.shapeOf(body));
            if (!attempt.isOpen()) {
                return true;
            }
            appProvider.readCallback(body).ifPresent(outcome -> applyCredential(attempt, outcome));
            return true;
        }));
    }

    /**
     * Where an attempt stands, for the app to poll when the tenant comes back.
     *
     * <p>Never trusts the return to the app on its own: the answer comes from
     * our own record, and from the provider when the callback has not arrived.
     */
    public AttemptStatus refreshAttempt(UUID attemptId, UUID tenantUserId) {
        VerificationAttempt attempt = inTransaction(() -> {
            VerificationAttempt found = attemptRepository.findById(attemptId)
                    .orElseThrow(() -> new NotFoundException("Verification attempt", attemptId.toString()));
            VerificationGrant grant = ownGrant(found.getGrantId(), tenantUserId);
            Instant now = Instant.now(clock);
            if (found.sessionHasExpired(now)) {
                expireSession(found, grant, now);
            }
            return found;
        });

        if (attempt.getStatus() == VerificationAttemptStatus.AWAITING_CONSENT && attempt.getProviderSessionId() != null) {
            // Outside any transaction: a call to somebody else's server.
            appProvider.fetchSession(attempt.getProviderSessionId(), attempt.getProviderReference())
                    .ifPresent(outcome -> inTransaction(() -> {
                        VerificationAttempt fresh = attemptRepository.findById(attemptId).orElseThrow();
                        if (fresh.isOpen()) {
                            applyCredential(fresh, outcome);
                        }
                        return null;
                    }));
        }

        return inTransaction(() -> {
            VerificationAttempt current = attemptRepository.findById(attemptId).orElseThrow();
            return new AttemptStatus(current, ownGrant(current.getGrantId(), tenantUserId));
        });
    }

    /** An attempt and its check, as the tenant's screen shows them. */
    public record AttemptStatus(VerificationAttempt attempt, VerificationGrant grant) {}

    /**
     * Closes Aadhaar App sessions that ran out unanswered.
     *
     * @return how many were closed
     */
    public int expireStaleSessions() {
        Instant now = Instant.now(clock);
        return inTransaction(() -> {
            int closed = 0;
            for (VerificationAttempt attempt : attemptRepository.findByStatusAndSessionExpiresAtBefore(
                    VerificationAttemptStatus.AWAITING_CONSENT, now)) {
                grantRepository.findById(attempt.getGrantId()).ifPresent(grant -> expireSession(attempt, grant, now));
                closed++;
            }
            return closed;
        });
    }

    /**
     * An unanswered session closes. The owner stays charged (it was opened),
     * but the tenant gets the try back (owner's rule, 2026-09-27), so a detour
     * through the Aadhaar App's own signup does not lock them out.
     */
    private void expireSession(VerificationAttempt attempt, VerificationGrant grant, Instant now) {
        attempt.markExpired(now);
        attemptRepository.save(attempt);
        grant.restoreAttempt();
        grantRepository.save(grant);
        log.info("Aadhaar App session expired attemptId={} grantId={}", attempt.getId(), grant.getId());
    }

    /**
     * Applies what the Aadhaar App shared.
     *
     * <p>Every rule of the OTP check, plus the Aadhaar App's own: the name is
     * matched strictly, 18 or over is required, the face check must not have
     * failed, and the gender and date of birth must be there, since both are
     * adopted and locked. A refusal still spends the attempt: the provider did
     * the work.
     */
    private void applyCredential(VerificationAttempt attempt, CredentialOutcome outcome) {
        VerificationGrant grant = grantRepository.findById(attempt.getGrantId())
                .orElseThrow(() -> new NotFoundException("Verification", attempt.getGrantId().toString()));
        Instant now = Instant.now(clock);

        if (outcome.referenceId() != null && !outcome.referenceId().equals(attempt.getProviderReference())) {
            // The token matched but the result names another attempt. Not
            // applied either way: the sweep closes this one if nothing else comes.
            log.warn("Aadhaar App result names another attempt attemptId={}", attempt.getId());
            return;
        }

        if (grant.getStatus() == VerificationGrantStatus.CANCELLED) {
            // The stay was cancelled while the tenant was in the Aadhaar App.
            // Nothing is adopted onto an account for a stay that is gone.
            attempt.markFailed("This check was cancelled with the stay", now);
            attemptRepository.save(attempt);
            return;
        }

        attempt.recordFaceMatch(outcome.faceMatched());
        String refusal = refusalFor(outcome, grant.getTenantUserId(), now);
        if (refusal != null) {
            attempt.markFailed(refusal, now);
            attemptRepository.save(attempt);
            log.info("Aadhaar App check did not pass attemptId={} reason={}", attempt.getId(), refusal);
            return;
        }

        UserIdentityResponse tenant = authModule.findIdentity(grant.getTenantUserId())
                .orElseThrow(() -> new NotFoundException("User", grant.getTenantUserId().toString()));
        grant.markVerified(
                outcome.name(),
                outcome.dateOfBirth(),
                outcome.maskedLastFour(),
                NameMatcher.score(tenant.fullName(), outcome.name()),
                // Not kept: the address is not part of verification (2026-09-27).
                null,
                null,
                maskedPhoneMatches(tenant.phone(), outcome.maskedMobile()),
                true,
                now);
        grant.recordCredentialExtras(outcome.gender(), outcome.faceMatched());
        grantRepository.save(grant);
        attempt.markSucceeded(now);
        attemptRepository.save(attempt);

        authModule.applyVerifiedIdentity(
                grant.getTenantUserId(),
                outcome.name(),
                outcome.dateOfBirth(),
                outcome.gender(),
                grant.getServiceCode().name(),
                now);
        log.info("Aadhaar App check passed grantId={} tenantUserId={}", grant.getId(), grant.getTenantUserId());
    }

    /** Why a shared credential cannot verify this tenant, in words they can read. Null when it can. */
    private String refusalFor(CredentialOutcome outcome, UUID tenantUserId, Instant now) {
        if (!outcome.succeeded()) {
            return outcome.failureReason() != null ? outcome.failureReason() : "The Aadhaar App did not share your details";
        }
        if (Boolean.FALSE.equals(outcome.faceMatched())) {
            return "The face check in the Aadhaar App did not pass";
        }
        UserIdentityResponse tenant = authModule.findIdentity(tenantUserId)
                .orElseThrow(() -> new NotFoundException("User", tenantUserId.toString()));
        if (!NameMatcher.matches(tenant.fullName(), outcome.name())) {
            return "The name on your Aadhaar does not match the name on this tenancy. "
                    + "Ask the property owner to correct it before trying again.";
        }
        if (outcome.dateOfBirth() == null) {
            return "The Aadhaar App did not share your date of birth. Share it and try again.";
        }
        if (!isAdultOn(outcome.dateOfBirth(), LocalDate.now(clock.withZone(IST)))
                || Boolean.FALSE.equals(outcome.ageAbove18())) {
            return "A tenancy cannot be held by someone under 18.";
        }
        if (outcome.gender() == null) {
            return "The Aadhaar App did not share your gender. Share it and try again.";
        }
        return null;
    }

    /**
     * Whether the Aadhaar-linked mobile ends in the digits of the registered
     * phone. The credential shows only the last few ("XXXXX-X9999"). Reported,
     * never enforced; null when nothing can be compared.
     */
    static Boolean maskedPhoneMatches(String registeredPhone, String maskedMobile) {
        if (registeredPhone == null || maskedMobile == null) {
            return null;
        }
        String visible = maskedMobile.replaceAll("[^0-9]", "");
        String registered = registeredPhone.replaceAll("[^0-9]", "");
        if (visible.isEmpty() || registered.isEmpty()) {
            return null;
        }
        return registered.endsWith(visible);
    }

    private static String newCallbackToken() {
        byte[] bytes = new byte[32];
        new java.security.SecureRandom().nextBytes(bytes);
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String sha256(String value) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    /**
     * Runs one unit of database work in its own transaction.
     *
     * <p>A template rather than {@code @Transactional} on a private method,
     * which Spring cannot proxy through a self-call and would silently ignore —
     * leaving the work running in whatever transaction happened to be open, or
     * none, which is exactly the bug this class was restructured to remove.
     */
    private <T> T inTransaction(java.util.function.Supplier<T> work) {
        return transactions.execute(status -> work.get());
    }

    // ---- reads --------------------------------------------------------------

    /**
     * Everything still asked of one tenant, across whatever tenancy asked it.
     *
     * <p>Keyed on the tenant rather than the tenancy, because the tenant's own
     * screen knows who they are and nothing else. Cancelled grants are left
     * out: a tenancy that went away has nothing for its tenant to do.
     */
    @Transactional(readOnly = true)
    public List<VerificationGrant> grantsForTenant(UUID tenantUserId) {
        return grantRepository.findByTenantUserIdAndStatusNotOrderByCreatedAtAsc(
                tenantUserId, VerificationGrantStatus.CANCELLED);
    }

    @Transactional(readOnly = true)
    public List<VerificationGrant> grantsForTenancy(UUID tenancyId) {
        return grantRepository.findByTenancyIdOrderByCreatedAtAsc(tenancyId);
    }

    /**
     * Whether everything asked of this tenant is done.
     *
     * <p>True when nothing was asked. An owner who ordered no checks has not
     * thereby blocked their tenant from signing.
     */
    @Transactional(readOnly = true)
    public boolean isSatisfied(UUID tenancyId) {
        return grantRepository.findByTenancyIdOrderByCreatedAtAsc(tenancyId).stream()
                .allMatch(grant -> grant.getStatus() == VerificationGrantStatus.VERIFIED
                        || grant.getStatus() == VerificationGrantStatus.CANCELLED);
    }

    /**
     * The tenancy went away, so nothing more will be run or charged.
     *
     * <p>Exhausted checks close too, not only pending ones: either would sit on
     * the tenant's screen for a stay that no longer exists. Passed checks are
     * kept ({@link VerificationGrant#cancel} leaves them).
     */
    @Transactional
    public void cancelForTenancy(UUID tenancyId) {
        grantRepository.findByTenancyIdOrderByCreatedAtAsc(tenancyId).stream()
                .filter(grant -> grant.getStatus() == VerificationGrantStatus.PENDING
                        || grant.getStatus() == VerificationGrantStatus.EXHAUSTED)
                .forEach(grant -> {
                    grant.cancel();
                    grantRepository.save(grant);
                });
    }

    // ---- the details --------------------------------------------------------

    private void chargeFor(VerificationGrant grant, VerificationAttempt attempt, Instant now) {
        serviceBalance.spendForService(
                grant.getOwnerUserId(),
                grant.getServiceCode(),
                attempt.getId(),
                "verify:" + attempt.getId() + ":charge",
                grant.getTenantUserId());
        attempt.markCharged(now);
        attemptRepository.save(attempt);
    }

    /**
     * Whether the Aadhaar-linked mobile is the phone they signed in with.
     *
     * <p>Null when we could not tell, which is not the same as no. A provider
     * that returned no hash, or a deployment with no share code configured,
     * must not produce a row claiming the phones disagree.
     */
    private Boolean phoneMatches(String registeredPhone, OkycOutcome outcome) {
        if (outcome.hashedMobile() == null || properties.getShareCode().isBlank()) {
            return null;
        }
        return LinkedMobileVerifier.matches(
                bareTenDigits(registeredPhone),
                properties.getShareCode(),
                outcome.maskedLastFour(),
                outcome.hashedMobile());
    }

    /** UIDAI hashes the bare number, with no country code and no punctuation. */
    private static String bareTenDigits(String phone) {
        if (phone == null) {
            return null;
        }
        String digits = phone.replaceAll("[^0-9]", "");
        return digits.length() > 10 ? digits.substring(digits.length() - 10) : digits;
    }

    static boolean isAdultOn(LocalDate dateOfBirth, LocalDate on) {
        return dateOfBirth != null && Period.between(dateOfBirth, on).getYears() >= ADULT_AGE;
    }

    private VerificationGrant ownGrant(UUID grantId, UUID tenantUserId) {
        VerificationGrant grant = grantRepository.findById(grantId)
                .orElseThrow(() -> new NotFoundException("Verification", grantId.toString()));
        if (!grant.getTenantUserId().equals(tenantUserId)) {
            // Not "forbidden": telling somebody a grant exists but is not
            // theirs is more than they need to know.
            throw new NotFoundException("Verification", grantId.toString());
        }
        return grant;
    }

    /**
     * How many tries this tenant has had today.
     *
     * <p>Separate from the owner's granted count, which is the owner's
     * decision. This is the floor under it: attempts cost the owner money, and
     * a tenant who can retry without limit is a tenant spending someone else's
     * balance.
     */
    private void requireWithinDailyCap(VerificationGrant grant) {
        if (properties.getMaxAttemptsPerDay() <= 0) {
            // Switched off for testing. Startup warns about it.
            return;
        }
        Instant dayStart = LocalDate.now(clock.withZone(IST)).atStartOfDay(IST).toInstant();
        long today = attemptRepository.countByGrantIdAndChargedAtNotNullAndStartedAtAfter(
                grant.getId(), dayStart);
        if (today >= properties.getMaxAttemptsPerDay()) {
            throw new BusinessException(
                    "VERIFICATION_DAILY_CAP", "You have tried too many times today. Try again tomorrow.");
        }
    }

    private void requireCooldownElapsed(VerificationGrant grant) {
        attemptRepository.findByGrantIdOrderByStartedAtDesc(grant.getId()).stream()
                .findFirst()
                .filter(VerificationAttempt::isOpen)
                .ifPresent(last -> {
                    Instant ready = last.getStartedAt().plus(
                            properties.getResendCooldownSeconds(), ChronoUnit.SECONDS);
                    if (Instant.now(clock).isBefore(ready)) {
                        throw new BusinessException(
                                "VERIFICATION_COOLDOWN",
                                "Wait a moment before asking for another code.");
                    }
                });
    }

    private void requireEnabled() {
        if (!properties.isEnabled()) {
            throw new BusinessException(
                    "VERIFICATION_DISABLED", "Identity checks are not available right now.");
        }
    }
}
