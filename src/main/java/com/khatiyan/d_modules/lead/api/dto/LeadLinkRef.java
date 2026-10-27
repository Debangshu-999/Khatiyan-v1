package com.khatiyan.d_modules.lead.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.lead.model.Lead;

/** Another lead this one points at, by the short code people are shown. */
public record LeadLinkRef(UUID id, String referenceCode) {

    public static LeadLinkRef of(Lead lead) {
        return lead == null ? null : new LeadLinkRef(lead.getId(), lead.getReferenceCode());
    }
}
