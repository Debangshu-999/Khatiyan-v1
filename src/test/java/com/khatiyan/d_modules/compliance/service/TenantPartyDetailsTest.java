package com.khatiyan.d_modules.compliance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.api.dto.UserIdentityResponse;
import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckedParticulars;

class TenantPartyDetailsTest {
    private static final LocalDate START = LocalDate.of(2026, 10, 9);

    private UserIdentityResponse account(LocalDate dob, Gender gender) {
        return new UserIdentityResponse(UUID.randomUUID(), "Tenant Name", "+919800000001", null, false,
                "12 Park Street", "700016", dob, gender, true, false, false);
    }

    @Test
    void ekycOnboardingAllowsDateOfBirthAndGenderToBeAbsent() {
        PartyDetails party = TenancyAgreementService.tenantPartyDetails(account(null, null), START, IdCheckedParticulars.NONE);
        assertThat(party.age()).isNull();
        assertThat(party.gender()).isNull();
        assertThat(party.known()).isTrue();
        assertThat(party.name()).isEqualTo("Tenant Name");
    }

    @Test
    void ekycOnboardingUsesExistingAccountParticularsWhenPresent() {
        PartyDetails party = TenancyAgreementService.tenantPartyDetails(
                account(LocalDate.of(1998, 4, 17), Gender.MALE), START, IdCheckedParticulars.NONE);
        assertThat(party.age()).isEqualTo(28);
        assertThat(party.gender()).isEqualTo("Male");
    }

    @Test
    void manualOnboardingUsesCheckedParticulars() {
        PartyDetails party = TenancyAgreementService.tenantPartyDetails(account(null, null), START,
                new IdCheckedParticulars(Gender.FEMALE, LocalDate.of(2000, 10, 10)));
        assertThat(party.age()).isEqualTo(25);
        assertThat(party.gender()).isEqualTo("Female");
    }
}
