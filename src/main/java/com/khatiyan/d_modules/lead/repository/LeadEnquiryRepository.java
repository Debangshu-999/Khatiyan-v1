package com.khatiyan.d_modules.lead.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.lead.model.LeadEnquiry;

@Repository
public interface LeadEnquiryRepository extends JpaRepository<LeadEnquiry, UUID> {

    /** Every enquiry gathered under one lead. A handful at most: one person, one property. */
    List<LeadEnquiry> findByLeadId(UUID leadId);
}
