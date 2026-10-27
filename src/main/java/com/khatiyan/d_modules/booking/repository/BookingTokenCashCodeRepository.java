package com.khatiyan.d_modules.booking.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingTokenCashCode;

@Repository
public interface BookingTokenCashCodeRepository extends JpaRepository<BookingTokenCashCode, UUID> {

    /** The code sent last for this token. */
    Optional<BookingTokenCashCode> findFirstByTokenIdOrderByRequestedAtDesc(UUID tokenId);

    /** Codes still live for a number. The OTP store holds one per number, so a new one retires these. */
    List<BookingTokenCashCode> findByPhoneAndConsumedAtIsNullAndExpiresAtAfter(String phone, Instant now);
}
