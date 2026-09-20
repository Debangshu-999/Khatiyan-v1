package com.khatiyan.d_modules.food.repository;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodMenuEntry;
import com.khatiyan.d_modules.property.model.MealType;

@Repository
public interface FoodMenuEntryRepository extends JpaRepository<FoodMenuEntry, UUID> {

    Optional<FoodMenuEntry> findByIdAndActiveTrue(UUID id);

    Optional<FoodMenuEntry> findByProfileIdAndDayOfWeekAndMealTypeAndItemIdAndActiveTrue(
            UUID profileId,
            DayOfWeek dayOfWeek,
            MealType mealType,
            UUID itemId);

    List<FoodMenuEntry> findByProfileIdAndActiveTrue(UUID profileId);

    List<FoodMenuEntry> findByPropertyIdAndDayOfWeekAndMealTypeAndActiveTrueOrderByDisplayOrderAsc(
            UUID propertyId,
            DayOfWeek dayOfWeek,
            MealType mealType);

    boolean existsByItemIdAndActiveTrue(UUID itemId);
}
