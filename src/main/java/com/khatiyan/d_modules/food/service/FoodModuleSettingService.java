package com.khatiyan.d_modules.food.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.model.FoodModuleSetting;
import com.khatiyan.d_modules.food.repository.FoodModuleSettingRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

@Service
public class FoodModuleSettingService {

    private final PropertyModule propertyModule;
    private final FoodAccessPolicy accessPolicy;
    private final FoodModuleSettingRepository settingRepository;

    public FoodModuleSettingService(
            PropertyModule propertyModule,
            FoodAccessPolicy accessPolicy,
            FoodModuleSettingRepository settingRepository) {
        this.propertyModule = propertyModule;
        this.accessPolicy = accessPolicy;
        this.settingRepository = settingRepository;
    }

    @Transactional(readOnly = true)
    public boolean isEnabled(UUID propertyId) {
        return settingRepository.findById(propertyId)
                .map(FoodModuleSetting::isEnabled)
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean isUsable(UUID propertyId) {
        return propertyModule.getActiveProperty(propertyId).foodIncluded() && isEnabled(propertyId);
    }

    @Transactional
    public PropertyResponse update(UUID actorUserId, UUID propertyId, boolean enabled) {
        accessPolicy.ensureCanManage(actorUserId, propertyId);
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        if (enabled && !property.foodIncluded()) {
            throw new ValidationException("Food settings are not available for this property");
        }
        FoodModuleSetting setting = settingRepository.findById(propertyId)
                .orElseGet(() -> FoodModuleSetting.create(propertyId, false));
        setting.setEnabled(enabled);
        settingRepository.save(setting);
        return property;
    }

    @Transactional(readOnly = true)
    public PropertyResponse requireUsable(UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        if (!property.foodIncluded()) {
            throw new ValidationException("Food settings are not available for this property");
        }
        if (!isEnabled(propertyId)) {
            throw new ValidationException("Food management is turned off for this property");
        }
        return property;
    }
}
