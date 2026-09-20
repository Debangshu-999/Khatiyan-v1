package com.khatiyan.d_modules.food;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.food.service.FoodModuleSettingService;

/** Public facade for cross-module food-management questions. */
@Component
public class FoodModule {

    private final FoodModuleSettingService settingService;

    public FoodModule(FoodModuleSettingService settingService) {
        this.settingService = settingService;
    }

    public boolean isManagementEnabled(UUID propertyId) {
        return settingService.isUsable(propertyId);
    }
}
