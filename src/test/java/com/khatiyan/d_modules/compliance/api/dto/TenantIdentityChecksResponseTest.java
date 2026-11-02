package com.khatiyan.d_modules.compliance.api.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.servicebalance.model.ServiceCode;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckRecord;
import com.khatiyan.d_modules.verification.model.VerificationGrant;
import com.khatiyan.d_modules.verification.model.VerificationGrantStatus;

/** What the tenant profile is told about how a tenant was verified (2026-10-31). */
class TenantIdentityChecksResponseTest {

    private static VerificationGrant grant(VerificationGrantStatus status) {
        VerificationGrant grant = mock(VerificationGrant.class);
        when(grant.getId()).thenReturn(UUID.randomUUID());
        when(grant.getTenancyId()).thenReturn(UUID.randomUUID());
        when(grant.getServiceCode()).thenReturn(ServiceCode.AADHAAR);
        when(grant.getStatus()).thenReturn(status);
        return grant;
    }

    @Test
    void nothingOnRecordComesBackEmptySoTheProfileSaysNotVerified() {
        TenantIdentityChecksResponse response = TenantIdentityChecksResponse.of(List.of(), null, null, false);

        assertThat(response.ekycChecks()).isEmpty();
        assertThat(response.manualCheck()).isNull();
        assertThat(response.verifiedBeforeKhatiyan()).isFalse();
    }

    @Test
    void aCancelledCheckIsLeftOutAndTheRestAreKept() {
        TenantIdentityChecksResponse response = TenantIdentityChecksResponse.of(
                List.of(
                        grant(VerificationGrantStatus.CANCELLED),
                        grant(VerificationGrantStatus.EXHAUSTED),
                        grant(VerificationGrantStatus.VERIFIED)),
                null,
                null,
                false);

        assertThat(response.ekycChecks()).extracting(check -> check.status())
                .containsExactly("EXHAUSTED", "VERIFIED");
    }

    @Test
    void aManualCheckCarriesWhatWasCheckedAndWhoCheckedIt() {
        Instant at = Instant.parse("2026-10-01T05:00:00Z");

        TenantIdentityChecksResponse response = TenantIdentityChecksResponse.of(
                List.of(),
                new IdCheckRecord("PASSPORT", "7635", Gender.FEMALE, true, at, UUID.randomUUID()),
                "Asha Roy",
                false);

        assertThat(response.manualCheck()).isEqualTo(new TenantIdentityChecksResponse.ManualCheck(
                "PASSPORT", "7635", Gender.FEMALE, true, at, "Asha Roy"));
    }
}
