package com.khatiyan.d_modules.compliance.api.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.servicebalance.model.ServiceCode;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * The exact bodies the app sends, read the way the server reads them.
 *
 * <p>Plain Jackson, no Spring. A body that fails to deserialize comes back as
 * an unexplained 400 — the handler tells the client "malformed" and, until
 * recently, told the log nothing at all. Pinning both routes here catches that
 * on a laptop in a second instead of on a device with a tenant waiting.
 */
class OnboardTenancyWithAgreementRequestJsonTest {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    /** The route where the owner checked an ID themselves. */
    @Test
    void aDeclaredIdCheckIsRead() {
        OnboardTenancyWithAgreementRequest request = MAPPER.readValue("""
                {
                  "tenantPhone": "+919800000002",
                  "tenantName": "Rajesh Kumar Sharma",
                  "propertyId": "11111111-1111-1111-1111-111111111111",
                  "roomId": "22222222-2222-2222-2222-222222222222",
                  "rentAmountPaise": 800000,
                  "depositAmountPaise": 1600000,
                  "startDate": "2026-10-01",
                  "idCheck": { "confirmed": true, "documentType": "PASSPORT", "lastFour": "4417" },
                  "idCheckStatementText": "I have checked their ID",
                  "verification": null,
                  "tenant": {
                    "permanentAddress": "12 Park Street",
                    "permanentAddressPincode": "700016",
                    "dateOfBirth": "1995-06-15",
                    "gender": null
                  }
                }
                """, OnboardTenancyWithAgreementRequest.class);

        assertThat(request.idCheck().confirmed()).isTrue();
        assertThat(request.verification()).isNull();
        assertThat(request.isIdentityRouteChosen()).isTrue();
    }

    /**
     * The route the app now sends for a KYC onboarding.
     *
     * <p>Note what is absent: there is no {@code idCheck} and no declaration
     * text, because the owner declares nothing — the tenant has not run the
     * check yet. The stand-in that used to send a fake declaration here is
     * gone, and this is the body that replaced it.
     */
    @Test
    void anOrderedVerificationIsRead() {
        OnboardTenancyWithAgreementRequest request = MAPPER.readValue("""
                {
                  "tenantPhone": "+919800000002",
                  "tenantName": "Rajesh Kumar Sharma",
                  "propertyId": "11111111-1111-1111-1111-111111111111",
                  "roomId": "22222222-2222-2222-2222-222222222222",
                  "rentAmountPaise": 800000,
                  "depositAmountPaise": 1600000,
                  "startDate": "2026-10-01",
                  "idCheck": null,
                  "idCheckStatementText": null,
                  "verification": [{ "serviceCode": "AADHAAR_OKYC", "attempts": 2 }],
                  "tenant": {
                    "permanentAddress": "12 Park Street",
                    "permanentAddressPincode": "700016",
                    "dateOfBirth": "1995-06-15",
                    "gender": null
                  }
                }
                """, OnboardTenancyWithAgreementRequest.class);

        assertThat(request.idCheck()).isNull();
        assertThat(request.verification()).hasSize(1);
        assertThat(request.verification().getFirst().serviceCode()).isEqualTo(ServiceCode.AADHAAR_OKYC);
        assertThat(request.verification().getFirst().attempts()).isEqualTo(2);
        assertThat(request.isIdentityRouteChosen()).isTrue();
    }

    /**
     * The cross-field rules, which are the reason either field may be absent.
     *
     * <p>Neither is the dangerous one: it would create a tenancy with nothing
     * established about who the tenant is.
     */
    @Test
    void neitherRouteIsRefusedAndBothRoutesAreRefused() {
        OnboardTenancyWithAgreementRequest neither = MAPPER.readValue("""
                {
                  "tenantPhone": "+919800000002",
                  "propertyId": "11111111-1111-1111-1111-111111111111",
                  "roomId": "22222222-2222-2222-2222-222222222222",
                  "startDate": "2026-10-01",
                  "tenant": {
                    "permanentAddress": "12 Park Street",
                    "permanentAddressPincode": "700016"
                  }
                }
                """, OnboardTenancyWithAgreementRequest.class);

        assertThat(neither.isIdentityRouteChosen()).isFalse();

        OnboardTenancyWithAgreementRequest both = MAPPER.readValue("""
                {
                  "tenantPhone": "+919800000002",
                  "propertyId": "11111111-1111-1111-1111-111111111111",
                  "roomId": "22222222-2222-2222-2222-222222222222",
                  "startDate": "2026-10-01",
                  "idCheck": { "confirmed": true, "documentType": "PASSPORT", "lastFour": "4417" },
                  "idCheckStatementText": "I have checked their ID",
                  "verification": [{ "serviceCode": "AADHAAR_OKYC", "attempts": 2 }],
                  "tenant": {
                    "permanentAddress": "12 Park Street",
                    "permanentAddressPincode": "700016"
                  }
                }
                """, OnboardTenancyWithAgreementRequest.class);

        assertThat(both.isIdentityRouteChosen()).isFalse();
    }

    /**
     * The failure that sent an owner an unexplained 400.
     *
     * <p>The app's catalogue offered PAN while the server's {@code ServiceCode}
     * carried only Aadhaar. An enum value Jackson cannot map does not arrive as
     * a field error naming the field — it makes the ENTIRE body unreadable, so
     * the owner was told their request was malformed with nothing to act on.
     *
     * <p>Pinned here so the next service added to the app's catalogue without a
     * matching enum constant fails on a laptop instead of on a device.
     */
    @Test
    void aServiceCodeTheServerDoesNotKnowBreaksTheWholeBody() {
        assertThatThrownBy(() -> MAPPER.readValue("""
                {
                  "tenantPhone": "+919800000002",
                  "propertyId": "11111111-1111-1111-1111-111111111111",
                  "roomId": "22222222-2222-2222-2222-222222222222",
                  "startDate": "2026-10-01",
                  "verification": [{ "serviceCode": "PAN", "attempts": 1 }],
                  "tenant": {
                    "permanentAddress": "12 Park Street",
                    "permanentAddressPincode": "700016"
                  }
                }
                """, OnboardTenancyWithAgreementRequest.class))
                .isInstanceOf(JacksonException.class);
    }

    /** Every code the app can send must be one the server can read. */
    @Test
    void everyServiceCodeTheAppOffersIsOneTheServerKnows() {
        // The app's catalogue is TypeScript, so this asserts the one direction
        // that can be checked from here: the enum is what the app must match.
        assertThat(ServiceCode.values()).containsExactly(ServiceCode.AADHAAR_OKYC);
    }
}
