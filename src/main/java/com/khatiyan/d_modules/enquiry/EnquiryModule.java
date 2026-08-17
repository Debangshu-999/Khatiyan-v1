package com.khatiyan.d_modules.enquiry;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;

/**
 * Public facade for the enquiry module.
 *
 * <p>Other modules ask questions here rather than touching the repository. Today
 * there is one question, from the owner dashboard: how many enquiries are still
 * waiting on an answer.
 */
@Component
public class EnquiryModule {

    private final EnquiryRepository enquiryRepository;

    public EnquiryModule(EnquiryRepository enquiryRepository) {
        this.enquiryRepository = enquiryRepository;
    }

    /**
     * Unanswered enquiries for a property.
     *
     * <p>Deliberately unguarded, unlike {@code EnquiryService.countOpenForProperty}:
     * the dashboard has already established that the caller manages the property
     * before it assembles anything, and re-running the permission check per
     * counter would add a query per card for an answer already known.
     */
    public long countNewForProperty(UUID propertyId) {
        return enquiryRepository.countByPropertyIdAndStatus(propertyId, EnquiryStatus.NEW);
    }
}
