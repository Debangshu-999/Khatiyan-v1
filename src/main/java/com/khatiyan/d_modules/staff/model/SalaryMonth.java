package com.khatiyan.d_modules.staff.model;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.employment.SalaryStructure;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Monthly salary snapshot, including the rate and daily payable-days input
 * used.
 */
@Entity
@Table(name = "salary_months", schema = "staff")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SalaryMonth extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "salary_account_id", nullable = false, updatable = false)
    private UUID salaryAccountId;

    @Column(name = "payroll_month", nullable = false, updatable = false)
    private LocalDate payrollMonth;

    @Column(name = "opened_on", nullable = false, updatable = false)
    private LocalDate openedOn;

    @Enumerated(EnumType.STRING)
    @Column(name = "salary_structure", nullable = false, updatable = false)
    private SalaryStructure salaryStructure;

    @Column(name = "salary_rate_paise", nullable = false, updatable = false)
    private long salaryRatePaise;

    @Column(name = "payable_days")
    private Integer payableDays;

    @Column(name = "base_amount_paise", nullable = false)
    private long baseAmountPaise;

    @Column(name = "additions_amount_paise", nullable = false)
    private long additionsAmountPaise;

    @Column(name = "deductions_amount_paise", nullable = false)
    private long deductionsAmountPaise;

    @Column(name = "gross_amount_paise", nullable = false)
    private long grossAmountPaise;

    @Column(name = "net_amount_paise", nullable = false)
    private long netAmountPaise;

    @Column(name = "paid_amount_paise", nullable = false)
    private long paidAmountPaise;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false)
    private SalaryPaymentStatus paymentStatus;

    public static SalaryMonth open(
            UUID salaryAccountId,
            LocalDate payrollMonth,
            LocalDate openedOn,
            SalaryStructure salaryStructure,
            long salaryRatePaise,
            Integer payableDays,
            long baseAmountPaise) {
        SalaryMonth month = new SalaryMonth();
        month.id = UUID.randomUUID();
        month.salaryAccountId = salaryAccountId;
        month.payrollMonth = payrollMonth;
        month.openedOn = openedOn;
        month.salaryStructure = salaryStructure;
        month.salaryRatePaise = salaryRatePaise;
        month.payableDays = payableDays;
        month.baseAmountPaise = baseAmountPaise;
        month.additionsAmountPaise = 0;
        month.deductionsAmountPaise = 0;
        month.grossAmountPaise = baseAmountPaise;
        month.netAmountPaise = baseAmountPaise;
        month.paidAmountPaise = 0;
        month.paymentStatus = SalaryPaymentStatus.UNPAID;
        return month;
    }

    public void recalculate(long additionsAmountPaise, long deductionsAmountPaise, long paidAmountPaise) {
        long gross = baseAmountPaise + additionsAmountPaise;
        if (deductionsAmountPaise > gross) {
            throw new IllegalArgumentException("Salary deductions cannot exceed gross salary");
        }
        long net = gross - deductionsAmountPaise;
        if (paidAmountPaise > net) {
            throw new IllegalArgumentException("Recorded salary payments cannot exceed the net salary");
        }
        this.additionsAmountPaise = additionsAmountPaise;
        this.deductionsAmountPaise = deductionsAmountPaise;
        this.grossAmountPaise = gross;
        this.netAmountPaise = net;
        this.paidAmountPaise = paidAmountPaise;
        this.paymentStatus = paidAmountPaise == 0
                ? SalaryPaymentStatus.UNPAID
                : SalaryPaymentStatus.PAID;
    }

}
