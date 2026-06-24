package com.khatiyan.d_modules.staff.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.staff.model.StaffMember;

@Repository
public interface StaffMemberRepository extends JpaRepository<StaffMember, UUID> {

    List<StaffMember> findByPropertyIdAndActiveTrueOrderByFullNameAsc(UUID propertyId);

    /** All active staff across every property — used by scheduled payroll jobs. */
    List<StaffMember> findByActiveTrue();

    List<StaffMember> findByPropertyIdOrderByFullNameAsc(UUID propertyId);

    Optional<StaffMember> findByIdAndPropertyId(UUID id, UUID propertyId);
}
