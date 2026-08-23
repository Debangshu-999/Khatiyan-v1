package com.khatiyan.d_modules.discovery.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.discovery.model.PropertyContactManager;

public interface PropertyContactManagerRepository extends JpaRepository<PropertyContactManager, UUID> {

    List<PropertyContactManager> findByPropertyIdOrderByCreatedAtAsc(UUID propertyId);

    Optional<PropertyContactManager> findByPropertyIdAndManagerUserId(UUID propertyId, UUID managerUserId);

    boolean existsByPropertyIdAndManagerUserId(UUID propertyId, UUID managerUserId);
}
