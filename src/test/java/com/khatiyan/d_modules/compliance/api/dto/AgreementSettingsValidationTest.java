package com.khatiyan.d_modules.compliance.api.dto;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import jakarta.validation.Validation;

class AgreementSettingsValidationTest {
    @Test
    void saveRequestRejectsTermsOutsideOneToEleven() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (int months : new int[] { 0, -1, 12, 13, 24 }) {
                var request = request(months);
                assertThat(validator.validate(request)).anySatisfy(violation ->
                        assertThat(violation.getPropertyPath().toString()).isEqualTo("template.defaultValidityMonths"));
            }
            for (Integer months : new Integer[] { null, 1, 10, 11 }) {
                assertThat(validator.validate(request(months))).isEmpty();
            }
        }
    }

    @Test
    void onboardingTermHoldsTheSameBounds() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (int months : new int[] { 0, -1, 12, 13, 24 }) {
                assertThat(validator.validate(new OnboardTenancyWithAgreementRequest.AgreementTermInput(months, "")))
                        .anySatisfy(violation ->
                                assertThat(violation.getPropertyPath().toString()).isEqualTo("months"));
            }
            for (Integer months : new Integer[] { null, 1, 10, 11 }) {
                assertThat(validator.validate(new OnboardTenancyWithAgreementRequest.AgreementTermInput(months, "")))
                        .isEmpty();
            }
        }
    }

    private UpdatePropertyAgreementSettingsRequest request(Integer months) {
        return new UpdatePropertyAgreementSettingsRequest(new AgreementTemplate(Set.of(), List.of(), List.of(), months, ""));
    }
}
