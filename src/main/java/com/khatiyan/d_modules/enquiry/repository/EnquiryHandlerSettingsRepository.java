package com.khatiyan.d_modules.enquiry.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerSettings;

import jakarta.persistence.LockModeType;

@Repository
public interface EnquiryHandlerSettingsRepository extends JpaRepository<EnquiryHandlerSettings, UUID> {

    Optional<EnquiryHandlerSettings> findByPropertyId(UUID propertyId);

    /**
     * The settings, locked for the rest of the transaction.
     *
     * <p>For taking a system turn. Two enquiries arriving together would
     * otherwise both read the same "last turn" and both go to the same manager,
     * which is exactly the unevenness the mode exists to prevent.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT settings
            FROM EnquiryHandlerSettings settings
            WHERE settings.propertyId = :propertyId
            """)
    Optional<EnquiryHandlerSettings> findByPropertyIdForUpdate(UUID propertyId);
}
