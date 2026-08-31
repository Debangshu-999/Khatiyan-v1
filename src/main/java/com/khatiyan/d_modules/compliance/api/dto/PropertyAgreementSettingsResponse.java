package com.khatiyan.d_modules.compliance.api.dto;

import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.compliance.model.MainClauseType;
import com.khatiyan.d_modules.compliance.model.PropertyAgreementSettings;

/**
 * What the agreement settings screen needs: the owner's choices, the deed those
 * choices produce, and what they have dropped.
 *
 * @param preview the full deed as the property would issue it, with every value
 *                onboarding supplies rendered as a named placeholder rather than
 *                omitted. An owner deciding which clauses to keep is deciding
 *                about sentences, not about clause names in a list.
 * @param availableMainClauses the main clauses the owner has dropped. Sent
 *                explicitly rather than left for the client to derive by
 *                subtracting the preview from the enum — a dropped clause has to
 *                be visibly re-addable, and a client computing that itself would
 *                also have to know which clauses are merely vacuous.
 */
public record PropertyAgreementSettingsResponse(
        UUID propertyId,
        AgreementTemplate template,
        AgreementDeedResponse preview,
        List<MainClauseType> availableMainClauses) {

    public static PropertyAgreementSettingsResponse of(
            PropertyAgreementSettings settings, AgreementDeedResponse preview) {
        return new PropertyAgreementSettingsResponse(
                settings.getPropertyId(),
                settings.getTemplate(),
                preview,
                settings.getTemplate().availableMainClauses());
    }
}
