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
import com.khatiyan.d_modules.verification.provider.AadhaarOkycProvider;
import com.khatiyan.d_modules.verification.provider.OkycOutcome;
import com.khatiyan.d_modules.verification.provider.OtpChallenge;
import com.khatiyan.d_modules.verification.provider.StartOtpCommand;
import com.khatiyan.d_modules.verification.provider.SubmitOtpCommand;
import com.khatiyan.d_modules.verification.repository.VerificationAttemptRepository;
import com.khatiyan.d_modules.verification.repository.VerificationGrantRepository;

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
    private final VerificationProperties properties;
    private final ServiceBalanceModule serviceBalance;
    private final AuthModule authModule;
    private final Clock clock;
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
            VerificationProperties properties,
            ServiceBalanceModule serviceBalance,
            AuthModule authModule,
            Clock clock,
            PlatformTransactionManager transactionManager) {
        this.grantRepository = grantRepository;
        this.attemptRepository = attemptRepository;
        this.provider = provider;
        this.properties = properties;
        this.serviceBalance = serviceBalance;
        this.authModule = authModule;
        this.clock = clock;
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
     * What this owner has ordered and not yet spent, at today's prices.
     *
     * <p>Ordered attempts become dues only when a tenant runs them, so nothing
     * else in the system can see this queue building up behind the ceiling.
     */
    public long committedPaiseFor(UUID ownerUserId) {
        long unusedAttempts =
                grantRepository.sumUnusedAttempts(ownerUserId, VerificationGrantStatus.PENDING);
        return unusedAttempts * serviceBalance.priceOf(ServiceCode.AADHAAR_OKYC);
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

        if (!grant.isOpen()) {
            throw new BusinessException("VERIFICATION_CLOSED", "This check is already finished.");
        }
        if (grant.attemptsRemaining() <= 0) {
            throw new BusinessException(
                    "VERIFICATION_NO_ATTEMPTS", "No attempts left. Ask the property owner for more.");
        }
        requireWithinDailyCap(grant);
        requireCooldownElapsed(grant);

        grant.useAttempt();
        grantRepository.save(grant);

        return attemptRepository.save(VerificationAttempt.start(
                grant.getId(),
                "khatiyan-" + UUID.randomUUID(),
                serviceBalance.priceOf(grant.getServiceCode()),
                Instant.now(clock)));
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
                outcome.address(),
                outcome.addressPincode(),
                phoneMatched,
                true,
                now);
        grantRepository.save(grant);
        attempt.markSucceeded(now);
        attemptRepository.save(attempt);

        // The record replaces what was typed, and the fields close behind it.
        authModule.applyVerifiedIdentity(
                tenantUserId,
                outcome.name(),
                outcome.dateOfBirth(),
                outcome.address(),
                outcome.addressPincode(),
                grant.getServiceCode().name(),
                now);

        log.info("Verification passed grantId={} tenantUserId={}", grant.getId(), tenantUserId);
        return VerificationResult.verified(grant);
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

    /** The tenancy went away, so nothing more will be run or charged. */
    @Transactional
    public void cancelForTenancy(UUID tenancyId) {
        grantRepository.findByTenancyIdAndStatus(tenancyId, VerificationGrantStatus.PENDING)
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
                .filter(last -> last.getStatus() == VerificationAttemptStatus.AWAITING_OTP)
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
