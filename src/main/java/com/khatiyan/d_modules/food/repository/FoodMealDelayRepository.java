package com.khatiyan.d_modules.food.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodMealDelay;

@Repository
public interface FoodMealDelayRepository extends JpaRepository<FoodMealDelay, UUID> {

    List<FoodMealDelay> findByPropertyIdAndMealDate(UUID propertyId, LocalDate mealDate);
}
