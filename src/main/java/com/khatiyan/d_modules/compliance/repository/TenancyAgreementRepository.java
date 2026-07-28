package com.khatiyan.d_modules.compliance.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.compliance.model.AgreementStatus;
import com.khatiyan.d_modules.compliance.model.TenancyAgreement;

public interface TenancyAgreementRepository extends JpaRepository<TenancyAgreement, UUID> {

    Optional<TenancyAgreement> findByTenancyId(UUID tenancyId);

    List<TenancyAgreement> findByStatusAndCreatedAtBefore(AgreementStatus status, Instant cutoff);
}
