package com.khatiyan.d_modules.compliance.api.dto;

import java.util.List;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementPreamble;

/**
 * A whole deed, for the screens that render one without an agreement row behind
 * it — the onboarding review and the property's own settings preview.
 *
 * <p>Replaces a bare {@code List<AgreementClause>}. The clause list alone was
 * never the document: it starts at "1. Period", with no title, no parties and no
 * recital saying which room is being licensed.
 */
public record AgreementDeedResponse(
        AgreementPreamble preamble,
        List<AgreementClause> clauses) {
}
