package com.khatiyan.d_modules.food.api.dto;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record SaveFoodMenuEntryRequest(
        @NotNull UUID itemId,
        @NotNull DayOfWeek dayOfWeek,
        @NotNull MealType mealType,
        @NotNull @DecimalMin(value = "0.001") @Digits(integer = 9, fraction = 3)
        BigDecimal baseQuantityPerSubscriber,
        @DecimalMin(value = "0.000") @Digits(integer = 9, fraction = 3)
        BigDecimal repeatQuantity,
        @Min(0) @Max(100) Integer expectedRepeatPercentage,
        @DecimalMin(value = "0.000") @Digits(integer = 9, fraction = 3)
        BigDecimal fixedBufferQuantity,
        @DecimalMin(value = "0.001") @Digits(integer = 9, fraction = 3)
        BigDecimal batchSize,
        @Min(0) Integer displayOrder
) {
}
