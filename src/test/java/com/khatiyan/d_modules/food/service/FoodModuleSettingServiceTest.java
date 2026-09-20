package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.model.FoodModuleSetting;
import com.khatiyan.d_modules.food.repository.FoodModuleSettingRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.MealType;

@ExtendWith(MockitoExtension.class)
class FoodModuleSettingServiceTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock private PropertyModule propertyModule;
    @Mock private FoodAccessPolicy accessPolicy;
    @Mock private FoodModuleSettingRepository settingRepository;
    private FoodModuleSettingService service;

    @BeforeEach
    void setUp() {
        service = new FoodModuleSettingService(propertyModule, accessPolicy, settingRepository);
    }

    @Test
    void cannotEnableModuleWhenPropertyDoesNotOfferFood() {
        PropertyResponse property = FoodTestFixtures.property(PROPERTY, false, Set.of());
        when(propertyModule.getActiveProperty(PROPERTY)).thenReturn(property);

        assertThatThrownBy(() -> service.update(ACTOR, PROPERTY, true))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Food settings are not available for this property");

        verify(settingRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void moduleToggleDoesNotModifyPropertyFoodSettings() {
        PropertyResponse property = FoodTestFixtures.property(
                PROPERTY, true, Set.of(MealType.BREAKFAST, MealType.DINNER));
        when(propertyModule.getActiveProperty(PROPERTY)).thenReturn(property);
        FoodModuleSetting current = FoodModuleSetting.create(PROPERTY, true);
        when(settingRepository.findById(PROPERTY)).thenReturn(Optional.of(current));
        when(settingRepository.save(current)).thenReturn(current);

        PropertyResponse response = service.update(ACTOR, PROPERTY, false);

        assertThat(response).isSameAs(property);
        assertThat(current.isEnabled()).isFalse();
        verify(propertyModule).getActiveProperty(PROPERTY);
    }
}
