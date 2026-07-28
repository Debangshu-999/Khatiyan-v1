package com.khatiyan.d_modules.compliance.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementStatus;
import com.khatiyan.d_modules.compliance.model.TenancyAgreement;

public record TenancyAgreementResponse(
        UUID id,
        UUID tenancyId,
        UUID propertyId,
        AgreementStatus status,
        List<AgreementClause> clauses,
        String contentHash,
        UUID acceptedByUserId,
        Instant acceptedAt) {

    public static TenancyAgreementResponse from(TenancyAgreement agreement) {
        return new TenancyAgreementResponse(
                agreement.getId(),
                agreement.getTenancyId(),
                agreement.getPropertyId(),
                agreement.getStatus(),
                agreement.getClauses(),
                agreement.getContentHash(),
                agreement.getAcceptedByUserId(),
                agreement.getAcceptedAt());
    }
}
