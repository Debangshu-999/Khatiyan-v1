package com.khatiyan.d_modules.property.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.property.model.ManagerPermission;

public interface ManagerPermissionRepository extends JpaRepository<ManagerPermission, UUID> {

    /** Every grant for one manager on one property — the policy loads these together. */
    List<ManagerPermission> findByPropertyIdAndManagerUserId(UUID propertyId, UUID managerUserId);

    List<ManagerPermission> findByPropertyId(UUID propertyId);

    /** Removing a manager takes their grants with them, so re-adding starts clean. */
    void deleteByPropertyIdAndManagerUserId(UUID propertyId, UUID managerUserId);
}
