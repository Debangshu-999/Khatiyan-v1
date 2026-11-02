package com.khatiyan.d_modules.tenancy.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.d_modules.tenancy.model.Tenancy;

class TenancyResponsePhotoTest {

    private final Tenancy tenancy = Tenancy.start(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
            UUID.randomUUID(), 12_000_00, 10_000_00, LocalDate.of(2026, 8, 20));

    @Test
    void theTenancyCarriesTheTenantsProfilePhoto() {
        assertThat(TenancyResponse.from(tenancy, user("https://photos.example/a.jpg")).tenantPhotoUrl())
                .isEqualTo("https://photos.example/a.jpg");
    }

    @Test
    void withNoPhotoOrNoAccountThereIsNothingToShow() {
        assertThat(TenancyResponse.from(tenancy, user(null)).tenantPhotoUrl()).isNull();
        assertThat(TenancyResponse.from(tenancy, null).tenantPhotoUrl()).isNull();
        assertThat(TenancyResponse.from(tenancy).tenantPhotoUrl()).isNull();
    }

    private static UserSummaryResponse user(String photo) {
        return new UserSummaryResponse(UUID.randomUUID(), "+919000000000", null, "Asha Das", photo, null,
                true, true, true, false, true);
    }
}
