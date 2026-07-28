package com.khatiyan.d_modules.payment.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.payment.api.dto.IfscLookupResponse;
import com.khatiyan.d_modules.payment.api.dto.PayoutAccountResponse;
import com.khatiyan.d_modules.payment.api.dto.SetupPayoutAccountRequest;
import com.khatiyan.d_modules.payment.model.OwnerLinkedAccount;
import com.khatiyan.d_modules.payment.model.OwnerLinkedAccountStatus;
import com.khatiyan.d_modules.payment.provider.CreateLinkedAccountCommand;
import com.khatiyan.d_modules.payment.provider.LinkedAccountResult;
import com.khatiyan.d_modules.payment.provider.PaymentProvider;
import com.khatiyan.d_modules.payment.provider.PaymentProviderRegistry;
import com.khatiyan.d_modules.payment.repository.OwnerLinkedAccountRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Owner payout onboarding: captures bank details and creates/updates the
 * Razorpay Route linked account used to receive rent (minus the owner-borne
 * fee). Only non-sensitive fields are persisted; the full account number goes
 * to the gateway and is discarded.
 *
 * <p>An owner may keep up to {@value #MAX_PAYOUT_ACCOUNTS} banks on file, but
 * exactly one is primary at a time — rent is only ever transferred to that one.
 */
@Slf4j
@Service
public class PaymentPayoutService {

    /**
     * A second bank covers the common case of switching banks without losing
     * the old details mid-switch. More than that is account sprawl with no
     * payout benefit, since money only goes to one of them.
     */
    public static final int MAX_PAYOUT_ACCOUNTS = 2;

    private final OwnerLinkedAccountRepository ownerLinkedAccountRepository;
    private final PaymentProviderRegistry paymentProviderRegistry;
    private final PaymentProperties paymentProperties;
    private final IfscLookupService ifscLookupService;
    private final AuthModule authModule;
    private final PropertyModule propertyModule;

    public PaymentPayoutService(
            OwnerLinkedAccountRepository ownerLinkedAccountRepository,
            PaymentProviderRegistry paymentProviderRegistry,
            PaymentProperties paymentProperties,
            IfscLookupService ifscLookupService,
            AuthModule authModule,
            PropertyModule propertyModule) {
        this.ownerLinkedAccountRepository = ownerLinkedAccountRepository;
        this.paymentProviderRegistry = paymentProviderRegistry;
        this.paymentProperties = paymentProperties;
        this.ifscLookupService = ifscLookupService;
        this.authModule = authModule;
        this.propertyModule = propertyModule;
    }

    public IfscLookupResponse lookupIfsc(String ifsc) {
        return ifscLookupService.lookup(ifsc);
    }

    @Transactional(readOnly = true)
    public List<PayoutAccountResponse> listPayoutAccounts(UUID ownerUserId) {
        return ownerLinkedAccountRepository.findByOwnerUserIdOrderByCreatedAtAsc(ownerUserId)
                .stream()
                .map(PayoutAccountResponse::from)
                .toList();
    }

    @Transactional
    public PayoutAccountResponse addPayoutAccount(UUID ownerUserId, SetupPayoutAccountRequest request) {
        List<OwnerLinkedAccount> existing = ownerLinkedAccountRepository
                .findByOwnerUserIdOrderByCreatedAtAsc(ownerUserId);
        if (existing.size() >= MAX_PAYOUT_ACCOUNTS) {
            throw new ValidationException(
                    "You can keep up to " + MAX_PAYOUT_ACCOUNTS + " bank accounts. Remove one before adding another.");
        }

        BankDetails details = normalize(request);
        if (existing.stream().anyMatch(details::matches)) {
            throw new ValidationException("This bank account is already on file.");
        }

        IfscLookupResponse branch = requireRealBranch(details.ifsc());
        requireConsistentPan(ownerUserId, null, details.pan());

        LinkedAccountResult result = createLinkedAccount(ownerUserId, details);
        // The first bank an owner adds becomes the one money goes to; a second
        // is parked until the owner switches to it.
        OwnerLinkedAccount account = OwnerLinkedAccount.create(
                ownerUserId,
                details.holder(),
                details.last4(),
                details.ifsc(),
                result.providerAccountId(),
                statusFor(result),
                existing.isEmpty());
        account.describeBank(branch.bank(), branch.branch());
        account.updatePan(details.pan());
        account = ownerLinkedAccountRepository.save(account);

        log.info("Owner payout account added ownerUserId={} accountId={} status={} primary={}",
                ownerUserId, account.getId(), account.getStatus(), account.isPrimary());
        return PayoutAccountResponse.from(account);
    }

    /** Re-submits bank details for an existing account (e.g. after a failure). */
    @Transactional
    public PayoutAccountResponse updatePayoutAccount(
            UUID ownerUserId,
            UUID accountId,
            SetupPayoutAccountRequest request) {
        OwnerLinkedAccount account = requireOwned(ownerUserId, accountId);
        BankDetails details = normalize(request);

        boolean clashesWithOtherAccount = ownerLinkedAccountRepository
                .findByOwnerUserIdOrderByCreatedAtAsc(ownerUserId)
                .stream()
                .filter(other -> !other.getId().equals(accountId))
                .anyMatch(details::matches);
        if (clashesWithOtherAccount) {
            throw new ValidationException("Your other bank account already uses these details.");
        }

        IfscLookupResponse branch = requireRealBranch(details.ifsc());
        requireConsistentPan(ownerUserId, accountId, details.pan());

        LinkedAccountResult result = createLinkedAccount(ownerUserId, details);
        account.updateDetails(details.holder(), details.last4(), details.ifsc());
        account.describeBank(branch.bank(), branch.branch());
        account.updatePan(details.pan());
        applyResult(account, result);

        log.info("Owner payout account updated ownerUserId={} accountId={} status={}",
                ownerUserId, accountId, account.getStatus());
        return PayoutAccountResponse.from(account);
    }

    @Transactional
    public void deletePayoutAccount(UUID ownerUserId, UUID accountId) {
        OwnerLinkedAccount account = requireOwned(ownerUserId, accountId);
        boolean wasPrimary = account.isPrimary();

        ownerLinkedAccountRepository.delete(account);
        // Flush before promoting so the partial unique index never sees the old
        // and the new primary row at the same time.
        ownerLinkedAccountRepository.flush();

        if (wasPrimary) {
            ownerLinkedAccountRepository.findByOwnerUserIdOrderByCreatedAtAsc(ownerUserId)
                    .stream()
                    .findFirst()
                    .ifPresent(OwnerLinkedAccount::markPrimary);
        }

        log.info("Owner payout account removed ownerUserId={} accountId={} wasPrimary={}",
                ownerUserId, accountId, wasPrimary);
    }

    /** Switches which bank rent is transferred to. */
    @Transactional
    public List<PayoutAccountResponse> setPrimaryPayoutAccount(UUID ownerUserId, UUID accountId) {
        OwnerLinkedAccount target = requireOwned(ownerUserId, accountId);
        if (target.getStatus() == OwnerLinkedAccountStatus.FAILED) {
            throw new ValidationException(
                    "This bank account failed verification. Fix the details before switching to it.");
        }

        List<OwnerLinkedAccount> accounts = ownerLinkedAccountRepository
                .findByOwnerUserIdOrderByCreatedAtAsc(ownerUserId);
        accounts.stream()
                .filter(account -> !account.getId().equals(accountId))
                .forEach(OwnerLinkedAccount::clearPrimary);
        // Clear the old primary first: the partial unique index rejects two
        // primary rows for the same owner within a single flush.
        ownerLinkedAccountRepository.flush();
        target.markPrimary();

        log.info("Owner payout account switched ownerUserId={} accountId={}", ownerUserId, accountId);
        return listPayoutAccounts(ownerUserId);
    }

    /**
     * Rejects an IFSC the bank directory says does not exist. A directory
     * outage is not the owner's fault, so {@code UNAVAILABLE} passes through on
     * the format check alone — we simply learn no bank/branch name.
     */
    private IfscLookupResponse requireRealBranch(String ifsc) {
        IfscLookupResponse lookup = ifscLookupService.lookup(ifsc);
        if (lookup.isNotFound()) {
            throw new ValidationException(
                    "That IFSC doesn't match any bank branch. Check the code on your cheque book or passbook.");
        }
        return lookup;
    }

    private OwnerLinkedAccount requireOwned(UUID ownerUserId, UUID accountId) {
        return ownerLinkedAccountRepository.findByIdAndOwnerUserId(accountId, ownerUserId)
                .orElseThrow(() -> new NotFoundException("Bank account", accountId));
    }

    private LinkedAccountResult createLinkedAccount(UUID ownerUserId, BankDetails details) {
        UserSummaryResponse owner = authModule.findById(ownerUserId)
                .orElseThrow(() -> new NotFoundException("User", ownerUserId));

        if (owner.email() == null || owner.email().isBlank()) {
            // Razorpay requires a contactable email on the sub-merchant, and it
            // is where they send activation correspondence.
            throw new ValidationException(
                    "Add an email address to your account before setting up payouts.");
        }
        if (!owner.emailVerified()) {
            // Owners who signed up as tenants (phone only) and later switched
            // reach here with an unclaimed address. Sending a payout account's
            // correspondence to an unverified inbox is not something to discover
            // after money starts moving.
            throw new ValidationException(
                    "Verify your email address before setting up payouts. We'll send payout updates there.");
        }

        // The owner's registered address defaults to a property they let out —
        // for an individual PG owner that is normally the same place, and it
        // avoids asking for an address we already hold.
        PropertyResponse property = propertyModule.listOwnerProperties(ownerUserId).stream()
                .findFirst()
                .orElseThrow(() -> new ValidationException(
                        "Register a property before setting up payouts, so we can share your business address."));

        PaymentProvider provider = paymentProviderRegistry.get(paymentProperties.defaultProvider());
        return provider.createLinkedAccount(new CreateLinkedAccountCommand(
                ownerUserId,
                details.holder(),
                details.accountNumber(),
                details.ifsc(),
                details.pan(),
                owner.email(),
                owner.phone(),
                property.address(),
                property.city(),
                property.state(),
                property.pincode()));
    }

    private BankDetails normalize(SetupPayoutAccountRequest request) {
        String accountNumber = request.accountNumber().trim();
        String last4 = accountNumber.length() >= 4
                ? accountNumber.substring(accountNumber.length() - 4)
                : accountNumber;
        return new BankDetails(
                request.accountHolderName().trim(),
                accountNumber,
                request.ifsc().trim().toUpperCase(),
                last4,
                request.pan().trim().toUpperCase());
    }

    /**
     * Razorpay creates one linked account per owner, not per bank — a second
     * bank is a settlement-account swap on the same KYC. Two different PANs
     * under one owner would therefore be incoherent, so they must match.
     */
    private void requireConsistentPan(UUID ownerUserId, UUID excludedAccountId, String pan) {
        boolean conflicts = ownerLinkedAccountRepository.findByOwnerUserIdOrderByCreatedAtAsc(ownerUserId)
                .stream()
                .filter(account -> !account.getId().equals(excludedAccountId))
                .anyMatch(account -> account.getPan() != null && !account.getPan().equalsIgnoreCase(pan));
        if (conflicts) {
            throw new ValidationException("Both bank accounts must be held under the same PAN.");
        }
    }

    private OwnerLinkedAccountStatus statusFor(LinkedAccountResult result) {
        if (result.active()) {
            return OwnerLinkedAccountStatus.ACTIVE;
        }
        if (result.failureReason() != null) {
            return OwnerLinkedAccountStatus.FAILED;
        }
        return OwnerLinkedAccountStatus.PENDING;
    }

    private void applyResult(OwnerLinkedAccount account, LinkedAccountResult result) {
        if (result.active()) {
            account.markActive(result.providerAccountId());
        } else if (result.failureReason() != null) {
            account.markFailed(result.failureReason());
        } else {
            account.markPending(result.providerAccountId());
        }
    }

    /**
     * Submitted bank details, normalized. The full account number lives here
     * only long enough to reach the gateway — only {@code last4} is persisted.
     */
    private record BankDetails(String holder, String accountNumber, String ifsc, String last4, String pan) {

        boolean matches(OwnerLinkedAccount account) {
            return account.getIfsc().equalsIgnoreCase(ifsc)
                    && account.getAccountNumberLast4().equals(last4);
        }
    }
}
