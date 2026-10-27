package com.khatiyan.d_modules.booking.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingRequestOffer;

@Repository
public interface BookingRequestOfferRepository extends JpaRepository<BookingRequestOffer, UUID> {

    /** Every offer on one request, in the order it was made. A handful at most. */
    List<BookingRequestOffer> findByRequestIdOrderBySequenceAsc(UUID requestId);
}
