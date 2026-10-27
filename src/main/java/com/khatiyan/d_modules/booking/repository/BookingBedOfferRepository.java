package com.khatiyan.d_modules.booking.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingBedOffer;

@Repository
public interface BookingBedOfferRepository extends JpaRepository<BookingBedOffer, UUID> {

    /** Every bed offered on a booking, first to last. A handful at most. */
    List<BookingBedOffer> findByRequestIdOrderBySequenceAsc(UUID requestId);
}
