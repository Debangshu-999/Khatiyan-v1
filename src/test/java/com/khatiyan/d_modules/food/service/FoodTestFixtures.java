package com.khatiyan.d_modules.food.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

final class FoodTestFixtures {

    private FoodTestFixtures() {
    }

    static PropertyResponse property(UUID propertyId, boolean foodAvailable, Set<MealType> meals) {
        return new PropertyResponse(
                propertyId,
                "PROP-TEST",
                UUID.randomUUID(),
                "Test Property",
                "Address",
                "Area",
                "City",
                "State",
                "700001",
                null,
                null,
                PropertyType.PG,
                PgFor.ANYONE,
                PreferredTenantType.ANYONE,
                foodAvailable,
                meals,
                false,
                BathroomType.COMMON,
                Set.of(),
                Set.of(),
                Set.of(),
                null,
                null,
                0L,
                BillingCollectionTiming.CYCLE_START,
                0,
                0L,
                NoticePeriod.ONE_MONTH,
                0,
                null,
                null,
                false,
                true);
    }

    static TenancyResponse tenancy(UUID tenancyId, UUID tenantUserId, UUID propertyId) {
        return new TenancyResponse(
                tenancyId,
                "TEN-TEST",
                tenantUserId,
                "Tenant",
                "9876543210",
                true,
                true,
                propertyId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                TenancyBillingType.MONTHLY,
                10_000L,
                10_000L,
                null,
                LocalDate.now(),
                null,
                null,
                TenancyStatus.ACTIVE,
                Instant.now(),
                true,
                true,
                false,
                null,
                null,
                null,
                true,
                Instant.now(),
                false,
                null,
                null,
                null,
                null);
    }
}
