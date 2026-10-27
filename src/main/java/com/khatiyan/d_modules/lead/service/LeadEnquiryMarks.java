package com.khatiyan.d_modules.lead.service;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.enquiry.EnquiryLeadMarks;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryRepeatFlag;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryRepeatMark;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.repository.LeadRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository.EnquiryWalkaways;

/** The enquiry module's view of the duplicate and potential spam marks. */
@Service
public class LeadEnquiryMarks implements EnquiryLeadMarks {

    private final LeadRepository leadRepository;

    public LeadEnquiryMarks(LeadRepository leadRepository) {
        this.leadRepository = leadRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, EnquiryRepeatMark> marksOn(Collection<UUID> enquiryIds) {
        Map<UUID, EnquiryRepeatMark> marks = new HashMap<>();
        if (enquiryIds.isEmpty()) {
            return marks;
        }
        for (EnquiryWalkaways each : leadRepository.findRepeatsByEnquiryIds(enquiryIds)) {
            LeadRepeatFlag flag = LeadRepeatFlag.of(each.getWalkaways());
            if (flag != null) {
                marks.put(each.getEnquiryId(), new EnquiryRepeatMark(
                        EnquiryRepeatFlag.valueOf(flag.name()), each.getWalkaways(),
                        LeadRepeatFlag.reasonFor(each.getWalkaways())));
            }
        }
        return marks;
    }
}
