package com.khatiyan.d_modules.billing.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.d_modules.billing.api.dto.PayeeDetailsResponse;
import com.khatiyan.d_modules.billing.api.dto.PaymentMethodsResponse;
import com.khatiyan.d_modules.billing.api.dto.PropertyPaymentDetailsResponse;
import com.khatiyan.d_modules.billing.api.dto.UpdatePropertyPaymentDetailsRequest;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;
import com.khatiyan.d_modules.billing.repository.PropertyPaymentDetailsRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Where a property's rent should be paid to.
 *
 * <p>
 * <b>Owner only, both to read and to write.</b> This is the owner's payout
 * destination and their bank account reference — a manager who runs the bills
 * has no business seeing which account the money lands in, and the same rule
 * that keeps them out of verifying claims keeps them out of here.
 */
@Slf4j
@Service
public class PropertyPaymentDetailsService {

    private final PropertyPaymentDetailsRepository repository;
    private final BillingAccessPolicy billingAccessPolicy;

    public PropertyPaymentDetailsService(
            PropertyPaymentDetailsRepository repository,
            BillingAccessPolicy billingAccessPolicy) {
        this.repository = repository;
        this.billingAccessPolicy = billingAccessPolicy;
    }

    /** Empty rather than 404 when nothing has been set up — the screen is a form. */
    @Transactional(readOnly = true)
    public PropertyPaymentDetailsResponse get(UUID actorUserId, UUID propertyId) {
        billingAccessPolicy.ensureOwnsPaymentVerification(actorUserId, propertyId);
        return PropertyPaymentDetailsResponse.from(repository.findById(propertyId).orElse(null));
    }

    /**
     * Replaces the whole set.
     *
     * <p>
     * Clearing the UPI address is how an owner turns in-app payment off, so a
     * blank field has to mean "remove" rather than "leave alone" — which is why
     * this replaces rather than patches.
     */
    @Transactional
    public PropertyPaymentDetailsResponse update(
            UUID actorUserId, UUID propertyId, UpdatePropertyPaymentDetailsRequest request) {
        billingAccessPolicy.ensureOwnsPaymentVerification(actorUserId, propertyId);

        PropertyPaymentDetails details = repository.findById(propertyId)
                .orElseGet(() -> PropertyPaymentDetails.empty(propertyId));
        // The setup as the owner's screen saw it (2026-09-29). A first save has
        // no row yet: version 0 on both sides.
        VersionGuard.claim(details);
        details.update(
                request.upiVpa(),
                request.payeeName(),
                request.upiPhone(),
                request.upiQrImageUrl(),
                request.bankAccountNumber(),
                request.bankIfsc(),
                request.bankAccountHolder(),
                actorUserId);
        // Checked after the details, against them: a ticked UPI or bank transfer
        // must have something to pay to. Null keeps what was set, which also
        // re-checks it, so clearing the UPI details while UPI is ticked is refused.
        details.setAcceptance(
                request.acceptedMethods() != null ? request.acceptedMethods() : java.util.Set.copyOf(details.acceptedMethods()),
                request.cashOtpRequired() != null ? request.cashOtpRequired() : details.isCashOtpRequired());
        // Where booking tokens are paid, after the bill details, since "the same
        // as bills" reads them. Null keeps what is set.
        if (request.tokenUsesBillDetails() != null) {
            details.updateTokenDetails(
                    request.tokenUsesBillDetails(),
                    request.tokenUpiVpa(),
                    request.tokenPayeeName(),
                    request.tokenUpiPhone(),
                    request.tokenUpiQrImageUrl(),
                    request.tokenBankAccountNumber(),
                    request.tokenBankIfsc(),
                    request.tokenBankAccountHolder(),
                    actorUserId);
        }
        PropertyPaymentDetails saved = repository.save(details);

        // The address itself is not logged. It is the owner's payout destination
        // and a log line is the one place it would sit in plain text forever.
        log.info(
                "Property payment details updated propertyId={} actorUserId={} acceptsUpi={} hasBankReference={}",
                propertyId, actorUserId, saved.canAcceptUpi(), saved.getBankAccountNumber() != null);

        return PropertyPaymentDetailsResponse.from(saved);
    }

    /** The ways this property takes money, for whoever records a payment. */
    @Transactional(readOnly = true)
    public PaymentMethodsResponse methods(UUID actorUserId, UUID propertyId) {
        billingAccessPolicy.ensureCanViewPaymentMethods(actorUserId, propertyId);
        return PaymentMethodsResponse.from(
                repository.findById(propertyId).orElseGet(() -> PropertyPaymentDetails.empty(propertyId)));
    }

    /**
     * The ways this property takes money, for another module that has already
     * established who is asking. Booking reads it to record a token.
     */
    @Transactional(readOnly = true)
    public PaymentMethodsResponse methodsOf(UUID propertyId) {
        return PaymentMethodsResponse.from(
                repository.findById(propertyId).orElseGet(() -> PropertyPaymentDetails.empty(propertyId)));
    }

    /**
     * Where someone pays this property, or null when it takes neither UPI nor
     * a bank transfer. Unguarded, as above: the caller decides who may see it.
     */
    @Transactional(readOnly = true)
    public PayeeDetailsResponse payeeOf(UUID propertyId) {
        return repository.findById(propertyId).map(PayeeDetailsResponse::from).orElse(null);
    }

    /**
     * Where a booking token is paid: the bill details or the token's own, as
     * the owner chose. Null when there is nowhere to pay one. Unguarded, as
     * above.
     */
    @Transactional(readOnly = true)
    public PayeeDetailsResponse tokenPayeeOf(UUID propertyId) {
        return repository.findById(propertyId).map(PayeeDetailsResponse::forToken).orElse(null);
    }

    /** The ways a person may record a token as paid: UPI, a bank transfer, both or neither. Unguarded. */
    @Transactional(readOnly = true)
    public List<ManualPaymentMethod> tokenMethodsOf(UUID propertyId) {
        return repository.findById(propertyId).map(PropertyPaymentDetails::tokenMethods).orElse(List.of());
    }

    /** Every way a token reaches the property, what is recorded at its desk included. Unguarded. */
    @Transactional(readOnly = true)
    public List<ManualPaymentMethod> tokenAcceptedMethodsOf(UUID propertyId) {
        return repository.findById(propertyId)
                .orElseGet(() -> PropertyPaymentDetails.empty(propertyId))
                .tokenAcceptedMethods();
    }

    /** Whether a tenant on this property can be offered a pay link. */
    @Transactional(readOnly = true)
    public boolean acceptsUpi(UUID propertyId) {
        return repository.findById(propertyId).map(PropertyPaymentDetails::canAcceptUpi).orElse(false);
    }
}
