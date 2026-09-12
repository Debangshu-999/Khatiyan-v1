package com.khatiyan.d_modules.enquiry.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;

@Repository
public interface EnquiryRepository extends JpaRepository<Enquiry, UUID> {

    /**
     * The owner's list for the active property, newest first.
     *
     * <p>Drops enquiries that expired more than a day ago. Expiry alone does not
     * hide one: an expired enquiry stays on the list, greyed and unactionable,
     * for a further day, so nothing disappears between two glances at the
     * screen.
     */
    @Query("""
            SELECT enquiry
            FROM Enquiry enquiry
            WHERE enquiry.propertyId = :propertyId
              AND (enquiry.status <> com.khatiyan.d_modules.enquiry.model.EnquiryStatus.EXPIRED
                   OR enquiry.expiresAt > :hiddenBefore)
            ORDER BY enquiry.createdAt DESC
            """)
    List<Enquiry> findVisibleForProperty(UUID propertyId, Instant hiddenBefore);

    /**
     * Open enquiries whose date has passed, for the sweep that ages them out.
     */
    @Query("""
            SELECT enquiry
            FROM Enquiry enquiry
            WHERE enquiry.status = com.khatiyan.d_modules.enquiry.model.EnquiryStatus.NEW
              AND enquiry.expiresAt <= :now
            """)
    List<Enquiry> findOpenPastExpiry(Instant now);

    /**
     * Enquiries still genuinely waiting on an answer.
     *
     * <p>Counting by status alone counted the ones whose deadline had passed but
     * whose sweep had not run yet, so every badge in the app read high between
     * the cron's runs — and pointed the owner at questions the enquirer had
     * already been freed to raise again.
     */
    @Query("""
            SELECT COUNT(enquiry)
            FROM Enquiry enquiry
            WHERE enquiry.propertyId = :propertyId
              AND enquiry.status = com.khatiyan.d_modules.enquiry.model.EnquiryStatus.NEW
              AND enquiry.expiresAt > :now
            """)
    long countAwaitingAnswer(UUID propertyId, Instant now);

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
