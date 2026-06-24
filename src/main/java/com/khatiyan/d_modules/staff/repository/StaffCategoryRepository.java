package com.khatiyan.d_modules.staff.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.staff.model.StaffCategory;

@Repository
public interface StaffCategoryRepository extends JpaRepository<StaffCategory, UUID> {

    List<StaffCategory> findByPropertyIdAndActiveTrueOrderByNameAsc(UUID propertyId);

    Optional<StaffCategory> findByIdAndPropertyId(UUID id, UUID propertyId);

    boolean existsByPropertyIdAndNormalizedName(UUID propertyId, String normalizedName);

    boolean existsByPropertyIdAndSystemKey(UUID propertyId, String systemKey);
}
