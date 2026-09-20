package com.khatiyan.d_modules.food.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodDailySkip;
import com.khatiyan.d_modules.property.model.MealType;

@Repository
public interface FoodDailySkipRepository extends JpaRepository<FoodDailySkip, UUID> {

    List<FoodDailySkip> findByPropertyIdAndSkipDateAndMealType(
            UUID propertyId, LocalDate skipDate, MealType mealType);

    Optional<FoodDailySkip> findByPropertyIdAndSkipDateAndMealTypeAndItemId(
            UUID propertyId, LocalDate skipDate, MealType mealType, UUID itemId);
}
