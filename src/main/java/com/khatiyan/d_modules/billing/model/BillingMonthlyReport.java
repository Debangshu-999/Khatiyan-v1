package com.khatiyan.d_modules.billing.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Finalized month-wise billing CSV generated after a month closes.
 */
@Entity
@Table(name = "billing_monthly_reports", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BillingMonthlyReport extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "report_month", nullable = false)
    private LocalDate reportMonth;

    @Column(name = "csv_content", nullable = false, columnDefinition = "TEXT")
    private String csvContent;

    @Column(name = "cycle_count", nullable = false)
    private long cycleCount;

    @Column(name = "total_collectable_paise", nullable = false)
    private long totalCollectablePaise;

    @Column(name = "total_collected_paise", nullable = false)
    private long totalCollectedPaise;

    @Column(name = "total_pending_paise", nullable = false)
    private long totalPendingPaise;

    @Column(name = "total_discount_paise", nullable = false)
    private long totalDiscountPaise;

    @Column(name = "manual_collected_paise", nullable = false)
    private long manualCollectedPaise;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    private BillingMonthlyReport(
            UUID propertyId,
            LocalDate reportMonth,
            String csvContent,
            long cycleCount,
            long totalCollectablePaise,
            long totalCollectedPaise,
            long totalPendingPaise,
            long totalDiscountPaise,
            long manualCollectedPaise,
            Instant generatedAt) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.reportMonth = reportMonth;
        this.csvContent = csvContent;
        this.cycleCount = cycleCount;
        this.totalCollectablePaise = totalCollectablePaise;
        this.totalCollectedPaise = totalCollectedPaise;
        this.totalPendingPaise = totalPendingPaise;
        this.totalDiscountPaise = totalDiscountPaise;
        this.manualCollectedPaise = manualCollectedPaise;
        this.generatedAt = generatedAt;
    }

    public static BillingMonthlyReport create(
            UUID propertyId,
            LocalDate reportMonth,
            String csvContent,
            long cycleCount,
            long totalCollectablePaise,
            long totalCollectedPaise,
            long totalPendingPaise,
            long totalDiscountPaise,
            long manualCollectedPaise,
            Instant generatedAt) {
        return new BillingMonthlyReport(
                propertyId,
                reportMonth,
                csvContent,
                cycleCount,
                totalCollectablePaise,
                totalCollectedPaise,
                totalPendingPaise,
                totalDiscountPaise,
                manualCollectedPaise,
                generatedAt);
    }
}
