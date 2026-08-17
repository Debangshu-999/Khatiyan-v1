package com.khatiyan.d_modules.enquiry.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;

@Repository
public interface EnquiryRepository extends JpaRepository<Enquiry, UUID> {

    /** The owner's list for the active property, newest first. */
    List<Enquiry> findByPropertyIdOrderByCreatedAtDesc(UUID propertyId);

    long countByPropertyIdAndStatus(UUID propertyId, EnquiryStatus status);

    /**
     * The open enquiry this person already has against this property, if any.
     *
     * <p>Drives the profile button turning into "Enquiry sent". The database
     * enforces the same rule with a partial unique index — this is what lets the
     * UI say so before the insert fails.
     */
    Optional<Enquiry> findByPropertyIdAndEnquirerUserIdAndStatus(
            UUID propertyId, UUID enquirerUserId, EnquiryStatus status);
}
