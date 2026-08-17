package com.khatiyan.d_modules.enquiry.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;

@Repository
public interface EnquiryResponseRepository extends JpaRepository<EnquiryResponse, UUID> {

    /**
     * Responses for a page of enquiries, fetched in one query.
     *
     * <p>A list returning many rows would otherwise do one lookup per card just
     * to print "Call-back promised".
     */
    List<EnquiryResponse> findByEnquiryIdInOrderByCreatedAtDesc(Collection<UUID> enquiryIds);
}
