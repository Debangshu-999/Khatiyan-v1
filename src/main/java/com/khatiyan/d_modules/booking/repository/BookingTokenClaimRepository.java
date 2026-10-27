package com.khatiyan.d_modules.booking.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingTokenClaim;

@Repository
public interface BookingTokenClaimRepository extends JpaRepository<BookingTokenClaim, UUID> {

    /** A token's claims, first to last. A handful at most: each refusal allows one more. */
    List<BookingTokenClaim> findByTokenIdOrderBySequenceAsc(UUID tokenId);
}
