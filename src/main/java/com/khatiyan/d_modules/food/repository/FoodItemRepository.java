package com.khatiyan.d_modules.food.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodItem;

@Repository
public interface FoodItemRepository extends JpaRepository<FoodItem, UUID> {

    Optional<FoodItem> findByIdAndActiveTrue(UUID id);

    Optional<FoodItem> findByPropertyIdAndNameIgnoreCaseAndActiveTrue(UUID propertyId, String name);

    /**
     * Everything the owner can still see, retired items included.
     *
     * <p>Removed rows are excluded: they stay in the table only so the menu
     * history that references them survives.
     */
    List<FoodItem> findByPropertyIdAndDeletedAtIsNullOrderByActiveDescNameAsc(UUID propertyId);

    Optional<FoodItem> findByIdAndDeletedAtIsNull(UUID id);

    long countByPropertyIdAndActiveTrue(UUID propertyId);
}
