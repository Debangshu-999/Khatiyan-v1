package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.List;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * The tenant's stay outs, and what the declare sheet needs: whether their stay
 * can have one (a monthly stay at a PG or hostel), the meals the property
 * serves in the order of the day, and the checkout date to come back by.
 */
public record StayOutListResponse(
        boolean available,
        List<MealType> meals,
        LocalDate checkoutDate,
        List<StayOutResponse> stayOuts) {
}
