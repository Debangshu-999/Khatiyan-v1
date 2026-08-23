package com.khatiyan.d_modules.staff.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.staff.model.SalaryAccount;

@Repository
public interface SalaryAccountRepository extends JpaRepository<SalaryAccount, UUID> {

    Optional<SalaryAccount> findByPropertyManagerId(UUID propertyManagerId);

    Optional<SalaryAccount> findByStaffMemberId(UUID staffMemberId);

    Optional<SalaryAccount> findByReferenceCodeAndPropertyId(String referenceCode, UUID propertyId);

    List<SalaryAccount> findByPropertyIdAndActiveTrueOrderByCreatedAtDesc(UUID propertyId);

    /** Open, un-settled accounts across all properties — used by scheduled jobs. */
    List<SalaryAccount> findByActiveTrueAndSettledOnIsNull();

    /**
     * Live accounts for one property. The unscoped version above walks every
     * account in the system, which is right for a nightly scan and wrong for a
     * dashboard read.
     */
    List<SalaryAccount> findByPropertyIdAndActiveTrueAndSettledOnIsNull(UUID propertyId);
}
