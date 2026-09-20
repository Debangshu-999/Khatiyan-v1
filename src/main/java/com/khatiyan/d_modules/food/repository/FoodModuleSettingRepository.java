package com.khatiyan.d_modules.food.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodModuleSetting;

@Repository
public interface FoodModuleSettingRepository extends JpaRepository<FoodModuleSetting, UUID> {
}
