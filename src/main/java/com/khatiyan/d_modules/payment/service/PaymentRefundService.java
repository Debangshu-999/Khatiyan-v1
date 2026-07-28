package com.khatiyan.d_modules.payment.service;

import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.payment.model.OwnerTransfer;
import com.khatiyan.d_modules.payment.model.UnappliedPayment;
import com.khatiyan.d_modules.payment.model.UnappliedPaymentStatus;
import com.khatiyan.d_modules.payment.provider.PaymentProvider;
import com.khatiyan.d_modules.payment.provider.PaymentProviderRegistry;
import com.khatiyan.d_modules.payment.provider.ProviderRefund;
import com.khatiyan.d_modules.payment.repository.OwnerTransferRepository;
import com.khatiyan.d_modules.payment.repository.UnappliedPaymentRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Returns money the gateway captured that no bill could absorb.
 *
 * <p>Safe to automate because the gateway refunds to the original payment
 * method: no tenant bank details are involved, unlike a deposit refund, which is
 * a fresh outbound payment and stays manual.
 */
@Slf4j
@Service
public class PaymentRefundService {

    private final UnappliedPaymentRepository unappliedPaymentRepository;
    private final OwnerTransferRepository ownerTransferRepository;
    private final PaymentProviderRegistry paymentProviderRegistry;

    public PaymentRefundService(
            UnappliedPaymentRepository unappliedPaymentRepository,
            OwnerTransferRepository ownerTransferRepository,
            PaymentProviderRegistry paymentProviderRegistry) {
        this.unappliedPaymentRepository = unappliedPaymentRepository;
        this.ownerTransferRepository = ownerTransferRepository;
        this.paymentProviderRegistry = paymentProviderRegistry;
    }

    /**
     * Refunds every unapplied payment that can safely be returned automatically.
     *
     * @return how many refunds were issued
     */
    @Transactional
    public int refundUnappliedPayments() {
        List<UnappliedPayment> pending = unappliedPaymentRepository
                .findByStatusOrderByCapturedAtAsc(UnappliedPaymentStatus.PENDING_REFUND);

        int refunded = 0;
        for (UnappliedPayment payment : pending) {
            if (payment.getProviderPaymentId() == null || payment.getProviderPaymentId().isBlank()) {
                // Nothing to refund against; a human has to trace this one.
                continue;
            }

            // If the owner was already paid out of this payment, the money is no
            // longer ours to return — recovering it needs a transfer reversal
            // against a third party. Left for a person to decide.
            OwnerTransfer transfer = ownerTransferRepository
                    .findByProviderAndProviderPaymentId(payment.getProvider(), payment.getProviderPaymentId())
                    .orElse(null);
            if (transfer != null) {
                log.warn(
                        "Unapplied payment not auto-refunded - the owner was already paid from it unappliedPaymentId={} transferId={}",
                        payment.getId(),
                        transfer.getId());
                continue;
            }

            // Re-read the state inside the transaction: a retried sweep or a
            // manual resolution must not produce a second refund.
            if (payment.getStatus() != UnappliedPaymentStatus.PENDING_REFUND) {
                continue;
            }

            PaymentProvider provider = paymentProviderRegistry.get(payment.getProvider());
            try {
                ProviderRefund refund = provider.refundPayment(
                        payment.getProviderPaymentId(),
                        payment.getAmountPaise());

                payment.markRefunded(Instant.now(), null, "Auto-refunded to source, refund " + refund.providerRefundId());
                refunded = refunded + 1;

                log.info("Unapplied payment refunded unappliedPaymentId={} tenantUserId={} amount={} refundId={}",
                        payment.getId(),
                        payment.getTenantUserId(),
                        payment.getAmountPaise(),
                        refund.providerRefundId());
            } catch (RuntimeException exception) {
                // Stays PENDING_REFUND for the next sweep. A refund that cannot
                // be issued must never be marked resolved.
                log.error("Unapplied payment refund failed unappliedPaymentId={} amount={}",
                        payment.getId(), payment.getAmountPaise(), exception);
            }
        }

        return refunded;
    }
}
