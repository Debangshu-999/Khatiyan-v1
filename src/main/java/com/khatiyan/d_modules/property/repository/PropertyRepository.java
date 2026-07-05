package com.khatiyan.d_modules.property.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.property.model.Property;

/**
 * Persistence access for owner-managed properties.
 *
 * <p>Most reads should filter by {@code active = true} because properties
 * are deactivated instead of deleted, preserving history for tenancy and
 * billing records.
 */
@Repository
public interface PropertyRepository extends JpaRepository<Property, UUID> {

    Optional<Property> findByIdAndActiveTrue(UUID id);

    Optional<Property> findByReferenceCodeAndActiveTrue(String referenceCode);

    List<Property> findByActiveTrue();

    List<Property> findByOwnerIdAndActiveTrue(UUID ownerId);

    List<Property> findByIdInAndActiveTrue(Collection<UUID> ids);

    boolean existsByIdAndOwnerIdAndActiveTrue(UUID id, UUID ownerId);

    /** Active properties still missing coordinates — the geo backfill queue. */
    List<Property> findByActiveTrueAndLatitudeIsNull();
}
