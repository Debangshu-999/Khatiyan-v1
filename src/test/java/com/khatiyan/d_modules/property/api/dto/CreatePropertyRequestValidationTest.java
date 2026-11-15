package com.khatiyan.d_modules.property.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.SharingType;

import jakarta.validation.Validation;

/**
 * "Can tenants have visitors?" is answered at registration, yes or no (user,
 * 2026-11-08). It shows on the property profile and is the visitor logbook's
 * own switch, so it may not be left blank.
 */
class CreatePropertyRequestValidationTest {

    @Test
    void aNewPropertyMustSayWhetherVisitorsAreAllowed() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(request(null))).anySatisfy(violation ->
                    assertThat(violation.getPropertyPath().toString()).isEqualTo("visitorsAllowed"));
            assertThat(validator.validate(request(true))).isEmpty();
            assertThat(validator.validate(request(false))).isEmpty();
        }
    }

    private static CreatePropertyRequest request(Boolean visitorsAllowed) {
        return new CreatePropertyRequest(
                "Sky Prime PG", "Plot 1", "Madhapur", "Hyderabad", "Telangana", "500046",
                new BigDecimal("17.4500000"), new BigDecimal("78.3800000"),
                PropertyType.PG, PgFor.ANYONE, PreferredTenantType.STUDENT,
                true, Set.of(MealType.BREAKFAST, MealType.DINNER), true, BathroomType.COMMON,
                Set.of(SharingType.DOUBLE), Set.of(PropertyFacility.WIFI, PropertyFacility.MESS), Set.of("Ironing"),
                2_000_00L, 1_500_00L, 100_00L, 4, 10_000_00L, NoticePeriod.ONE_MONTH,
                visitorsAllowed,
                "Near metro PG", "Clean managed PG near metro.", "https://cdn.example.com/pg.jpg",
                List.of(new CreatePropertyRequest.DiscoveryImage("https://cdn.example.com/pg.jpg", "pg")));
    }
}
