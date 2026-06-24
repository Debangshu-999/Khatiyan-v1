package com.khatiyan.d_modules.staff.model;

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

/** Auditable addition or deduction applied to a salary month. */
@Entity
@Table(name = "salary_adjustments", schema = "staff")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SalaryAdjustment extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "salary_month_id", nullable = false, updatable = false)
    private UUID salaryMonthId;

    @Enumerated(EnumType.STRING)
    @Column(name = "adjustment_type", nullable = false)
    private SalaryAdjustmentType adjustmentType;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(nullable = false)
    private String reason;

    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private UUID createdByUserId;
    public static SalaryAdjustment create(
            UUID salaryMonthId,
            SalaryAdjustmentType adjustmentType,
            long amountPaise,
            String reason,
            UUID createdByUserId) {
        SalaryAdjustment adjustment = new SalaryAdjustment();
        adjustment.id = UUID.randomUUID();
        adjustment.salaryMonthId = salaryMonthId;
        adjustment.adjustmentType = adjustmentType;
        adjustment.amountPaise = amountPaise;
        adjustment.reason = reason;
        adjustment.createdByUserId = createdByUserId;
        return adjustment;
    }

    public void amend(SalaryAdjustmentType adjustmentType, long amountPaise, String reason) {
        this.adjustmentType = adjustmentType;
        this.amountPaise = amountPaise;
        this.reason = reason;
    }

}
