package com.khatiyan.d_modules.food.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodMealTiming;

@Repository
public interface FoodMealTimingRepository extends JpaRepository<FoodMealTiming, UUID> {

    List<FoodMealTiming> findByPropertyId(UUID propertyId);
}
