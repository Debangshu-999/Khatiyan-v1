package com.khatiyan.d_modules.staff.model;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** A manually recorded salary payment; it does not initiate money movement. */
@Entity
@Table(name = "salary_payments", schema = "staff")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SalaryPayment extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "salary_month_id", nullable = false, updatable = false)
    private UUID salaryMonthId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "paid_on", nullable = false)
    private LocalDate paidOn;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false)
    private SalaryPaymentMethod paymentMethod;

    @Column(name = "reference_text")
    private String referenceText;

    @Column(nullable = false)
    private String notes;

    @Column(name = "recorded_by_user_id", nullable = false, updatable = false)
    private UUID recordedByUserId;
    public static SalaryPayment record(
            UUID salaryMonthId,
            long amountPaise,
            LocalDate paidOn,
            SalaryPaymentMethod paymentMethod,
            String referenceText,
            String notes,
            UUID recordedByUserId) {
        SalaryPayment payment = new SalaryPayment();
        payment.id = UUID.randomUUID();
        payment.salaryMonthId = salaryMonthId;
        payment.amountPaise = amountPaise;
        payment.paidOn = paidOn;
        payment.paymentMethod = paymentMethod;
        payment.referenceText = referenceText;
        payment.notes = notes;
        payment.recordedByUserId = recordedByUserId;
        return payment;
    }

}
