package com.khatiyan.d_modules.billing.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.billing.api.dto.PropertyPaymentDetailsResponse;
import com.khatiyan.d_modules.billing.api.dto.UpdatePropertyPaymentDetailsRequest;
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
        details.update(
                request.upiVpa(),
                request.payeeName(),
                request.upiPhone(),
                request.upiQrImageUrl(),
                request.bankAccountNumber(),
                request.bankIfsc(),
                request.bankAccountHolder(),
                actorUserId);
        PropertyPaymentDetails saved = repository.save(details);

        // The address itself is not logged. It is the owner's payout destination
        // and a log line is the one place it would sit in plain text forever.
        log.info(
                "Property payment details updated propertyId={} actorUserId={} acceptsUpi={} hasBankReference={}",
                propertyId, actorUserId, saved.canAcceptUpi(), saved.getBankAccountNumber() != null);

        return PropertyPaymentDetailsResponse.from(saved);
    }

    /** Whether a tenant on this property can be offered a pay link. */
    @Transactional(readOnly = true)
    public boolean acceptsUpi(UUID propertyId) {
        return repository.findById(propertyId).map(PropertyPaymentDetails::canAcceptUpi).orElse(false);
    }
}
