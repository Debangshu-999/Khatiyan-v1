package com.khatiyan.d_modules.booking.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingSettings;

import jakarta.persistence.LockModeType;

@Repository
public interface BookingSettingsRepository extends JpaRepository<BookingSettings, UUID> {

    /** Locked for the rest of the transaction, for taking a turn. Lock it after any request row, never before. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT settings FROM BookingSettings settings WHERE settings.propertyId = :propertyId")
    Optional<BookingSettings> findByPropertyIdForUpdate(UUID propertyId);
}
