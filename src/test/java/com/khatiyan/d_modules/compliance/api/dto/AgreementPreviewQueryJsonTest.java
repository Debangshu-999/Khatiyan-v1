package com.khatiyan.d_modules.compliance.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

/**
 * The preview body as each screen actually sends it.
 *
 * <p>Onboarding omits {@code templateOnly} entirely — it is previewing one
 * tenancy's deed, not the property's template. Under Jackson 2 a missing
 * primitive read as {@code false}; Boot 4 moved the web layer to Jackson 3,
 * which enables {@code FAIL_ON_NULL_FOR_PRIMITIVES} and refuses the whole body
 * with "Cannot map `null` into type `boolean`". Every preview on the onboarding
 * screen then came back 400, and the step rendered an empty deed and no clauses.
 *
 * <p>Hence the boxed component and the compact constructor. These two tests are
 * the contract: absent means a tenancy preview, present is honoured.
 */
class AgreementPreviewQueryJsonTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void onboardingOmitsTemplateOnlyAndStillParses() {
        String body = """
                {
                  "propertyId": "595bd36b-c7f4-403e-b07c-47c5229db23a",
                  "roomId": "30a68de5-8317-4e42-8915-fadf519cb5c2",
                  "rentAmountPaise": 800000,
                  "depositAmountPaise": 500000,
                  "startDate": "2026-09-18",
                  "validityMonths": null,
                  "earlyExitRule": "Pays the remaining months",
                  "template": {
                    "excludedMainClauses": [],
                    "miscClauses": [],
                    "customClauses": [],
                    "defaultValidityMonths": null,
                    "defaultEarlyExitRule": ""
                  },
                  "tenant": {
                    "fullName": "Test Tenant",
                    "phone": "+919000000000",
                    "permanentAddress": null,
                    "permanentAddressPincode": null,
                    "dateOfBirth": null,
                    "gender": null
                  }
                }
                """;

        AgreementPreviewQuery parsed = mapper.readValue(body, AgreementPreviewQuery.class);

        assertThat(parsed.templateOnly()).isFalse();
        assertThat(parsed.tenant().fullName()).isEqualTo("Test Tenant");
    }

    @Test
    void theSettingsScreenStillAsksForATemplatePreview() {
        String body = """
                {
                  "propertyId": "595bd36b-c7f4-403e-b07c-47c5229db23a",
                  "templateOnly": true
                }
                """;

        assertThat(mapper.readValue(body, AgreementPreviewQuery.class).templateOnly()).isTrue();
    }
}
