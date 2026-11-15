package com.khatiyan.d_modules.food;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.food.repository.MealRatingStore;
import com.khatiyan.d_modules.food.service.FoodModuleSettingService;
import com.khatiyan.d_modules.food.service.MealRatingService;

/** Public facade for cross-module food-management questions. */
@Component
public class FoodModule {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final FoodModuleSettingService settingService;
    private final MealRatingStore ratingStore;
    private final Clock clock;

    public FoodModule(FoodModuleSettingService settingService, MealRatingStore ratingStore, Clock clock) {
        this.settingService = settingService;
        this.ratingStore = ratingStore;
        this.clock = clock;
    }

    public boolean isManagementEnabled(UUID propertyId) {
        return settingService.isUsable(propertyId);
    }

    /**
     * The figure the owner's Overall rating shows: the last 30 days, to two places. Null
     * with no ratings, or once the owner has stopped managing food, as it would go stale.
     */
    public Double currentMealRating(UUID propertyId) {
        if (!settingService.isUsable(propertyId)) {
            return null;
        }
        LocalDate today = LocalDate.now(clock.withZone(IST));
        Double average = ratingStore.average(propertyId, today.minusDays(MealRatingService.RATING_DAYS - 1L), today);
        return average == null ? null : Math.round(average * 100) / 100.0;
    }
}
