package com.khatiyan.d_modules.discovery.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.khatiyan.d_modules.discovery.model.LocalPlaceCategory;

public interface LocalPlaceCategoryRepository extends JpaRepository<LocalPlaceCategory, UUID> {

    // Global curated categories plus this property's custom categories, ordered.
    @Query("SELECT c FROM LocalPlaceCategory c WHERE c.propertyId IS NULL OR c.propertyId = :propertyId "
            + "ORDER BY c.displayOrder ASC")
    List<LocalPlaceCategory> findVisibleForProperty(@Param("propertyId") UUID propertyId);
}
