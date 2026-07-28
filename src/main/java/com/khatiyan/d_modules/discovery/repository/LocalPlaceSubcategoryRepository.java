package com.khatiyan.d_modules.discovery.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.khatiyan.d_modules.discovery.model.LocalPlaceSubcategory;

public interface LocalPlaceSubcategoryRepository extends JpaRepository<LocalPlaceSubcategory, UUID> {

    // Global curated rows plus this property's custom rows.
    @Query("SELECT s FROM LocalPlaceSubcategory s WHERE s.propertyId IS NULL OR s.propertyId = :propertyId")
    List<LocalPlaceSubcategory> findVisibleForProperty(@Param("propertyId") UUID propertyId);

    List<LocalPlaceSubcategory> findByIdIn(Collection<UUID> ids);
}
