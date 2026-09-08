package com.khatiyan.d_modules.enquiry.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.enquiry.model.EnquiryChannelConsent;

@Repository
public interface EnquiryChannelConsentRepository extends JpaRepository<EnquiryChannelConsent, UUID> {

    /**
     * Every live grant for one person.
     *
     * <p>
     * Revoked rows are history and never take part in a decision, so the filter
     * lives here rather than being re-applied at each call site.
     */
    List<EnquiryChannelConsent> findByUserIdAndRevokedAtIsNull(UUID userId);

    /**
     * Live grants for a batch of people, for the management list.
     *
     * <p>
     * A property's enquiry list renders every card's channels, and without this
     * that is one query per card.
     */
    List<EnquiryChannelConsent> findByUserIdInAndRevokedAtIsNull(Collection<UUID> userIds);
}
