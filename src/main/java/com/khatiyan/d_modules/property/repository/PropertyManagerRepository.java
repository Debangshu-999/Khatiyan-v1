package com.khatiyan.d_modules.property.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.property.model.PropertyManager;

/**
 * Persistence access for property manager assignments.
 */
@Repository
public interface PropertyManagerRepository extends JpaRepository<PropertyManager, UUID> {

    boolean existsByPropertyIdAndManagerUserIdAndActiveTrue(UUID propertyId, UUID managerUserId);

    List<PropertyManager> findByPropertyIdAndActiveTrue(UUID propertyId);

    /** All active manager assignments across every property — for scheduled payroll jobs. */
    List<PropertyManager> findByActiveTrue();

    /** Still active, but their scheduled last working day has arrived or passed. */
    List<PropertyManager> findByActiveTrueAndEmploymentEndDateLessThanEqual(LocalDate onOrBefore);

    List<PropertyManager> findByPropertyIdAndActiveFalse(UUID propertyId);

    @Query("""
        SELECT manager.managerUserId
        FROM PropertyManager manager
        WHERE manager.propertyId = :propertyId
          AND manager.active = true
        ORDER BY manager.createdAt ASC
    """)
    List<UUID> findActiveManagerUserIdsByPropertyId(UUID propertyId);

    Optional<PropertyManager> findByPropertyIdAndManagerUserIdAndActiveTrue(
            UUID propertyId,
            UUID managerUserId);

    Optional<PropertyManager> findByPropertyIdAndReferenceCodeAndActiveTrue(
            UUID propertyId,
            String referenceCode);

    boolean existsByManagerUserIdAndActiveTrue(UUID managerUserId);

    @Query("""
        SELECT manager.propertyId
        FROM PropertyManager manager
        WHERE manager.managerUserId = :managerUserId
          AND manager.active = true
    """)
    List<UUID> findActivePropertyIdsByManagerUserId(UUID managerUserId);
}
