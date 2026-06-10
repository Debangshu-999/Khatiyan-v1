package com.khatiyan.d_modules.billing.repository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.billing.model.BillingMonthlyReport;

public interface BillingMonthlyReportRepository extends JpaRepository<BillingMonthlyReport, UUID> {

    Optional<BillingMonthlyReport> findByPropertyIdAndReportMonth(UUID propertyId, LocalDate reportMonth);

    boolean existsByPropertyIdAndReportMonth(UUID propertyId, LocalDate reportMonth);
}
