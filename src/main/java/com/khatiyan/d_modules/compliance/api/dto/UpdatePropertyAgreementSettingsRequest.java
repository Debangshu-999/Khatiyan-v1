package com.khatiyan.d_modules.compliance.api.dto;

import com.khatiyan.d_modules.compliance.model.AgreementTemplate;

import jakarta.validation.constraints.NotNull;

/**
 * Replaces a property's agreement template wholesale.
 *
 * <p>Wholesale rather than as a patch because the template IS the set of
 * choices: a partial update would have to say what "absent" means for the
 * exclusion set, and either answer is a trap — omitting it would silently
 * restore every dropped clause, or silently keep drops the owner just cleared.
 */
public record UpdatePropertyAgreementSettingsRequest(
        @NotNull AgreementTemplate template) {
}
