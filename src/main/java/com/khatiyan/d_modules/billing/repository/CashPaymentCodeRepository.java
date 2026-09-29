package com.khatiyan.d_modules.billing.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.billing.model.CashPaymentCode;

public interface CashPaymentCodeRepository extends JpaRepository<CashPaymentCode, UUID> {

    /**
     * The most recent code sent for a bill.
     *
     * <p>Only the latest counts. Sending a new code replaces the old one in the
     * OTP store, so an older row describes a code that can no longer be entered.
     */
    Optional<CashPaymentCode> findFirstByBillingCycleIdOrderByRequestedAtDesc(UUID billingCycleId);

    /**
     * Codes to one number that could still be entered.
     *
     * <p>The OTP store holds ONE live cash code per phone, not one per bill. So
     * when a tenant with two unpaid bills is sent a code for the second, the
     * first bill's code row still looked usable — and the second bill's code
     * would have passed on it. Sending a new code retires these.
     */
    List<CashPaymentCode> findByPhoneAndConsumedAtIsNullAndExpiresAtAfter(String phone, Instant now);
}
