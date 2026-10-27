package com.khatiyan.d_modules.lead.api.dto;

import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;

/**
 * Why a record is marked a duplicate or potential spam (user, 2026-10-17).
 *
 * @param flag         duplicate for one or two earlier walkaways, potential spam for three or more
 * @param earlierLeads how many of the person's earlier records here ended for
 *                     their own reason, since they last moved in
 * @param reason       the words to show the owner
 * @param latest       the latest of those earlier records
 */
public record LeadRepeatResponse(LeadRepeatFlag flag, int earlierLeads, String reason, LeadLinkRef latest) {

    /** Null for a record that is neither. */
    public static LeadRepeatResponse of(Lead lead, Lead latest) {
        LeadRepeatFlag flag = lead.repeatFlag();
        if (flag == null) {
            return null;
        }
        return new LeadRepeatResponse(
                flag, lead.getEarlierWalkaways(), LeadRepeatFlag.reasonFor(lead.getEarlierWalkaways()),
                LeadLinkRef.of(latest));
    }
}
